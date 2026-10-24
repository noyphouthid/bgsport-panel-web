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
  {id:id(5),full_name:"QA Disabled Superadmin",role:"superadmin",is_active:false},
];
const now = new Date(), year = now.getFullYear(), month = now.getMonth()+1;
const date = `${year}-${String(month).padStart(2,"0")}-22`;
const build = (n,owner,qty,status="queued",queueMonth=month) => ({
  id:id(n+10),queue_date:`${year}-${String(queueMonth).padStart(2,"0")}-22`,queue_year:year,queue_month:queueMonth,queue_number:`000${n}`,queue_sequence:n,
  order_no:`${queueMonth}00${n}`,planner_user_id:owner,pattern_user_id:owner,print_user_id:owner,dispatch_user_id:owner,pattern_completed_at:null,print_started_at:null,production_completed_at:["awaiting_factory","sent_to_factory"].includes(status)?`${year}-${String(queueMonth).padStart(2,"0")}-22T11:00:00Z`:null,status,workload_piece_qty:qty,
  created_at:`${date}T10:00:00Z`,updated_at:`${date}T10:00:00Z`,factory_deposit_order_id:id(n+100),
  deposit:{id:id(n+100),deposit_no:`DP-${n}`,order_code:`ORDER-${n}`,status:"submitted",production_queue_legacy:false,production_queue_entered_at:`${date}T10:00:00Z`,customer_name:`Customer ${n}`,customer_phone:"2099999999",team_name:"BG SPORT",fabric_name:"QA Fabric",
    short_qty:qty,long_qty:0,free_qty:0,qty_3xl:0,qty_4xl:0,qty_5xl:0,qty_6xl:0,production_items:[],pants_items:[],production_sent_date:date,delivery_date:date,production_priority:"normal"},
});
const seed = [build(1,id(2),12),build(2,id(3),6),build(3,id(3),6),build(4,id(2),5,"sent_to_factory",month===1?12:month-1),build(5,id(4),100,"sent_to_factory")];
const legacy = build(6,id(2),5000);
legacy.deposit.production_queue_legacy=true;legacy.deposit.production_queue_entered_at=null;
seed.push(legacy);
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
const errors = [], mutations = [], detailRequests = [], listRequests = [];
async function open(viewer, path="", sourceRows=seed, mockClock=false) {
  let rows=structuredClone(sourceRows);
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
    if(url.pathname==="/api/factory-production/queue/summary") {
      const selected=viewer.role==="superadmin"?(url.searchParams.get("planner")||"ALL"):viewer.id;
      const ids=row=>[...new Set([row.pattern_user_id,row.print_user_id].filter(Boolean))];
      const period=rows.filter(row=>{
        if(row.deposit.production_queue_legacy||!row.deposit.production_queue_entered_at||!row.production_completed_at)return false;
        const local=new Date(Date.parse(row.production_completed_at)+7*60*60*1000);
        return (url.searchParams.get("year")==="ALL"||local.getUTCFullYear()===Number(url.searchParams.get("year")))&&(url.searchParams.get("month")==="ALL"||local.getUTCMonth()+1===Number(url.searchParams.get("month")));
      });
      const visiblePeople=people.filter(user=>user.is_active&&["superadmin","production"].includes(user.role)&&(viewer.role==="superadmin"||user.id===viewer.id));
      const shown=visiblePeople.filter(user=>selected==="ALL"||user.id===selected);
      const done=period.filter(row=>["awaiting_factory","sent_to_factory"].includes(row.status));
      data={profile,users:visiblePeople,selectedPlanner:selected,
        summaries:shown.map(user=>{const own=done.filter(row=>ids(row).includes(user.id));return {userId:user.id,fullName:user.full_name,assignedOrderCount:period.filter(row=>ids(row).includes(user.id)).length,completedOrderCount:own.length,completedPieceQty:own.reduce((sum,row)=>sum+row.workload_piece_qty/ids(row).length,0),awaitingCount:own.filter(row=>row.status==="awaiting_factory").length,sentCount:own.filter(row=>row.status==="sent_to_factory").length};}),
        completed:shown.flatMap(user=>done.filter(row=>ids(row).includes(user.id)).map(row=>({id:row.id,userId:user.id,fullName:user.full_name,queueNumber:row.queue_number,orderCode:row.deposit.order_code,customerName:row.deposit.customer_name,status:row.status,completedAt:row.production_completed_at,totalPieceQty:row.workload_piece_qty,participantCount:ids(row).length,creditedPieceQty:row.workload_piece_qty/ids(row).length}))),
      };
    } else if(url.pathname.startsWith("/api/factory-production/queue")){
      if(req.method()==="PATCH"){
        const body=req.postDataJSON();mutations.push(body);
        for(const row of rows) if((body.ids||[body.id]).includes(row.id)) {
          if(body.action==="assign_stages") {row.pattern_user_id=body.assignments.patternUserId;row.print_user_id=body.assignments.printUserId;row.dispatch_user_id=body.assignments.dispatchUserId;row.planner_user_id=row.pattern_user_id;}
          else if(body.action==="complete_pattern") {row.pattern_completed_at=`${date}T10:30:00Z`;row.pattern_completed_by_user_id=profile.id;}
          else if(body.action==="start_print") {row.print_started_at=`${date}T10:40:00Z`;row.print_started_by_user_id=profile.id;}
          else if(body.action==="reassign") {row.planner_user_id=body.plannerUserId;row.planner_reassigned_at=`${date}T12:00:00Z`;}
          else {
            row.status=body.targetStatus;
            if(body.targetStatus==="in_production") {row.production_started_at=`${date}T10:00:00Z`;row.production_started_by_user_id=profile.id;}
            if(body.targetStatus==="awaiting_factory") {row.production_completed_at=`${date}T11:00:00Z`;row.production_completed_by_user_id=profile.id;}
            if(body.targetStatus==="sent_to_factory") {row.sent_to_factory_at=`${date}T12:00:00Z`;row.sent_to_factory_by_user_id=profile.id;}
          }
        }
        data={ok:true};
      } else if(url.pathname==="/api/factory-production/queue"){
        listRequests.push(url.search);
        // Return every owner to also exercise the client's defensive filter.
        data={rows,users:people,profile,startedAt:`${date}T00:00:00Z`};
      } else {
        detailRequests.push({id:url.pathname.split("/").pop(),view:url.searchParams.get("view")});
        const row=rows.find(row=>row.id===url.pathname.split("/").pop());
        data={row,users:people,profile};
      }
    }
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  });
  const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));
  if(mockClock)await page.clock.install();
  await page.goto(`${process.env.TEST_BASE_URL||"http://localhost:3000"}/factory-production-queue${path}`,{waitUntil:"networkidle"});
  return {context,page,replaceRows(next){rows=structuredClone(next);}};
}
try {
  const {context,page}=await open(people[1]);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("ORDER-1");
  await expect(page.locator("tbody")).not.toContainText("ORDER-2");
  await expect(page.getByRole("combobox",{name:"ຜູ້ວາງຜະລິດ"})).toBeDisabled();
  await expect(page.getByRole("button",{name:"ແກ້ໄຂຜູ້ຮັບຜິດຊອບ",exact:true})).toHaveCount(0);
  await expect(page.locator("tbody img")).toHaveCount(0);
  assert.equal(detailRequests.length,0,"Opening a queue must not load any full order details");
  assert.ok(listRequests.every(query=>!query.includes("sync")),"Opening queues never starts a global deposit sync");
  await expect(page.getByRole("heading",{name:"ຂໍ້ມູນອໍເດີ້",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"ເລີ່ມວາງຜະລິດ",exact:true}).click();
  await expect(page).toHaveURL(/in-production$/);
  await expect(page.locator("tbody")).toContainText("ກຳລັງວາງຜະລິດ");
  assert.equal(detailRequests.length,0,"Starting a job must be a direct status action without fetching the sheet");
  await page.getByRole("button",{name:"ວາງ Pattern ສຳເລັດແລ້ວ",exact:true}).click();
  await page.getByRole("button",{name:"ເລີ່ມວາງພ້ອມພິມ",exact:true}).click();
  await page.getByRole("button",{name:"ວາງພ້ອມພິມສຳເລັດແລ້ວ",exact:true}).click();
  await expect(page).toHaveURL(/awaiting-factory$/);
  await expect(page.locator("tbody")).toContainText("ລໍຖ້າສົ່ງໂຮງງານ");
  assert.equal(detailRequests.length,0,"Completing production must not load the print sheet");
  await page.screenshot({path:"/tmp/bg-production-queue-awaiting.png",fullPage:true});
  await page.getByRole("button",{name:"ກວດກ່ອນສົ່ງໂຮງງານ",exact:true}).click();
  await expect(page.getByRole("heading",{name:"ກວດກ່ອນຢືນຢັນການສົ່ງໂຮງງານ",exact:true})).toBeVisible();
  assert.equal(detailRequests.at(-1).view,null,"Only the factory review requests the full sheet");
  await page.getByRole("button",{name:"ຢືນຢັນການສົ່ງໂຮງງານ",exact:true}).click();
  await expect(page).toHaveURL(/sent-to-factory$/);
  await expect(page.locator("tbody")).toContainText("ORDER-1");
  assert.deepEqual(mutations.filter(m=>m.action==="update_status").map(m=>m.targetStatus),["in_production","awaiting_factory","sent_to_factory"]);
  await page.getByRole("link",{name:"ເບິ່ງຂໍ້ມູນງານ",exact:true}).first().click();
  await expect(page).toHaveURL(new RegExp(`/records/${id(11)}$`));
  for(const heading of ["ຂໍ້ມູນອໍເດີ້","ຂໍ້ມູນການລົງສະຖານະ","ຂະບວນການ 3 ຂັ້ນຕອນ"]) await expect(page.getByRole("heading",{name:heading,exact:true})).toBeVisible();
  assert.equal(detailRequests.at(-1).view,"record","The new records detail requests metadata only");
  await page.screenshot({path:"/tmp/bg-production-record-detail.png",fullPage:true});
  await page.goto(`${process.env.TEST_BASE_URL||"http://localhost:3000"}/factory-production-queue/records`,{waitUntil:"networkidle"});
  await expect(page.getByRole("heading",{name:"ລາຍການວາງຜະລິດ",exact:true})).toBeVisible();
  await expect(page.locator("tbody")).toContainText("ORDER-1");
  await expect(page.locator("tbody")).not.toContainText("ORDER-2");
  await expect(page.locator("tbody")).not.toContainText("ORDER-6");
  await page.goto(`${process.env.TEST_BASE_URL||"http://localhost:3000"}/factory-production-queue/activity`,{waitUntil:"networkidle"});
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("12 ຜືນ");
  await expect(page.locator("tbody")).not.toContainText("ຜູ້ວາງ B");
  await context.close();

  const admin=await open(people[0]);
  const owner=admin.page.getByRole("combobox",{name:"ຜູ້ວາງຜະລິດ"});
  await expect(owner).toBeEnabled();
  await expect(owner.locator('option[value="ALL"]')).toHaveCount(0);
  await expect(owner.locator(`option[value="${id(4)}"]`)).toHaveCount(0);
  await admin.page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:`production-planner:${id(1)}:queue`,value:id(4)});
  await admin.page.reload({waitUntil:"networkidle"});
  await expect(owner).toHaveValue(id(2));
  await expect(admin.page.locator("tbody")).not.toContainText("ORDER-6");
  await owner.selectOption(id(3));
  await expect(admin.page.locator("tbody tr")).toHaveCount(2);
  await expect(admin.page.getByRole("button",{name:"ເລີ່ມວາງຜະລິດ",exact:true}).nth(0)).toBeEnabled();
  await expect(admin.page.getByRole("button",{name:"ເລີ່ມວາງຜະລິດ",exact:true}).nth(1)).toBeDisabled();
  await admin.page.goto(`${process.env.TEST_BASE_URL||"http://localhost:3000"}/factory-production-queue/activity`,{waitUntil:"networkidle"});
  await expect(admin.page.locator("tbody tr")).toHaveCount(3);
  for(const tr of await admin.page.locator("tbody tr").all()) await expect(tr).toContainText("0 ຜືນ");
  await expect(admin.page.locator("tbody")).not.toContainText("QA Disabled Planner");
  await admin.page.goto(`${process.env.TEST_BASE_URL||"http://localhost:3000"}/factory-production-queue`,{waitUntil:"networkidle"});
  await owner.selectOption(id(2));
  await admin.page.getByRole("button",{name:"ແກ້ໄຂຜູ້ຮັບຜິດຊອບ",exact:true}).click();
  const dialog=admin.page.getByRole("dialog");await expect(dialog).toBeVisible();
  const recipient=dialog.getByRole("combobox",{name:"ຜູ້ວາງ Pattern",exact:true});
  await expect(recipient.locator(`option[value="${id(4)}"]`)).toHaveCount(0);
  await recipient.selectOption(id(3));
  await dialog.getByRole("combobox",{name:"ຜູ້ວາງພ້ອມພິມ",exact:true}).selectOption(id(3));
  await dialog.getByRole("combobox",{name:"ຜູ້ສົ່ງໂຮງງານ",exact:true}).selectOption(id(3));
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),"The assignment dropdowns must fit inside the dialog");
  await dialog.getByRole("button",{name:"ບັນທຶກ",exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(owner).toHaveValue(id(3));
  await expect(admin.page.locator("tbody")).toContainText("ORDER-1");
  await expect(admin.page.locator("tbody tr")).toHaveCount(3);
  await owner.selectOption(id(2));await expect(admin.page.locator("tbody")).not.toContainText("ORDER-1");
  await owner.selectOption(id(3));
  await admin.page.screenshot({path:"/tmp/bg-production-lightweight-queue.png",fullPage:true});
  await admin.page.setViewportSize({width:390,height:844});
  assert.ok(await admin.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"Mobile tables scroll within the page");
  await admin.context.close();
  const paged=await open(people[1],"/records",Array.from({length:45},(_,i)=>build(i+20,id(2),1)));
  await expect(paged.page.locator("tbody tr")).toHaveCount(20);
  await paged.page.getByRole("button",{name:"ໜ້າຖັດໄປ",exact:true}).click();
  await expect(paged.page.locator("tbody tr")).toHaveCount(20);
  await paged.page.getByRole("button",{name:"ໜ້າຖັດໄປ",exact:true}).click();
  await expect(paged.page.locator("tbody tr")).toHaveCount(5);
  await paged.page.getByRole("textbox",{name:"ຄົ້ນຫາຄິວ"}).fill("ORDER-64");
  await expect(paged.page.locator("tbody tr")).toHaveCount(1);
  await expect(paged.page.getByRole("button",{name:"ໜ້າກ່ອນໜ້າ",exact:true})).toBeDisabled();
  await paged.page.goto(`${process.env.TEST_BASE_URL||"http://localhost:3000"}/factory-production-queue`,{waitUntil:"networkidle"});
  await paged.page.getByRole("textbox",{name:"ຄົ້ນຫາຄິວ"}).fill("ORDER-64");
  await expect(paged.page.getByRole("button",{name:"ເລີ່ມວາງຜະລິດ",exact:true})).toBeDisabled();
  await paged.context.close();
  const rushRows=[build(20,id(2),1),build(21,id(2),1),build(22,id(2),1)];
  rushRows[1].deposit.production_priority="urgent";rushRows[2].deposit.production_priority="urgent";
  const rush=await open(people[1],"",rushRows);
  const rushTable=rush.page.locator("tbody tr");
  const rushStart=rush.page.getByRole("button",{name:"ເລີ່ມວາງຜະລິດ",exact:true});
  const rushNav=rush.page.getByRole("navigation",{name:"ໜ້າວາງຜະລິດ"});
  await expect(rushTable.nth(0)).toContainText("ORDER-21");
  await expect(rushTable.nth(1)).toContainText("ORDER-22");
  await expect(rushTable.nth(2)).toContainText("ORDER-20");
  await expect(rushStart.nth(0)).toBeEnabled();
  await expect(rushStart.nth(1)).toBeDisabled();
  await expect(rushStart.nth(2)).toBeDisabled();
  await rush.page.screenshot({path:"/tmp/bg-production-urgent-priority.png",fullPage:true});
  await rush.page.getByRole("textbox",{name:"ຄົ້ນຫາຄິວ"}).fill("ORDER-20");
  await expect(rushStart).toBeDisabled();
  await rush.page.getByRole("textbox",{name:"ຄົ້ນຫາຄິວ"}).fill("");
  await rushStart.nth(0).click();await expect(rush.page).toHaveURL(/in-production$/);
  await rushNav.getByRole("link",{name:"ລໍຖ້າວາງ",exact:true}).click();
  await expect(rushTable.nth(0)).toContainText("ORDER-22");
  for(const button of await rushStart.all()) await expect(button).toBeDisabled();
  await rushNav.getByRole("link",{name:"ກຳລັງວາງຜະລິດ",exact:true}).click();
  await rush.page.getByRole("button",{name:"ວາງ Pattern ສຳເລັດແລ້ວ",exact:true}).click();
  await rush.page.getByRole("button",{name:"ເລີ່ມວາງພ້ອມພິມ",exact:true}).click();
  await rush.page.getByRole("button",{name:"ວາງພ້ອມພິມສຳເລັດແລ້ວ",exact:true}).click();
  await expect(rush.page).toHaveURL(/awaiting-factory$/);
  await rushNav.getByRole("link",{name:"ລໍຖ້າວາງ",exact:true}).click();
  await expect(rushStart.nth(0)).toBeEnabled();
  await expect(rushTable.nth(0)).toContainText("ORDER-22");
  await expect(rushStart.nth(1)).toBeDisabled();
  await rush.context.close();
  const shared=build(70,id(2),10,"awaiting_factory");shared.print_user_id=id(3);shared.dispatch_user_id=id(3);
  shared.pattern_completed_at=`${date}T10:30:00Z`;shared.print_started_at=`${date}T10:40:00Z`;shared.production_completed_at=`${date}T11:00:00Z`;
  for(const person of [people[1],people[2]]) {
    const own=await open(person,"/activity",[shared]);
    await expect(own.page.locator("tbody tr")).toHaveCount(1);
    await expect(own.page.locator("tbody")).toContainText("5 ຜືນ");
    await expect(own.page.locator("tbody")).not.toContainText(person.id===id(2)?people[2].full_name:people[1].full_name);
    await expect(own.page.getByRole("combobox",{name:"ຜູ້ວາງຜະລິດ"})).toBeDisabled();
    await own.page.getByRole("link",{name:"ເບິ່ງອໍເດີ້ສຳເລັດ",exact:true}).click();
    await expect(own.page).toHaveURL(/activity\/completed\?/);
    await expect(own.page.locator("tbody tr")).toHaveCount(1);
    await expect(own.page.locator("tbody")).toContainText("ORDER-70");
    await expect(own.page.locator("tbody")).toContainText("5 ຜືນ");
    await expect(own.page.getByRole("button",{name:"ແກ້ໄຂຜູ້ຮັບຜິດຊອບ",exact:true})).toHaveCount(0);
    await own.context.close();
  }
  const carried=build(90,id(2),11,"awaiting_factory",10);carried.queue_year=2026;carried.queue_month=10;
  carried.deposit.order_code="RK26-10110+10126";carried.production_completed_at="2026-11-05T00:00:00Z";carried.print_user_id=id(3);carried.dispatch_user_id=id(3);
  const carryPage=await open(people[1],"/activity/completed?year=2026&month=10",[carried]);
  await expect(carryPage.page.locator("tbody")).not.toContainText("RK26-10110+10126");
  await carryPage.page.getByRole("combobox",{name:"ເດືອນ",exact:true}).selectOption("11");
  await expect(carryPage.page.locator("tbody")).toContainText("RK26-10110+10126");
  await expect(carryPage.page.locator("tbody")).toContainText("5.5 ຜືນ");
  await carryPage.page.getByRole("link",{name:"ຍອດສະຫຼຸບ",exact:true}).click();
  await expect(carryPage.page.locator("tbody")).toContainText("5.5 ຜືນ");
  await carryPage.context.close();
  // Already-open worker tables pick up transfers without a manual reload.
  const transfer=build(91,id(2),10);
  const oldWorker=await open(people[1],"",[transfer]);
  const newWorker=await open(people[2],"",[transfer],true);
  await expect(oldWorker.page.locator("tbody")).toContainText("ORDER-91");
  await expect(newWorker.page.locator("tbody")).not.toContainText("ORDER-91");
  transfer.planner_user_id=transfer.pattern_user_id=transfer.print_user_id=transfer.dispatch_user_id=id(3);
  oldWorker.replaceRows([transfer]);newWorker.replaceRows([transfer]);
  await oldWorker.page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(oldWorker.page.locator("tbody")).not.toContainText("ORDER-91");
  await newWorker.page.clock.runFor(30_000);
  await expect(newWorker.page.locator("tbody")).toContainText("ORDER-91");
  await oldWorker.context.close();await newWorker.context.close();
  // For an active print task, follow the print assignee rather than the Pattern assignee.
  const printJob=build(92,id(2),10,"in_production");printJob.pattern_completed_at=`${date}T10:30:00Z`;
  const printAdmin=await open(people[0],"/in-production",[printJob]);
  await printAdmin.page.getByRole("button",{name:"ແກ້ໄຂຜູ້ຮັບຜິດຊອບ",exact:true}).click();
  const printDialog=printAdmin.page.getByRole("dialog");
  await printDialog.getByRole("combobox",{name:"ຜູ້ວາງພ້ອມພິມ",exact:true}).selectOption(id(3));
  await printDialog.getByRole("button",{name:"ບັນທຶກ",exact:true}).click();
  await expect(printDialog).toHaveCount(0);
  await expect(printAdmin.page.getByRole("combobox",{name:"ຜູ້ວາງຜະລິດ",exact:true})).toHaveValue(id(3));
  await expect(printAdmin.page.locator("tbody")).toContainText("ORDER-92");
  await printAdmin.context.close();
  // Completed credits move to the new participants on the same background refresh.
  const finished=build(93,id(2),10,"awaiting_factory");
  const previousSummary=await open(people[1],"/activity/completed",[finished]);
  const recipientSummary=await open(people[2],"/activity/completed",[finished]);
  await expect(previousSummary.page.locator("tbody")).toContainText("ORDER-93");
  finished.planner_user_id=finished.pattern_user_id=finished.print_user_id=finished.dispatch_user_id=id(3);
  previousSummary.replaceRows([finished]);recipientSummary.replaceRows([finished]);
  for(const account of [previousSummary,recipientSummary]) await account.page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(previousSummary.page.locator("tbody")).not.toContainText("ORDER-93");
  await expect(recipientSummary.page.locator("tbody")).toContainText("ORDER-93");
  await expect(recipientSummary.page.locator("tbody")).toContainText("10 ຜືນ");
  await previousSummary.context.close();await recipientSummary.context.close();
  const dispatchOnly=build(94,id(2),10,"awaiting_factory");dispatchOnly.dispatch_user_id=id(3);
  const dispatchView=await open(people[2],"/awaiting-factory",[dispatchOnly]);
  await expect(dispatchView.page.locator("tbody")).toContainText("ORDER-94");
  await expect(dispatchView.page.getByRole("button",{name:"ກວດກ່ອນສົ່ງໂຮງງານ",exact:true})).toBeEnabled();
  await dispatchView.page.goto(`${process.env.TEST_BASE_URL||"http://localhost:3000"}/factory-production-queue/activity/completed`,{waitUntil:"networkidle"});
  await expect(dispatchView.page.locator("tbody")).not.toContainText("ORDER-94");
  await expect(dispatchView.page.getByText("ຍອດວາງສຳເລັດ: 0 ຜືນ",{exact:true})).toBeVisible();
  await dispatchView.page.getByRole("link",{name:"ຍອດສະຫຼຸບ",exact:true}).click();
  await expect(dispatchView.page.locator("tbody")).toContainText("0 ຜືນ");
  await dispatchView.context.close();
  const layoutView=await open(people[1],"/activity/completed",[dispatchOnly]);
  await expect(layoutView.page.locator("tbody")).toContainText("ORDER-94");
  await expect(layoutView.page.locator("tbody")).toContainText("10 ຜືນ");
  await expect(layoutView.page.locator("tbody")).toContainText("(1/1)");
  await layoutView.context.close();
  const superAssign=await open(people[0],"",[build(95,id(2),10)]);
  await superAssign.page.getByRole("button",{name:"ແກ້ໄຂຜູ້ຮັບຜິດຊອບ",exact:true}).click();
  const superDialog=superAssign.page.getByRole("dialog");
  for(const select of await superDialog.getByRole("combobox").all()) {
    await expect(select.locator(`option[value="${id(1)}"]`)).toHaveCount(1);
    await expect(select.locator(`option[value="${id(5)}"]`)).toHaveCount(0);
    await select.selectOption(id(1));
  }
  await expect(superDialog).toContainText("10 ຜືນ ÷ 1 = 10 ຜືນ/ຄົນ");
  await superDialog.getByRole("combobox",{name:"ຜູ້ວາງພ້ອມພິມ",exact:true}).selectOption(id(2));
  await expect(superDialog).toContainText("10 ຜືນ ÷ 2 = 5 ຜືນ/ຄົນ");
  await superDialog.getByRole("button",{name:"ບັນທຶກ",exact:true}).click();
  await expect(superDialog).toHaveCount(0);
  await expect(superAssign.page.getByRole("combobox",{name:"ຜູ້ວາງຜະລິດ",exact:true})).toHaveValue(id(1));
  await expect(superAssign.page.locator("tbody")).toContainText("ORDER-95");
  await superAssign.context.close();
  const superFinished=build(96,id(1),10,"awaiting_factory");superFinished.print_user_id=id(2);
  const superReport=await open(people[0],`/activity/completed?planner=${id(1)}`,[superFinished]);
  await expect(superReport.page.getByRole("combobox",{name:"ຜູ້ວາງຜະລິດ",exact:true})).toHaveValue(id(1));
  await expect(superReport.page.locator("tbody")).toContainText("ORDER-96");
  await expect(superReport.page.locator("tbody")).toContainText("5 ຜືນ");
  await superReport.page.getByRole("link",{name:"ຍອດສະຫຼຸບ",exact:true}).click();
  await expect(superReport.page.locator("tbody")).toContainText("QA Superadmin");
  await expect(superReport.page.locator("tbody")).toContainText("5 ຜືນ");
  await superReport.context.close();
  const oldName=people[2].full_name;people[2].full_name="ພະນັກງານວາງພ້ອມພິມ ".repeat(15);
  const editor=await open(people[0],"",[build(80,id(2),10)]);
  await editor.page.getByRole("button",{name:"ແກ້ໄຂຜູ້ຮັບຜິດຊອບ",exact:true}).click();
  const stageDialog=editor.page.getByRole("dialog");await expect(stageDialog.getByRole("combobox")).toHaveCount(3);
  await editor.page.setViewportSize({width:390,height:844});
  await stageDialog.getByRole("combobox",{name:"ຜູ້ສົ່ງໂຮງງານ",exact:true}).selectOption(id(3));
  await expect(stageDialog).toContainText("10 ຜືນ ÷ 1 = 10 ຜືນ/ຄົນ");
  await stageDialog.getByRole("combobox",{name:"ຜູ້ວາງພ້ອມພິມ",exact:true}).selectOption(id(3));
  await stageDialog.getByRole("combobox",{name:"ຜູ້ສົ່ງໂຮງງານ",exact:true}).selectOption(id(2));
  await expect(stageDialog).toContainText("10 ຜືນ ÷ 2 = 5 ຜືນ/ຄົນ");
  assert.ok(await stageDialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),"Three long-name selectors fit the mobile dialog");
  for(const select of await stageDialog.getByRole("combobox").all()) assert.ok(await select.evaluate(el=>el.getBoundingClientRect().right<=el.closest("dialog").getBoundingClientRect().right));
  await editor.page.screenshot({path:"/tmp/bg-shared-assignment-mobile.png",fullPage:true});
  await stageDialog.getByRole("button",{name:"ບັນທຶກ",exact:true}).click();await expect(stageDialog).toHaveCount(0);
  assert.deepEqual(mutations.at(-1).assignments,{patternUserId:id(2),printUserId:id(3),dispatchUserId:id(2)});
  await editor.context.close();people[2].full_name=oldName;
  assert.deepEqual(errors,[]);
  console.log("Production queue browser passed: lightweight urgent-first queues with FIFO priority ties, direct start/complete actions, on-demand original factory review, separate record list with all three sections, private access, inactive/legacy exclusion, completion-month summary, reassignment table switching, background worker/credit transfers, superadmin stage dropdowns and shared summary credit, dispatch-only task access without credit, superadmin reassignment and mobile layout.");
} finally {await browser.close();}
