// Local panel verification. All backend calls are mocked; no production writes.
import assert from 'node:assert/strict';
const { chromium, expect } = await import(process.argv[2] || 'playwright/test');
process.loadEnvFile(new URL('../.env.local',import.meta.url));
const backend=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user={id:uid(1),email:'qa@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
const profile={...user,auth_user_id:user.id,full_name:'QA Staff',role:'staff',is_active:true,permission_settings:{}};
const session={access_token:'qa-token',refresh_token:'qa-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
let rows=Array.from({length:53},(_,n)=>({source:'note',source_id:uid(n+100),transport_note_id:uid(n+100),delivery_request_id:null,note_no:`TN-COD-${n+1}`,order_id:null,order_code:null,receiver_name:`Receiver ${n+1}`,receiver_phone:'02012345678',transporters:['HAL Logistic'],branch:'Vientiane',created_at:'2026-10-29T03:00:00Z',amount:100000,received_at:n===0?'2026-10-29T04:00:00Z':null,received_by_name:n===0?'First receiver':null}));
let failure='',rejectReceipt=false,acceptConfirm=true;
const errors=[],confirmations=[],receipts=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${backend.hostname.split('.')[0]}-auth-token`,session});
  await context.route(`${backend.origin}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').pop();let data=[];
    if(url.pathname==='/auth/v1/user')data=user;
    else if(table==='users')data=[profile];
    else if(table==='list_transport_cod'){
      if(failure){await route.fulfill({status:400,json:failure==='schema'?{code:'PGRST202',message:'Missing RPC'}:{code:'42501',message:'cod_forbidden'}});return;}
      const input=req.postDataJSON();
      const matched=rows.filter(row=>`${row.note_no} ${row.receiver_name}`.toLowerCase().includes(input.p_query.toLowerCase()));
      const filtered=matched.filter(row=>input.p_status==='all'||(input.p_status==='received'?!!row.received_at:!row.received_at));
      const received=matched.filter(row=>row.received_at),pending=matched.filter(row=>!row.received_at);
      data={rows:filtered.slice(input.p_offset,input.p_offset+input.p_limit),total:filtered.length,summary:{count:matched.length,total:matched.reduce((sum,row)=>sum+row.amount,0),pending_count:pending.length,pending_amount:pending.reduce((sum,row)=>sum+row.amount,0),received_count:received.length,received_amount:received.reduce((sum,row)=>sum+row.amount,0)}};
    }else if(table==='receive_transport_cod'){
      const input=req.postDataJSON();receipts.push(input);
      if(rejectReceipt){await route.fulfill({status:400,json:{code:'22023',message:'cod_amount_changed'}});return;}
      const row=rows.find(row=>row.source_id===input.p_source_id);
      assert.equal(input.p_expected_amount,row.amount);
      row.received_at='2026-10-29T05:00:00Z';row.received_by_name='QA Staff';data={id:uid(900),...row};
    }
    if(req.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null;
    await route.fulfill({status:200,json:data});
  });
  await context.route('**/api/**',route=>route.fulfill({json:{counts:{}}}));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>{confirmations.push(dialog.message());return acceptConfirm?dialog.accept():dialog.dismiss();});
  await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/shipments/cod`,{waitUntil:'networkidle'});
  const table=page.getByRole('table',{name:'ລາຍການ COD',exact:true});
  const bodyRows=table.locator('tbody tr');
  const summary=page.getByLabel('ສະຫຼຸບ COD',{exact:true});
  await expect(bodyRows).toHaveCount(50);
  await expect(summary).toContainText('5,300,000');await expect(summary).toContainText('5,200,000');
  await expect(page.locator('aside').getByRole('link',{name:'ລາຍການ COD',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'ໜ້າຖັດໄປ',exact:true}).click();await expect(bodyRows).toHaveCount(3);
  await page.getByRole('button',{name:'ໜ້າກ່ອນ',exact:true}).click();await expect(bodyRows).toHaveCount(50);
  const target=bodyRows.filter({hasText:'TN-COD-2'}).first();
  acceptConfirm=false;await target.getByRole('button',{name:'ຮັບຍອດ COD ແລ້ວ',exact:true}).click();
  assert.equal(receipts.length,0,'Cancelled confirmation never writes');assert.match(confirmations.at(-1),/100,000/);
  acceptConfirm=true;await target.getByRole('button',{name:'ຮັບຍອດ COD ແລ້ວ',exact:true}).click();
  await expect(target).toContainText('QA Staff');await expect(target.getByRole('button')).toHaveCount(0);
  assert.equal(receipts.length,1);await expect(summary).toContainText('5,100,000');await expect(summary).toContainText('200,000');
  await page.getByLabel('ສະຖານະ',{exact:true}).selectOption('received');await expect(bodyRows).toHaveCount(2);
  await expect(bodyRows.first()).toContainText('First receiver');await expect(bodyRows.last()).toContainText('QA Staff');
  await page.reload({waitUntil:'networkidle'});await expect(target).toContainText('QA Staff');
  await page.getByLabel('ຄົ້ນຫາ',{exact:true}).fill('Receiver 53');await expect(bodyRows).toHaveCount(1);await expect(bodyRows).toContainText('TN-COD-53');
  rejectReceipt=true;await bodyRows.getByRole('button',{name:'ຮັບຍອດ COD ແລ້ວ',exact:true}).click();
  await expect(page.getByText(/ຍອດ COD ຖືກປ່ຽນແປງ/)).toBeVisible();
  await expect(bodyRows.getByRole('button',{name:'ຮັບຍອດ COD ແລ້ວ',exact:true})).toBeEnabled();
  assert.equal(rows.at(-1).received_at,null);rejectReceipt=false;
  await page.getByLabel('ຄົ້ນຫາ',{exact:true}).fill('No matching receiver');
  await expect(table).toContainText('ບໍ່ພົບລາຍການ COD');
  await page.getByLabel('ຄົ້ນຫາ',{exact:true}).fill('');await expect(bodyRows).toHaveCount(50);
  await page.setViewportSize({width:390,height:844});
  await expect.poll(async()=>{const box=await page.locator('aside').boundingBox();return box.x+box.width;}).toBeLessThanOrEqual(1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Wide table must scroll inside the card');
  await page.screenshot({path:'/tmp/bgsport-cod-receipts-mobile.png',fullPage:false});
  failure='schema';await page.getByRole('button',{name:'ໂຫຼດໃໝ່',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'20261103_create_transport_cod_receipts.sql'})).toBeVisible();
  await expect(table.getByRole('button')).toHaveCount(0);
  failure='forbidden';await page.getByRole('button',{name:'ລອງໃໝ່',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'ບໍ່ມີສິດ'})).toBeVisible();
  assert.deepEqual(errors,[]);
  console.log('COD browser passed: staff navigation, summary across pages, pagination, cancel/receive/reload, audit display, filters/search, stale-amount rejection, empty/schema/permission states, mobile scroll containment, no browser errors.');
} finally {await browser.close();}
