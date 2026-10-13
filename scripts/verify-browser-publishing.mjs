// All Supabase and badge requests are mocked; no production writes or sessions.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.argv[2] || 'playwright');
const text = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
const urlLine = text.split('\n').find(line=>line.trim().startsWith('NEXT_PUBLIC_SUPABASE_URL'));
const backend = new URL(urlLine.slice(urlLine.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,''));
const user = {id:'00000000-0000-4000-8000-000000000001',email:'qa@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const session = {access_token:'qa-test-token',refresh_token:'qa-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
const sourceId='11111111-1111-4111-8111-111111111111';
const library=[
  {id:sourceId,file_url:'https://assets.example.invalid/image.jpg',file_name:'RK26-10048 copy.jpg',file_path:'queue/first.jpg',queue_entry_id:'22222222-2222-4222-8222-222222222222',queue:{type_code:'RK26',order_no:'10048'}},
  {id:'11111111-1111-4111-8111-111111111112',file_url:'https://assets.example.invalid/image-2.jpg',file_name:'RK26-10048 back.jpg',file_path:'queue/back.jpg',queue_entry_id:'22222222-2222-4222-8222-222222222222',queue:{type_code:'RK26',order_no:'10048'}},
  {id:'11111111-1111-4111-8111-111111111113',file_url:'https://assets.example.invalid/another.jpg',file_name:'RK26-10067.jpg',file_path:'queue/other.jpg',queue_entry_id:'22222222-2222-4222-8222-222222222223',queue:{type_code:'RK26',order_no:'10067'}},
];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext();
await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${backend.hostname.split('.')[0]}-auth-token`,session});
const posted=[];const batches=[];let catalog=[];let promotions=[];let content={};let checks=0;let editPermission=true;let categoriesMissing=false;
let categories=[{id:'football',lo:'ບານເຕະ',en:'Football',icon:'football',sort_order:10},{id:'volleyball',lo:'ບານສົ່ງ',en:'Volleyball',icon:'volleyball',sort_order:20},{id:'basketball',lo:'ບານບ້ວງ',en:'Basketball',icon:'basketball',sort_order:30},{id:'polo',lo:'ໂປໂລ',en:'Polo',icon:'polo',sort_order:40},{id:'teamwear',lo:'ເສື້ອທີມງານ',en:'Teamwear',icon:'teamwear',sort_order:50}];
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
await context.route(`${backend.origin}/**`,async route=>{
  const request=route.request(),u=new URL(request.url());let data;
  if(u.pathname==='/rest/v1/users')data={...user,auth_user_id:user.id,full_name:'QA Admin',role:'admin',is_active:true,permission_settings:{}};
  else if(u.pathname==='/rest/v1/rpc/can_manage_shirt_catalog')data=editPermission;
  else if(u.pathname==='/rest/v1/design_queue_mockups')data=u.searchParams.get('id')?.startsWith('eq.')?library[0]:library;
  else if(u.pathname==='/rest/v1/shirt_catalog_entries'){
    if(request.method()==='POST'){const body=request.postDataJSON();posted.push(body);const row={...body,id:`33333333-3333-4333-8333-${String(posted.length).padStart(12,'0')}`,created_at:new Date().toISOString()};catalog.push(row);data={id:row.id};}
    else if(request.method()==='PATCH'){const id=u.searchParams.get('id')?.slice(3);catalog=catalog.map(row=>row.id===id?{...row,...request.postDataJSON()}:row);data={id};}
    else if(request.method()==='DELETE'){const filter=u.searchParams.get('id');const ids=filter.startsWith('in.')?filter.slice(4,-1).split(','):[filter.slice(3)];catalog=catalog.filter(row=>!ids.includes(row.id));data=ids.map(id=>({id}));}
    else data=u.searchParams.get('design_code')?catalog.filter(row=>u.searchParams.get('design_code').includes(row.design_code)):catalog;
  }else if(u.pathname==='/rest/v1/rpc/publish_shirt_catalog_batch'){
    const batch=request.postDataJSON().p_entries;batches.push(batch);for(const row of batch){const old=catalog.find(item=>item.design_code===row.design_code);if(old)Object.assign(old,row,{is_published:true});else catalog.push({...row,id:`batch-${row.design_code}`,is_published:true,created_at:new Date().toISOString()});}data=batch.map(row=>`batch-${row.design_code}`);
  }else if(u.pathname==='/rest/v1/storefront_categories'){
    if(categoriesMissing){await route.fulfill({status:404,contentType:'application/json',body:'{"code":"PGRST205","message":"missing table"}'});return;}
    if(request.method()==='POST'){const row=request.postDataJSON();if(categories.some(c=>c.id===row.id)){await route.fulfill({status:409,contentType:'application/json',body:'{"code":"23505","message":"duplicate category"}'});return;}categories.push(row);data={id:row.id};}
    else if(request.method()==='PATCH'){const id=u.searchParams.get('id')?.slice(3);categories=categories.map(row=>row.id===id?{...row,...request.postDataJSON()}:row);data={id};}
    else if(request.method()==='DELETE'){const id=u.searchParams.get('id')?.slice(3);if(catalog.some(row=>row.category===id)){await route.fulfill({status:409,contentType:'application/json',body:'{"code":"23503","message":"category in use"}'});return;}categories=categories.filter(row=>row.id!==id);data={id};}
    else data=[...categories].sort((a,b)=>a.sort_order-b.sort_order||a.lo.localeCompare(b.lo));
  }else if(u.pathname==='/rest/v1/storefront_settings'){
    if(request.method()==='PATCH'){content=request.postDataJSON().content;data={id:true};}else data={content};
  }else if(u.pathname==='/rest/v1/storefront_promotions'){
    if(request.method()==='POST'){const row={...request.postDataJSON(),id:'promotion-1'};promotions.push(row);data={id:row.id};}
    else if(request.method()==='PATCH'){const id=u.searchParams.get('id')?.slice(3);promotions=promotions.map(row=>row.id===id?{...row,...request.postDataJSON()}:row);data={id};}
    else if(request.method()==='DELETE'){const id=u.searchParams.get('id')?.slice(3);promotions=promotions.filter(row=>row.id!==id);data={id};}else data=promotions;
  }else if(u.pathname.startsWith('/storage/v1/object/'))data={Key:'shirt-catalog/qa',Id:'44444444-4444-4444-8444-444444444444'};
  else if(u.pathname==='/auth/v1/user')data=user;
  else throw new Error(`Unexpected backend request: ${u.pathname}`);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
await context.route('**/api/nav-badge-counts',route=>route.fulfill({status:200,contentType:'application/json',body:'{"counts":{}}'}));
await context.route('https://assets.example.invalid/**',route=>route.fulfill({status:200,contentType:'image/jpeg',path:fileURLToPath(new URL('../../bgsport-store-web/dist/assets/look-1.jpg',import.meta.url))}));
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`http://localhost:3000/shirt-catalog?mockup=${sourceId}`,{waitUntil:'networkidle'});
const code=page.getByRole('textbox',{name:'ລະຫັດແບບ',exact:true});
await code.waitFor();
check(await code.inputValue(),'RK26-10048','Gallery shortcut fills order code');
check(await code.evaluate(el=>el.readOnly),true,'Library order code cannot be edited');
await page.getByRole('button',{name:'ຍົກເລີກ',exact:true}).click();
await page.getByRole('button',{name:'ເພີ່ມແບບ',exact:true}).click();
check(await code.evaluate(el=>el.readOnly),false,'Direct upload permits a manual code');
await code.fill('CUSTOM-001');
await page.getByRole('button',{name:'ເລືອກຈາກຄັງ',exact:true}).click();
await page.getByRole('button').filter({hasText:'RK26-10048 copy.jpg'}).click();
check(await code.inputValue(),'RK26-10048','Library picker replaces a manual code with the source order code');
check(await code.evaluate(el=>el.readOnly),true,'Picker selection locks order code');
await page.getByRole('button').filter({hasText:'RK26-10048 back.jpg'}).click();
check(await page.getByRole('heading',{name:'ຮູບເສື້ອ (2/12)',exact:true}).count(),1,'Multiple images of the same order can be grouped');
await page.getByRole('button').filter({hasText:'RK26-10067.jpg'}).click();
check(await code.inputValue(),'RK26-10048','Different order cannot replace a linked design code');
check(await page.getByRole('heading',{name:'ຮູບເສື້ອ (2/12)',exact:true}).count(),1,'Different orders are kept in separate entries');
await page.getByLabel('ຊື່ແບບ (ລາວ) *',{exact:true}).fill('ແບບທົດສອບ');
await page.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
check(posted[0].design_code,'RK26-10048','Saved post uses the order code');
check(posted[0].images.every(image=>image.order_code==='RK26-10048'),true,'Saved images retain source order metadata');
await page.getByRole('button',{name:'ເພີ່ມແບບ',exact:true}).click();
await code.fill('CUSTOM-002');
await page.locator('input[type="file"]').setInputFiles(fileURLToPath(new URL('../../bgsport-store-web/dist/assets/look-1.jpg',import.meta.url)));
await page.getByRole('heading',{name:'ຮູບເສື້ອ (1/12)',exact:true}).waitFor();
check(await code.evaluate(el=>el.readOnly),false,'Uploaded image keeps manual code editable');
check(await code.inputValue(),'CUSTOM-002','Uploading does not overwrite a manual code');
await page.getByLabel('ຊື່ແບບ (ລາວ) *',{exact:true}).fill('ແບບອັບໂຫຼດ');
await page.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
check(posted[1].design_code,'CUSTOM-002','Direct upload saves its manual code');
check(posted[1].images[0].mockup_id,undefined,'Direct uploads have no queue dependency');
await page.getByRole('button',{name:'ເລືອກຈາກຄັງເປັນກຸ່ມ',exact:true}).click();
await page.getByLabel('ເລືອກຮູບ RK26-10048 copy.jpg',{exact:true}).check();
await page.getByLabel('ເລືອກຮູບ RK26-10048 back.jpg',{exact:true}).check();
await page.getByLabel('ເລືອກຮູບ RK26-10067.jpg',{exact:true}).check();
await page.getByRole('button',{name:'ຕໍ່ໄປ: ຈັດກຸ່ມແລະປະເພດ',exact:true}).click();
await page.getByLabel('ປະເພດ RK26-10067',{exact:true}).selectOption('polo');
await page.getByLabel('ຊື່ RK26-10067',{exact:true}).fill('New polo');
await page.getByRole('button',{name:'ເຜີຍແຜ່ 2 ແບບ',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
check(batches[0].length,2,'Bulk selection creates one entry per order');
check(batches[0][0].images.length,2,'Same-order front and back remain grouped');
check(batches[0][1].category,'polo','Each group has its own category');
check(batches[0][0].name_lo,'ແບບທົດສອບ','Batch preserves existing name');
const customCard=page.locator('article').filter({hasText:'CUSTOM-002'});
await customCard.getByRole('button',{name:'ແກ້ໄຂ',exact:true}).click();
await page.getByLabel('ແຄັບຊັນ (ລາວ)',{exact:true}).fill('Custom caption');
await page.getByLabel('ຄຳຂວັນ (English)',{exact:true}).fill('Team spirit');
await page.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
check(catalog.find(row=>row.design_code==='CUSTOM-002').caption_lo,'Custom caption','Edited caption is saved');
check(catalog.find(row=>row.design_code==='CUSTOM-002').slogan_en,'Team spirit','Edited slogan is saved');
page.once('dialog',dialog=>dialog.accept());
await page.getByRole('button',{name:'ລົບ CUSTOM-002',exact:true}).click();
await page.waitForFunction(()=>!document.body.textContent.includes('CUSTOM-002'));
check(catalog.some(row=>row.design_code==='CUSTOM-002'),false,'Catalog CRUD delete removes the selected entry');
await page.getByRole('button',{name:'ຂໍ້ຄວາມຮ້ານ',exact:true}).click();
await page.getByLabel('ຊື່ຮ້ານ (English)',{exact:true}).fill('Custom BG');
await page.getByLabel('ຄຳຂວັນຮ້ານ (ລາວ)',{exact:true}).fill('Custom Lao slogan');
await page.getByRole('button',{name:'ບັນທຶກຂໍ້ຄວາມ',exact:true}).click();
await page.waitForTimeout(200);
check(content.brandName.en,'Custom BG','Store name is saved');
check(content.brandSlogan.lo,'Custom Lao slogan','Store slogan is saved');
await page.getByRole('button',{name:'ສະໄລດ໌ໂປຣໂມຊັນ',exact:true}).click();
await page.getByRole('button',{name:'ເພີ່ມໂປຣໂມຊັນ',exact:true}).click();
await page.getByLabel('ຊື່ (ລາວ) *',{exact:true}).fill('Promotion test');
await page.getByLabel('ແຄັບຊັນ (ລາວ)',{exact:true}).fill('Promo caption');
await page.getByLabel('ຄຳຂວັນ (English)',{exact:true}).fill('Made for teams');
await page.getByRole('button',{name:'ເລືອກຈາກຄັງ',exact:true}).click();
await page.getByRole('button').filter({hasText:'RK26-10048 copy.jpg'}).click();
await page.getByLabel('ເຜີຍແຜ່ໃນສະໄລດ໌ໜ້າຫຼັກ',{exact:true}).check();
await page.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
check(promotions[0].is_published,true,'Published promotion persists');
check(promotions[0].images[0].mockup_id,sourceId,'Promotion uses shared library media');
await page.locator('article').filter({hasText:'Promotion test'}).getByRole('button',{name:'ແກ້ໄຂ',exact:true}).click();
await page.getByLabel('ລຳດັບ',{exact:true}).fill('5');
await page.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
check(promotions[0].sort_order,5,'Promotion ordering can be edited');
page.once('dialog',dialog=>dialog.accept());
await page.locator('article').filter({hasText:'Promotion test'}).getByRole('button',{name:'ລົບ',exact:true}).click();
await page.waitForFunction(()=>document.body.textContent.includes('ເພີ່ມຮູບໂປຣໂມຊັນທຳອິດ'));
check(promotions.length,0,'Promotion CRUD delete works');
await page.getByRole('button',{name:'ປະເພດງານ',exact:true}).click();
await page.getByRole('button',{name:'ແກ້ໄຂປະເພດ football',exact:true}).waitFor();
check(await page.locator('article').count(),5,'Category manager loads existing categories');
await page.getByRole('button',{name:'ເພີ່ມປະເພດງານ',exact:true}).click();
await page.getByLabel('ລະຫັດປະເພດ',{exact:true}).fill('running');
await page.getByLabel('ຊື່ປະເພດ (ລາວ) *',{exact:true}).fill('ແລ່ນ');
await page.getByLabel('ຊື່ປະເພດ (English)',{exact:true}).fill('Running');
await page.getByLabel('ລຳດັບປະເພດ',{exact:true}).fill('5');
await page.getByRole('button',{name:'ບັນທຶກປະເພດ',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
check(categories.length,6,'New category is saved');
await page.locator('article').filter({hasText:'running'}).waitFor();
check(await page.locator('article').first().getByRole('heading').textContent(),'ແລ່ນ','Category sort order is reflected');
await page.getByRole('button',{name:'ແບບເສື້ອ',exact:true}).click();
await page.getByRole('button',{name:'ເພີ່ມແບບ',exact:true}).click();
check(await page.getByLabel('ໝວດໝູ່',{exact:true}).inputValue(),'running','New design defaults to first configured category');
await code.fill('CUSTOM-RUN');
await page.getByLabel('ຊື່ແບບ (ລາວ) *',{exact:true}).fill('Custom runner');
await page.locator('input[type="file"]').setInputFiles(fileURLToPath(new URL('../../bgsport-store-web/dist/assets/look-1.jpg',import.meta.url)));
await page.getByRole('heading',{name:'ຮູບເສື້ອ (1/12)',exact:true}).waitFor();
await page.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
check(posted.at(-1).category,'running','Single design accepts custom category');
await page.getByRole('button',{name:'ເລືອກຈາກຄັງເປັນກຸ່ມ',exact:true}).click();
await page.getByLabel('ເລືອກຮູບ RK26-10067.jpg',{exact:true}).check();
await page.getByRole('button',{name:'ຕໍ່ໄປ: ຈັດກຸ່ມແລະປະເພດ',exact:true}).click();
await page.getByLabel('ປະເພດ RK26-10067',{exact:true}).selectOption('running');
await page.getByRole('button',{name:'ເຜີຍແຜ່ 1 ແບບ',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
check(batches.at(-1)[0].category,'running','Batch publishing accepts custom categories');
await page.getByLabel('ແລ່ນ',{exact:true}).check();
check(await page.locator('article').count(),2,'Management filter uses custom category');
await page.getByLabel('ແລ່ນ',{exact:true}).uncheck();
await page.getByRole('button',{name:'ປະເພດງານ',exact:true}).click();
await page.getByRole('button',{name:'ແກ້ໄຂປະເພດ running',exact:true}).click();
check(await page.getByLabel('ລະຫັດປະເພດ',{exact:true}).evaluate(el=>el.readOnly),true,'Editing keeps category ID stable');
await page.getByLabel('ຊື່ປະເພດ (English)',{exact:true}).fill('Trail running');
await page.getByLabel('ລຳດັບປະເພດ',{exact:true}).fill('60');
await page.getByRole('button',{name:'ບັນທຶກປະເພດ',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
check(categories.find(c=>c.id==='running').en,'Trail running','Category name can be edited');
page.once('dialog',dialog=>dialog.accept());
await page.getByRole('button',{name:'ລົບປະເພດ running',exact:true}).click();
await page.getByText('ປະເພດນີ້ມີແບບເສື້ອໃຊ້ຢູ່.',{exact:false}).waitFor();
check(categories.some(c=>c.id==='running'),true,'Category in use cannot be deleted');
await page.getByRole('button',{name:'ເພີ່ມປະເພດງານ',exact:true}).click();
await page.getByLabel('ລະຫັດປະເພດ',{exact:true}).fill('cycling');
await page.getByLabel('ຊື່ປະເພດ (ລາວ) *',{exact:true}).fill('ຖີບລົດ');
await page.getByRole('button',{name:'ບັນທຶກປະເພດ',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
page.once('dialog',dialog=>dialog.accept());
await page.getByRole('button',{name:'ລົບປະເພດ cycling',exact:true}).click();
await page.getByRole('button',{name:'ລົບປະເພດ cycling',exact:true}).waitFor({state:'detached'});
check(categories.some(c=>c.id==='cycling'),false,'Unused category can be deleted');
editPermission=false;
await page.goto('http://localhost:3000/shirt-catalog',{waitUntil:'networkidle'});
await page.getByRole('button',{name:'ປະເພດງານ',exact:true}).click();
check(await page.getByRole('button',{name:'ເພີ່ມປະເພດງານ',exact:true}).isDisabled(),true,'View-only users cannot add categories');
check(await page.getByRole('button',{name:'ແກ້ໄຂປະເພດ running',exact:true}).isDisabled(),true,'View-only users cannot edit categories');
categoriesMissing=true;editPermission=true;
await page.goto('http://localhost:3000/shirt-catalog',{waitUntil:'networkidle'});
await page.getByRole('button',{name:'ປະເພດງານ',exact:true}).click();
await page.getByRole('alert').filter({hasText:'20261014_create_storefront_categories.sql'}).waitFor();
check(await page.getByRole('button',{name:'ເພີ່ມປະເພດງານ',exact:true}).isDisabled(),true,'Missing migration exposes an actionable error');
check(errors,[],'No browser errors');
await browser.close();console.log(`${checks} publishing UI checks passed. All backend writes were mocked.`);
