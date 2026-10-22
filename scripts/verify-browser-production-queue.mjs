// Browser checks use mocked auth and API data; no live database requests.
import assert from "node:assert/strict";
const { chromium, expect } = await import(process.argv[2] || "playwright/test");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const people = [
  {id:id(1),full_name:"QA Superadmin",role:"superadmin",is_active:true},
  {id:id(2),full_name:"ຜູ້ວາງ A",role:"production",is_active:true},
  {id:id(3),full_name:"ຜູ້ວາງ B",role:"production",is_active:true},
  {id:id(4),full_name:"QA Disabled Planner",role:"production",is_active:false},
];
const now = new Date(), year = now.getFullYear(), month = now.getMonth()+1;
const date = `${year}-${String(month).padStart(2,"0")}-22`;
const build = (n,owner,qty,status="queued",queueMonth=month) => ({
  id:id(n+10),queue_date:`${year}-${String(queueMonth).padStart(2,"0")}-22`,queue_year:year,queue_month:queueMonth,queue_number:`000${n}`,queue_sequence:n,
  order_no:`${queueMonth}00${n}`,planner_user_id:owner,status,workload_piece_qty:qty,
  created_at:`${date}T10:00:00Z`,updated_at:`${date}T10:00:00Z`,factory_deposit_order_id:id(n+100),
  deposit:{id:id(n+100),deposit_no:`DP-${n}`,order_code:`ORDER-${n}`,status:"submitted",customer_name:`Customer ${n}`,customer_phone:"2099999999",team_name:"BG SPORT",fabric_name:"QA Fabric",
    short_qty:qty,long_qty:0,free_qty:0,qty_3xl:0,qty_4xl:0,qty_5xl:0,qty_6xl:0,production_items:[],pants_items:[],production_sent_date:date,delivery_date:date,production_priority:"normal"},
});
const seed = [build(1,id(2),12),build(2,id(3),6),build(3,id(3),6),build(4,id(2),5,"sent_to_factory",month===1?12:month-1),build(5,id(4),100,"sent_to_factory")];
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
const errors = [], mutations = [];
async function open(viewer, path="") {
  let rows=structuredClone(seed);
  const authUser={id:viewer.id,email:"qa@example.invalid",aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{},created_at:`${date}T00:00:00Z`};
  const profile={...viewer,auth_user_id:viewer.id,email:authUser.email,permission_settings:{}};
  const session={access_token:"qa-token",refresh_token:"qa-refresh",expires_at:Math.floor(Date.now()/1000)+3600,token_type:"bearer",user:authUser};
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${backend.hostname.split(".")[0]}-auth-token`,session});
  await context.route(`${backend.origin}/**`,async route=>{
    const url=new URL(route.request().url());
    let data=url.pathname==="/auth/v1/user"?authUser:url.pathname.endsWith("/users")?[profile]:[];
    if(route.request().headers().accept?.includes("vnd.pgrst.object")&&Array.isArray(data)) data=data[0]??null;
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  });
  await context.route("**/api/**",async route=>{
    const req=route.request(),url=new URL(req.url());let data={counts:{}};
    if(url.pathname.startsWith("/api/factory-production/queue")){
      if(req.method()==="PATCH"){
        const body=req.postDataJSON();mutations.push(body);
        for(const row of rows) if((body.ids||[body.id]).includes(row.id)) row.status=body.targetStatus;
        data={ok:true};
      } else if(url.pathname==="/api/factory-production/queue"){
        // Return every owner to also exercise the client's defensive filter.
        data={rows,users:people,profile};
      } else {
        const row=rows.find(row=>row.id===url.pathname.split("/").pop());
        data={row,users:people,profile};
      }
    }
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  });
  const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));
  await page.goto(`${process.env.TEST_BASE_URL||"http://localhost:3000"}/factory-production-queue${path}`,{waitUntil:"networkidle"});
  return {context,page};
}
try {
  const {context,page}=await open(people[1]);
  await expect(page.locator("tbody tr")).toHaveCount(1);await expect(page.locator("tbody")).toContainText("ORDER-1");
  await expect(page.locator("tbody")).not.toContainText("ORDER-2");
  await expect(page.getByRole("combobox",{name:"ຜູ້ວາງຜະລິດ"})).toBeDisabled();
  await expect(page.getByRole("button",{name:"ກົດຮັບງານ",exact:true})).toHaveCount(0);
  await page.screenshot({path:"/tmp/bg-production-queue-worker.png",fullPage:true});
  await page.getByRole("button",{name:"ເລີ່ມວາງ Pattern",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(seed[0].id));
  await expect(page.getByText("ແກ້ໄຂຊື່ຜູ້ຮັບຜິດຊອບ",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.getByRole("button",{name:"ຢືນຢັນການວາງ Pattern ສຳເລັດ",exact:true}).click();
  await expect(page).toHaveURL(/pattern-laid$/);await expect(page.locator("tbody tr")).toHaveCount(1);
  assert.equal(mutations.at(-1).targetStatus,"pattern_laid");
  await page.goto(`${process.env.TEST_BASE_URL||"http://localhost:3000"}/factory-production-queue/activity`,{waitUntil:"networkidle"});
  await expect(page.locator("tbody tr")).toHaveCount(1);await expect(page.locator("tbody")).toContainText("ຜູ້ວາງ A");
  await expect(page.locator("tbody")).not.toContainText("ຜູ້ວາງ B");await expect(page.locator("tbody")).toContainText("12 ຜືນ");
  await context.close();
  const admin=await open(people[0]);
  const owner=admin.page.getByRole("combobox",{name:"ຜູ້ວາງຜະລິດ"});await expect(owner).toBeEnabled();
  await expect(admin.page.locator("tbody tr")).toHaveCount(1);
  await expect(owner.locator('option[value="ALL"]')).toHaveCount(0);
  await expect(owner.locator(`option[value="${id(4)}"]`)).toHaveCount(0);
  // Ignore a saved selection after that account has been disabled.
  await admin.page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:`production-planner:${id(1)}:queue`,value:id(4)});
  await admin.page.reload({waitUntil:"networkidle"});
  await expect(owner).toHaveValue(id(2));
  await expect(admin.page.locator("tbody")).not.toContainText("ORDER-5");
  await owner.selectOption(id(3));await expect(admin.page.locator("tbody tr")).toHaveCount(2);
  await expect(admin.page.locator("tbody")).not.toContainText("ORDER-1");
  await admin.page.goto(`${process.env.TEST_BASE_URL||"http://localhost:3000"}/factory-production-queue/activity`,{waitUntil:"networkidle"});
  await expect(admin.page.locator("tbody tr")).toHaveCount(2);
  await expect(admin.page.locator("tbody tr").nth(0)).toContainText("12 ຜືນ");
  await expect(admin.page.locator("tbody tr").nth(1)).toContainText("12 ຜືນ");
  await expect(admin.page.getByRole("combobox",{name:"ຜູ້ວາງຜະລິດ"}).locator(`option[value="${id(4)}"]`)).toHaveCount(0);
  await expect(admin.page.locator("tbody")).not.toContainText("QA Disabled Planner");
  await expect(admin.page.locator("tbody tr").nth(0)).toContainText("50%");
  await expect(admin.page.locator("tbody tr").nth(1)).toContainText("50%");
  await admin.page.screenshot({path:"/tmp/bg-production-queue-summary.png",fullPage:true});
  await admin.page.setViewportSize({width:390,height:844});
  assert.ok(await admin.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"Mobile tables scroll within the page");
  await admin.context.close();assert.deepEqual(errors,[]);
  console.log("Production queue browser passed: private queues, superadmin per-ID selector, automatic owner details, status workflow, filtered monthly summary and mobile layout.");
} finally {await browser.close();}
