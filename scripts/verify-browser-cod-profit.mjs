// Browser checks against local code with mocked backend data, never production.
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
const {chromium,expect}=await import(process.argv[2] || 'playwright/test');
process.loadEnvFile(new URL('../.env.local',import.meta.url));
const backend=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL),base=process.env.TEST_BASE_URL || 'http://localhost:3000';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user={id:uid(1),email:'qa@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
const profile={...user,auth_user_id:user.id,full_name:'QA Admin',role:'superadmin',is_active:true,permission_settings:{}};
const session={access_token:'qa-token',refresh_token:'qa-refresh',expires_at:Math.floor(Date.now()/1000)+86400*30,token_type:'bearer',user};
const row=(n,extra={})=>({id:uid(n),order_code:`RK26-${n}`,order_date:'2026-10-02',created_at:'2026-10-02T03:00:00Z',status:'in_progress',shipment_status:'shipped',shipment_completed_at:'2026-10-15T03:00:00Z',production_completed_at:'2026-10-10T03:00:00Z',closed_at:null,admin_user_id:profile.id,short_qty:10,long_qty:0,free_qty:0,net_total:1000000,factory_cost:600000,balance:0,customer_phone:'02012345678',customer_whatsapp:null,factory_bill_code:null,factory_production_is_rush:false,fabric_name:'QA',has_transport_cod:true,cod_pending_count:1,profit_recognized_at:null,...extra});
const orders=[row(10),row(11,{net_total:800000,factory_cost:300000}),row(12,{order_date:'2026-11-02',has_transport_cod:false,cod_pending_count:0,shipment_completed_at:'2026-11-02T03:00:00Z',profit_recognized_at:'2026-11-02T03:00:00Z',net_total:200000,factory_cost:50000})];
let history=[],missing=false;
const errors=[],receipts=[],closingWrites=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
let debugPage;
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Los_Angeles'});
  await context.addInitScript(({key,session})=>{localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('bgsport:dashboard-hide-totals','false');},{key:`sb-${backend.hostname.split('.')[0]}-auth-token`,session});
  await context.route(`${backend.origin}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').pop();let data=[];
    if(url.pathname==='/auth/v1/user')data=user;
    else if(table==='users')data=[profile];
    else if(table==='order_code_types')data=[{id:uid(3),code:'RK26',label:'RK26',sort_order:0,is_active:true}];
    else if(table==='orders'){
      if(missing&&(url.searchParams.get('select') || '').includes('profit_recognized_at')){await route.fulfill({status:400,json:{code:'42703',message:'column orders.profit_recognized_at does not exist'}});return;}
      data=orders.filter(order=>{
        for(const clause of url.searchParams.getAll('profit_recognized_at')){
          if(clause==='not.is.null'&&!order.profit_recognized_at)return false;
          if(clause.startsWith('gte.')&&(!order.profit_recognized_at||new Date(order.profit_recognized_at)<new Date(clause.slice(4))))return false;
          if(clause.startsWith('lt.')&&(!order.profit_recognized_at||new Date(order.profit_recognized_at)>=new Date(clause.slice(3))))return false;
        }
        for(const clause of url.searchParams.getAll('order_date')){
          if(clause.startsWith('gte.')&&order.order_date<clause.slice(4))return false;
          if(clause.startsWith('lte.')&&order.order_date>clause.slice(4))return false;
        }
        return true;
      });
      const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);data=data.slice(offset,offset+limit);
    }else if(table==='monthly_closings'){
      if(req.method()==='POST'){const body=req.postDataJSON();closingWrites.push(body);history=[{id:uid(90),...body}];}data=history;
    }else if(table==='list_transport_cod'){
      const found=orders.filter(order=>order.has_transport_cod).map(order=>({source:'note',source_id:uid(Number(order.id.slice(-3))+100),transport_note_id:null,delivery_request_id:null,note_no:`COD-${order.order_code}`,order_id:order.id,order_code:order.order_code,receiver_name:'Customer',receiver_phone:'02012345678',transporters:['HAL'],branch:'Vientiane',created_at:order.created_at,amount:order.net_total,received_at:order.profit_recognized_at,received_by_name:order.profit_recognized_at?'QA Admin':null}));
      const received=found.filter(item=>item.received_at),pending=found.filter(item=>!item.received_at);
      data={rows:found,total:found.length,summary:{count:found.length,total:found.reduce((a,b)=>a+b.amount,0),received_count:received.length,received_amount:received.reduce((a,b)=>a+b.amount,0),pending_count:pending.length,pending_amount:pending.reduce((a,b)=>a+b.amount,0)}};
    }else if(table==='receive_transport_cod'){
      const input=req.postDataJSON();receipts.push(input);
      orders[0].profit_recognized_at='2026-10-31T17:30:00Z';orders[0].cod_pending_count=0;
      data={id:uid(99),amount:1000000,received_at:orders[0].profit_recognized_at,received_by_name:'QA Admin'};
    }
    if(req.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null;
    await route.fulfill({status:200,json:data});
  });
  await context.route('**/api/**',route=>route.fulfill({json:{counts:{}}}));
  const page=await context.newPage();debugPage=page;page.setDefaultTimeout(15000);
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  const goto=path=>page.goto(base+path,{waitUntil:'networkidle'});
  const salesProfit=()=>page.getByText('ກຳໄລລວມ',{exact:true}).locator('..');
  const monthProfit=()=>page.getByText('ກຳໄລໃນເດືອນ',{exact:true}).locator('..');
  await goto('/reports/sales-profit');await expect(salesProfit()).toContainText('150,000');
  await expect(page.getByRole('table')).not.toContainText('RK26-10');
  await goto('/reports/monthly-close');await expect(monthProfit()).toContainText('150,000');
  await goto('/dashboard');await expect(page.getByText('ກຳໄລທັງໝົດ',{exact:true}).locator('..')).toContainText('150,000');
  await goto('/reports/income-expense');await expect(page.getByText('ກຳໄລຂອງເດືອນ',{exact:true}).locator('../..')).toContainText('150,000');
  await goto('/shipments/cod');
  await page.getByRole('row').filter({hasText:'RK26-10'}).getByRole('button',{name:'ຮັບຍອດ COD ແລ້ວ',exact:true}).click();
  await expect(page.getByRole('row').filter({hasText:'RK26-10'})).toContainText('QA Admin');assert.equal(receipts.length,1);
  await goto('/reports/sales-profit');await expect(salesProfit()).toContainText('550,000');
  await expect(page.getByRole('table')).toContainText('RK26-10');await expect(page.getByRole('table')).not.toContainText('RK26-11');
  await expect(page.getByRole('row').filter({hasText:'RK26-10'})).toContainText('2026-11-01');
  await page.getByLabel('ເດືອນ',{exact:true}).selectOption('10');await expect(salesProfit()).toContainText('0');
  await page.getByLabel('ວັນທີລາຍງານ',{exact:true}).selectOption('order_date');
  await expect(page.getByRole('table')).toContainText('RK26-10');await expect(salesProfit()).toContainText('0');
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:/XLSX/}).click()]);
  const book=XLSX.readFile(await download.path());const exported=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  assert.equal(exported.find(order=>order.order_code==='RK26-10').profit,0,'Alternate date views cannot export unpaid or wrong-month profit');
  await goto('/reports/monthly-close');await expect(monthProfit()).toContainText('550,000');
  await expect(page.getByRole('table')).toContainText('RK26-10');await expect(page.getByRole('table')).not.toContainText('RK26-11');
  await page.getByRole('button',{name:'ປິດຍອດເດືອນ',exact:true}).click();await expect(page.getByRole('button',{name:'ເປີດຍອດຄືນ',exact:true})).toBeVisible();
  assert.equal(closingWrites.at(-1).total_profit,550000);assert.equal(closingWrites.at(-1).summary_snapshot.recognition_basis,'cod_receipt_v1');
  assert.deepEqual(closingWrites.at(-1).summary_snapshot.orders.map(order=>order.id).sort(),[uid(10),uid(12)]);
  await page.getByLabel('ເດືອນ',{exact:true}).selectOption('10');await expect(monthProfit()).toContainText('0');
  await expect(page.getByRole('table')).not.toContainText('RK26-10');
  await goto('/dashboard');await expect(page.getByText('ກຳໄລທັງໝົດ',{exact:true}).locator('..')).toContainText('550,000');
  await expect(page.getByText('ກຳໄລລວມ',{exact:true}).locator('..')).toContainText('550,000');
  await goto('/reports/income-expense');await expect(page.getByText('ກຳໄລຂອງເດືອນ',{exact:true}).locator('../..')).toContainText('550,000');
  missing=true;await goto('/reports/sales-profit');await expect(page.getByRole('alert').filter({hasText:'20261106_cod_profit_recognition.sql'})).toBeVisible();
  await expect(salesProfit()).toContainText('0');
  await goto('/reports/monthly-close');await expect(page.getByText(/ກະລຸນາລັນ 20261106_cod_profit_recognition.sql/)).toBeVisible();
  await expect(page.getByRole('button',{name:'ເປີດຍອດຄືນ',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'ປິດຍອດເດືອນ',exact:true})).toBeDisabled();
  assert.deepEqual(errors,[]);
  console.log('COD profit browser passed: receive button → correct Lao month across sales report, monthly close, dashboard total/chart and income/expense; pending exclusion, prior-month exclusion, Excel and closing payload consistency, missing-migration failure. Browser timezone: Los Angeles.');
}catch(error){
  if(debugPage){console.error('Browser failure:',debugPage.url(),errors,(await debugPage.locator('body').innerText()).slice(0,1500));await debugPage.screenshot({path:'/tmp/bgsport-cod-profit-failure.png'});}throw error;
}finally{await browser.close();}
