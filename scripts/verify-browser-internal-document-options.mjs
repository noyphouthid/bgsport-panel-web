// Local browser integration with mocked backend calls only; no live writes.
import assert from 'node:assert/strict';
import { DEFAULT_PRODUCTION_COLLARS } from '../lib/production-collars.ts';
const { chromium, expect } = await import(process.argv[2] || 'playwright/test');
process.loadEnvFile(new URL('../.env.local',import.meta.url));
const backend=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL),base=process.env.TEST_BASE_URL || 'http://localhost:3000';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user={id:uid(1),email:'qa@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
const profile={...user,auth_user_id:user.id,full_name:'QA Admin',role:'superadmin',is_active:true,permission_settings:{}};
const designer={...profile,id:uid(2),auth_user_id:uid(2),full_name:'QA Graphic',role:'graphic'};
const session={access_token:'qa-token',refresh_token:'qa-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
const fabric={id:uid(3),name:'QA Fabric',short_price:100000,long_price:120000,long_add:20000,is_active:true};
let collars=[{code:'none',label:'ຄໍປົກກະຕິ',unit_price:0,sort_order:0,is_active:true},{code:'polo',label:'ຄໍໂປໂລ',unit_price:20000,sort_order:10,is_active:true}];
let categories=[{code:'sports',label:'ເສື້ອກິລາ',sort_order:10,is_active:true}];
let productionCollars=DEFAULT_PRODUCTION_COLLARS.map(row=>({...row}));
let quotation=null,deposit=null,canEdit=true,missing=false;
const writes=[],errors=[],storefrontCalls=[];
let debugPage;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(({key,session})=>{localStorage.setItem(key,JSON.stringify(session));window.print=()=>{window.__printed=(window.__printed || 0)+1;};},{key:`sb-${backend.hostname.split('.')[0]}-auth-token`,session});
  await context.route(`${backend.origin}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').pop();let data=[];
    if(table?.startsWith('storefront')||table==='shirt_catalog_entries')storefrontCalls.push(table);
    if(missing&&table?.startsWith('internal_')){await route.fulfill({status:404,json:{code:'PGRST205',message:'Missing internal options'}});return;}
    if(url.pathname==='/auth/v1/user')data=user;
    else if(table==='users')data=url.searchParams.has('auth_user_id')||url.searchParams.has('email')?[profile]:[profile,designer];
    else if(table==='fabrics')data=[fabric];
    else if(table==='can_manage_internal_document_options')data=canEdit;
    else if(table==='quotation_design_deposit_is_manual')data=true;
    else if(table==='internal_collar_types'||table==='internal_work_categories'||table==='internal_production_collar_types'){
      const list=table==='internal_collar_types'?collars:table==='internal_work_categories'?categories:productionCollars;
      const code=url.searchParams.get('code')?.slice(3);
      if(req.method()==='POST'){const body=req.postDataJSON();list.push(body);writes.push({table,body});data=[{code:body.code}];}
      else if(req.method()==='PATCH'){const body=req.postDataJSON();Object.assign(list.find(row=>row.code===code),body);writes.push({table,body});data=[{code}];}
      else data=list;
    }else if(table==='quotation_drafts'){
      if(['POST','PATCH'].includes(req.method())){const body=req.postDataJSON();writes.push({table,body});quotation={...quotation,...body,id:uid(5),quote_no:'QT26-10-001'};data=quotation;}
      else data=quotation?[quotation]:[];
    }else if(table==='factory_deposit_orders'){
      if(['POST','PATCH'].includes(req.method())){const body=req.postDataJSON();writes.push({table,body});deposit={...deposit,...body,id:uid(6),deposit_no:'DPF26-10-001'};data=deposit;}
      else data=deposit?[deposit]:[];
    }else if(table==='order_code_types')data=[{code:'RK26',label:'RK26',sort_order:10,is_active:true}];
    else if(['POST','PATCH'].includes(req.method())){const body=req.postDataJSON();writes.push({table,body});data={...body,id:uid(7)};}
    if(req.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null;
    await route.fulfill({status:200,json:data});
  });
  await context.route('**/api/**',route=>route.fulfill({json:{counts:{}}}));
  const page=await context.newPage();debugPage=page;page.setDefaultTimeout(10000);
  page.on('dialog',dialog=>dialog.accept());page.on('pageerror',error=>errors.push(error.message));
  const field=text=>page.locator('label').filter({hasText:new RegExp(`^${text}$`)}).locator('..').locator('input,select').first();
  await page.goto(base+'/settings/collars',{waitUntil:'networkidle'});
  const settings=page.locator('aside').getByRole('button',{name:'ຕັ້ງຄ່າ',exact:true}).locator('..');
  await expect(settings.getByRole('link',{name:'ລາຍການຄໍເສື້ອບວກເພີ່ມ',exact:true})).toHaveAttribute('href','/settings/collars');
  await expect(settings.getByRole('link',{name:'ປະເພດງານ',exact:true})).toHaveAttribute('href','/settings/work-categories');
  await expect(page.getByRole('heading',{name:'ລາຍການຄໍເສື້ອບວກເພີ່ມ',exact:true})).toBeVisible();
  await expect(settings.getByRole('link',{name:'ເພີ່ມຄໍເສື້ອ',exact:true})).toHaveAttribute('href','/settings/production-collars');
  await page.getByRole('button',{name:'ເພີ່ມຄໍເສື້ອ',exact:true}).click();
  await page.getByLabel('ລະຫັດ',{exact:true}).fill('zip_collar');await page.getByLabel('ຊື່ລາຍການ',{exact:true}).fill('ຄໍຊິບ');
  await page.getByLabel('ຄ່າບວກຄໍ (ກີບ/ໂຕ)',{exact:true}).fill('35000');
  await page.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();await expect(page.getByRole('article').filter({hasText:'zip_collar'})).toContainText('35,000');
  await page.getByRole('navigation',{name:'ຕັ້ງຄ່າເອກະສານ'}).getByRole('link',{name:'ປະເພດງານ',exact:true}).click();
  await page.getByRole('button',{name:'ເພີ່ມປະເພດງານ',exact:true}).click();
  await page.getByLabel('ລະຫັດ',{exact:true}).fill('cycling');await page.getByLabel('ຊື່ລາຍການ',{exact:true}).fill('ເສື້ອລົດຖີບ');
  await page.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();await expect(page.getByRole('article').filter({hasText:'cycling'})).toContainText('ເສື້ອລົດຖີບ');
  await page.goto(base+'/settings/production-collars',{waitUntil:'networkidle'});
  await expect(page.getByRole('heading',{name:'ເພີ່ມຄໍເສື້ອ',exact:true})).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(14);
  await page.getByRole('button',{name:'ເພີ່ມຄໍເສື້ອ',exact:true}).click();
  await expect(page.getByLabel('ຄ່າບວກຄໍ (ກີບ/ໂຕ)',{exact:true})).toHaveCount(0);
  await page.getByLabel('ລະຫັດ',{exact:true}).fill('split_neck');await page.getByLabel('ຊື່ລາຍການ',{exact:true}).fill('ຄໍແບບໃໝ່');
  await page.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();await expect(page.getByRole('article')).toHaveCount(15);
  assert.equal('unit_price' in writes.at(-1).body,false);
  await page.goto(base+'/quotations/new',{waitUntil:'networkidle'});
  await page.getByLabel('ປະເພດງານ / ກຸ່ມເສື້ອ',{exact:true}).selectOption('cycling');
  await page.getByLabel('ຄໍເສື້ອ',{exact:true}).selectOption('zip_collar');
  await field('ຈຳນວນຄໍເສື້ອທີ່ບວກເພີ່ມ').fill('3');
  await field('ລະຫັດອໍເດີ').fill('RK26-9001');
  await page.getByRole('button',{name:'ພິມ A5',exact:true}).click();await page.waitForFunction(()=>window.__printed===1);
  assert.equal(quotation.collar_type,'zip_collar');assert.equal(quotation.collar_unit_price,35000);assert.equal(quotation.collar_label,'ຄໍຊິບ');
  assert.equal(quotation.work_category,'cycling');assert.equal(quotation.work_category_label,'ເສື້ອລົດຖີບ');
  await page.goto(base+'/settings/collars',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'ແກ້ໄຂ zip_collar',exact:true}).click();
  await page.getByLabel('ຄ່າບວກຄໍ (ກີບ/ໂຕ)',{exact:true}).fill('45000');await page.getByLabel('ຊື່ລາຍການ',{exact:true}).fill('ຄໍຊິບໃໝ່');
  await page.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();await expect(page.getByRole('article').filter({hasText:'zip_collar'})).toContainText('45,000');
  await page.goto(base+`/quotations/new?draftId=${quotation.id}`,{waitUntil:'networkidle'});
  await expect(page.getByLabel('ຄໍເສື້ອ',{exact:true}).locator('option:checked')).toContainText('35,000');
  await page.getByRole('button',{name:'ສ້າງໃບມັດຈຳ',exact:true}).first().click();
  await page.waitForURL('**/factory-deposit-orders/new?draftId=*');await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('ຄໍເສື້ອ',{exact:true}).locator('option:checked')).toContainText('35,000');
  await expect(page.getByLabel('ປະເພດງານ / ກຸ່ມເສື້ອ',{exact:true})).toHaveValue('cycling');
  await expect(page.getByText('ລວມຄ່າບວກຄໍ:',{exact:false})).toContainText('105,000');
  await page.getByLabel('ຈຳນວນແບບຜະລິດ',{exact:true}).selectOption('2');
  await page.getByLabel('ຄໍເສື້ອ ແບບທີ 1',{exact:true}).selectOption('split_neck');
  await page.getByLabel('ຄໍເສື້ອ ແບບທີ 2',{exact:true}).selectOption('sharp_v');
  await expect(page.getByLabel('ຄໍເສື້ອ',{exact:true})).toHaveValue('zip_collar');
  await expect(page.getByText('ລວມຄ່າບວກຄໍ:',{exact:false})).toContainText('105,000');
  await field('ຊື່ທີມ').fill('QA Team');
  await page.getByLabel('ແອັດມິນ',{exact:true}).selectOption(profile.id);await page.getByLabel('ຜູ້ອອກແບບ',{exact:true}).selectOption(designer.id);
  await page.getByRole('button',{name:/ບັນທຶກຮ່າງ/}).first().click();await page.locator('.swal2-confirm').click();await page.waitForURL('**/factory-deposit-orders');
  assert.equal(deposit.collar_unit_price,35000);assert.equal(deposit.collar_label,'ຄໍຊິບ');assert.equal(deposit.work_category_label,'ເສື້ອລົດຖີບ');assert.equal(deposit.gross_total,105000);
  assert.equal(deposit.production_items[0].collar_type,'split_neck');assert.equal(deposit.production_items[0].collar_label,'ຄໍແບບໃໝ່');
  assert.equal(deposit.production_items[1].collar_type,'sharp_v');
  await page.getByRole('button',{name:'ເບິ່ງໃບສັ່ງຜະລິດ',exact:true}).first().click();
  await expect(page.getByText(/ແບບ 1 .*ຄໍແບບໃໝ່/)).toBeVisible();
  await page.getByRole('button',{name:'ປິດໃບສັ່ງຜະລິດ',exact:true}).click();
  await page.goto(base+`/factory-deposit-orders/new?id=${deposit.id}`,{waitUntil:'networkidle'});
  await expect(page.getByLabel('ຄໍເສື້ອ',{exact:true}).locator('option:checked')).toContainText('35,000');
  await expect(page.getByLabel('ຄໍເສື້ອ ແບບທີ 1',{exact:true})).toHaveValue('split_neck');
  await expect(page.getByLabel('ຄໍເສື້ອ ແບບທີ 2',{exact:true})).toHaveValue('sharp_v');
  deposit.status='approved';await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'ບັນທຶກເປັນອໍເດີ',exact:true}).first().click();await page.waitForURL('**/factory-deposit-orders');
  const order=writes.find(row=>row.table==='orders').body;
  assert.equal(order.collar_type,'zip_collar');assert.equal(order.collar_unit_price,35000);assert.equal(order.work_category,'cycling');assert.equal(order.work_category_label,'ເສື້ອລົດຖີບ');
  await page.goto(base+'/settings/work-categories',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'ແກ້ໄຂ cycling',exact:true}).click();await page.getByRole('checkbox',{name:'ເປີດໃຊ້ງານ',exact:true}).uncheck();
  await page.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();await expect(page.getByRole('article').filter({hasText:'cycling'})).toContainText('ປິດໃຊ້ງານ');
  await page.goto(base+'/quotations/new',{waitUntil:'networkidle'});
  await expect(page.getByLabel('ປະເພດງານ / ກຸ່ມເສື້ອ',{exact:true}).locator('option[value="cycling"]')).toHaveCount(0);
  await page.getByLabel('ຄໍເສື້ອ',{exact:true}).selectOption('zip_collar');await expect(page.getByLabel('ຄໍເສື້ອ',{exact:true}).locator('option:checked')).toContainText('45,000');
  await page.goto(base+`/quotations/new?draftId=${quotation.id}`,{waitUntil:'networkidle'});
  await expect(page.getByLabel('ປະເພດງານ / ກຸ່ມເສື້ອ',{exact:true})).toHaveValue('cycling');
  await expect(page.getByLabel('ຄໍເສື້ອ',{exact:true}).locator('option:checked')).toContainText('35,000');
  await page.goto(base+'/settings/collars',{waitUntil:'networkidle'});await page.setViewportSize({width:390,height:844});
  await expect.poll(async()=>{const box=await page.locator('aside').boundingBox();return box.x+box.width;}).toBeLessThanOrEqual(1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'/tmp/bgsport-internal-collars-mobile.png',fullPage:true});
  await page.goto(base+'/settings/production-collars',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'ແກ້ໄຂ split_neck',exact:true}).click();
  await page.getByLabel('ຊື່ລາຍການ',{exact:true}).fill('Renamed construction collar');
  await page.getByRole('checkbox',{name:'ເປີດໃຊ້ງານ',exact:true}).uncheck();
  await page.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();
  await expect(page.getByRole('article').filter({hasText:'split_neck'})).toContainText('ປິດໃຊ້ງານ');
  await page.goto(base+`/factory-deposit-orders/new?id=${deposit.id}`,{waitUntil:'networkidle'});
  await expect(page.getByLabel('ຄໍເສື້ອ ແບບທີ 1',{exact:true}).locator('option:checked')).toContainText('ຄໍແບບໃໝ່');
  await page.goto(base+'/factory-deposit-orders/new',{waitUntil:'networkidle'});
  await expect(page.getByLabel('ຄໍເສື້ອ ແບບທີ 1',{exact:true}).locator('option[value="split_neck"]')).toHaveCount(0);
  await page.goto(base+'/settings/collars',{waitUntil:'networkidle'});
  canEdit=false;await page.reload({waitUntil:'networkidle'});await expect(page.getByRole('button',{name:'ເພີ່ມຄໍເສື້ອ',exact:true})).toBeDisabled();
  missing=true;await page.reload({waitUntil:'networkidle'});await expect(page.getByRole('alert').filter({hasText:'20261104_create_internal_document_options.sql'})).toBeVisible();
  await page.goto(base+'/settings/production-collars',{waitUntil:'networkidle'});
  await expect(page.getByRole('alert').filter({hasText:'20261105_create_production_collar_types.sql'})).toBeVisible();
  assert.deepEqual(storefrontCalls,[]);assert.deepEqual(errors,[]);
  console.log('Internal document browser passed: settings CRUD/disable, custom quotation choices, price calculation, printing/saving, quote→deposit→order inheritance, historical price/label retention, new prices for new documents, disabled choices, permissions, migration errors, mobile layout, zero storefront requests.');
} catch (error) {
  if (debugPage) {
    console.error("Browser failure:", debugPage.url(), errors, (await debugPage.locator("body").innerText()).slice(0,1800));
    await debugPage.screenshot({path:"/tmp/bgsport-internal-options-failure.png",fullPage:false});
  }
  throw error;
} finally {await browser.close();}
