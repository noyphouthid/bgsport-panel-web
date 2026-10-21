// Local panel + local storefront. All backend calls are mocked; no live writes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium,expect}=await import(process.argv[2] || 'playwright/test');
process.loadEnvFile(new URL('../.env.local',import.meta.url));
const backend=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const panel=process.env.TEST_BASE_URL || 'http://localhost:3000';
const store=process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user={id:uid(1),email:'qa@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const profile={...user,auth_user_id:user.id,full_name:'QA Admin',role:'admin',is_active:true,permission_settings:{}};
const session={access_token:'qa-token',refresh_token:'qa-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
const photo=`${backend.origin}/storage/v1/object/public/shirt-catalog/posts/review/photo.jpg`;
const jpeg=await readFile(new URL('../../bgsport-store-web/dist/assets/look-1.jpg',import.meta.url));
const record=(n,kind='review')=>({id:uid(n+100),kind,title_lo:`Real shirt ${n}`,title_en:`English shirt ${n}`,description_lo:`Details ${n}`,description_en:`English details ${n}`,images:[{url:photo,bucket:'shirt-catalog',path:'posts/review/photo.jpg'},{url:photo+'?back=1',bucket:'shirt-catalog',path:'posts/review/back.jpg'}],is_published:true,sort_order:0,created_at:'2026-01-01T00:00:00Z'});
let rows=[...Array.from({length:25},(_,i)=>record(i+1)),{...record(40,'fabric'),title_lo:'Mesh fabric',title_en:''}];
let permission=true,missing=false,failFeed=false;
const writes=[],uploads=[],feedRequests=[],errors=[],storageDeletes=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${backend.hostname.split('.')[0]}-auth-token`,session});
  await context.route(`${backend.origin}/**`,async route=>{
    const request=route.request(),url=new URL(request.url()),table=url.pathname.split('/').pop();
    let data=[],total=0,status=200;
    if(url.pathname==='/auth/v1/user')data=user;
    else if(table==='users')data=[profile];
    else if(table==='can_manage_shirt_catalog')data=permission;
    else if(table==='storefront_content')data={content:{},promotions:[]};
    else if(table==='storefront_posts_feed'){
      const input=request.postDataJSON();feedRequests.push(input);
      if(failFeed){await route.fulfill({status:503,contentType:'application/json',body:'{}'});return;}
      if(missing){await route.fulfill({status:404,contentType:'application/json',body:'{"code":"PGRST202"}'});return;}
      const found=rows.filter(row=>row.kind===input.p_kind&&row.is_published&&(input.p_kind!=='collar'||input.p_pricing==='all'||row.collar_pricing===input.p_pricing)&&`${row.title_lo} ${row.title_en} ${row.description_lo} ${row.description_en}`.toLowerCase().includes(input.p_query.toLowerCase())).sort((a,b)=>a.sort_order-b.sort_order||a.id.localeCompare(b.id));
      data=found.slice(input.p_offset,input.p_offset+input.p_limit).map(({id,kind,title_lo,title_en,description_lo,description_en,images,collar_pricing,surcharge_lak})=>({id,kind,title_lo,title_en,description_lo,description_en,collar_pricing,surcharge_lak,images:images.map(image=>({url:image.url}))}));
    }else if(url.pathname==='/rest/v1/storefront_posts'){
      if(missing){const collar=url.searchParams.get('kind')==='eq.collar';if(collar)assert.ok(url.searchParams.get('select').includes('surcharge_lak'),'Collar load detects missing migration columns');await route.fulfill({status:404,json:{code:collar?'42703':'PGRST205',message:'Missing schema'}});return;}
      const kind=url.searchParams.get('kind')?.slice(3),id=url.searchParams.get('id')?.slice(3);
      if(request.method()==='POST'){
        const body=request.postDataJSON();writes.push(body);const row={...body,id:uid(500+writes.length),created_at:new Date().toISOString()};rows.push(row);data=[{id:row.id}];
      }else if(request.method()==='PATCH'){
        const body=request.postDataJSON();writes.push(body);rows=rows.map(row=>row.id===id&&row.kind===kind?{...row,...body}:row);data=[{id}];
      }else if(request.method()==='DELETE'){rows=rows.filter(row=>!(row.id===id&&row.kind===kind));data=[{id}];}
      else{
        let found=rows.filter(row=>row.kind===kind);
        const published=url.searchParams.get('is_published');if(published)found=found.filter(row=>row.is_published===(published==='eq.true'));
        const search=url.searchParams.get('or');if(search){const match=search.match(/title_lo\.ilike\."%(.+?)%"/);if(match)found=found.filter(row=>`${row.title_lo} ${row.title_en}`.toLowerCase().includes(match[1].toLowerCase()));}
        found.sort((a,b)=>a.sort_order-b.sort_order||a.id.localeCompare(b.id));total=found.length;
        const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||24);data=found.slice(offset,offset+limit);
      }
    }else if(url.pathname.startsWith('/storage/v1/object/')){
      if(request.method()==='POST'){uploads.push(url.pathname);data={Key:'shirt-catalog/upload.jpg',Id:uid(900)};}
      else if(request.method()==='DELETE'){storageDeletes.push(url.pathname);data=[];}
      else{await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/jpeg',body:jpeg});return;}
    }
    if(request.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null;
    await route.fulfill({status,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Range','Content-Range':`0-${Math.max(0,(Array.isArray(data)?data.length:1)-1)}/${total}`},contentType:'application/json',body:JSON.stringify(data)});
  });
  await context.route('**/api/**',route=>route.fulfill({contentType:'application/json',body:'{"counts":{}}'}));
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.goto(panel+'/shirt-catalog/reviews',{waitUntil:'networkidle'});
  await expect(page.locator('article')).toHaveCount(24);
  await page.getByRole('button',{name:'ໜ້າຖັດໄປ',exact:true}).click();
  await expect(page.locator('article')).toHaveCount(1);
  await page.locator('article').getByRole('button',{name:'ແກ້ໄຂ',exact:true}).click();
  let dialog=page.getByRole('dialog');
  await dialog.getByLabel('ຫົວຂໍ້ (ລາວ) *',{exact:true}).fill('Edited real shirts');
  await dialog.getByLabel('ລາຍລະອຽດ (English)',{exact:true}).fill('Customer photos of finished shirts');
  await dialog.getByLabel('ອັບໂຫຼດຮູບ',{exact:true}).setInputFiles([{name:'first.jpg',mimeType:'image/jpeg',buffer:jpeg},{name:'second.jpg',mimeType:'image/jpeg',buffer:jpeg}]);
  await expect(dialog.getByText('ຮູບພາບ (4/12)',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'ເລື່ອນຮູບ 2 ກ່ອນ',exact:true}).click();
  await dialog.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(writes.at(-1).kind,'review');assert.equal(writes.at(-1).images.length,4);assert.ok(writes.at(-1).images[0].url.includes('back=1'));
  assert.equal(uploads.length,2);assert.ok(uploads.every(path=>path.includes('/posts/review/')));
  await page.locator('article').getByRole('button',{name:'ຊ່ອນໂພສ',exact:true}).click();
  await expect(page.locator('article')).toContainText('ແບບຮ່າງ');
  await page.locator('article').getByRole('button',{name:'ລົບ Edited real shirts',exact:true}).click();
  await expect(page.locator('article')).toHaveCount(24);
  await expect(page.getByRole('button',{name:'ໜ້າກ່ອນ',exact:true})).toBeDisabled();
  assert.deepEqual(storageDeletes,[],'Removing posts must preserve source images');
  await page.getByRole('button',{name:'ເພີ່ມໂພສ',exact:true}).click();dialog=page.getByRole('dialog');
  await dialog.getByLabel('ຫົວຂໍ້ (ລາວ) *',{exact:true}).fill('A saved draft');
  await dialog.getByLabel('ເຜີຍແຜ່ໃຫ້ລູກຄ້າເຫັນ',{exact:true}).check();
  const previousWrites=writes.length;await dialog.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();
  await expect(dialog).toBeVisible();assert.equal(writes.length,previousWrites,'Publishing without photos is rejected');
  await dialog.getByLabel('ເຜີຍແຜ່ໃຫ້ລູກຄ້າເຫັນ',{exact:true}).uncheck();
  await dialog.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();await expect(dialog).toHaveCount(0);
  assert.equal(writes.at(-1).is_published,false);
  await page.getByRole('navigation',{name:'ຈັດການໜ້າຮ້ານ',exact:true}).getByRole('link',{name:'ລາຍການຜ້າ',exact:true}).click();
  await expect(page.locator('article')).toHaveCount(1);await expect(page.locator('article')).toContainText('Mesh fabric');
  await page.getByRole('button',{name:'ເພີ່ມໂພສ',exact:true}).click();dialog=page.getByRole('dialog');
  await dialog.getByLabel('ຫົວຂໍ້ (ລາວ) *',{exact:true}).fill('Light fabric');
  await dialog.getByLabel('ລາຍລະອຽດ (ລາວ)',{exact:true}).fill('Fabric texture and composition');
  await dialog.getByLabel('ອັບໂຫຼດຮູບ',{exact:true}).setInputFiles({name:'fabric.jpg',mimeType:'image/jpeg',buffer:jpeg});
  await expect(dialog.getByText('ຮູບພາບ (1/12)',{exact:true})).toBeVisible();
  await dialog.getByLabel('ເຜີຍແຜ່ໃຫ້ລູກຄ້າເຫັນ',{exact:true}).check();
  await dialog.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();await expect(dialog).toHaveCount(0);
  assert.equal(writes.at(-1).kind,'fabric');assert.ok(uploads.at(-1).includes('/posts/fabric/'));
  await page.getByLabel('ຄົ້ນຫາໂພສ',{exact:true}).fill('Mesh');await expect(page.locator('article')).toHaveCount(1);await expect(page.locator('article')).toContainText('Mesh fabric');
  await page.getByLabel('ຄົ້ນຫາໂພສ',{exact:true}).fill('');await expect(page.locator('article')).toHaveCount(2);
  await page.goto(panel+'/shirt-catalog/collars',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'ເພີ່ມໂພສ',exact:true}).click();dialog=page.getByRole('dialog');
  await dialog.getByLabel('ຫົວຂໍ້ (ລາວ) *',{exact:true}).fill('Premium collar');
  await dialog.getByLabel('ຫົວຂໍ້ (English)',{exact:true}).fill('Premium collar');
  await dialog.getByLabel('ປະເພດລາຄາ',{exact:true}).selectOption('extra');
  const collarWrites=writes.length;
  await dialog.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();assert.equal(writes.length,collarWrites,'Missing surcharge is rejected');
  await dialog.getByLabel('ຄ່າບວກເພີ່ມ (ກີບ/ໂຕ)',{exact:true}).fill('-1');
  await dialog.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();assert.equal(writes.length,collarWrites,'Negative surcharge is rejected');
  await dialog.getByLabel('ຄ່າບວກເພີ່ມ (ກີບ/ໂຕ)',{exact:true}).fill('20000');
  await dialog.getByLabel('ອັບໂຫຼດຮູບ',{exact:true}).setInputFiles({name:'collar.jpg',mimeType:'image/jpeg',buffer:jpeg});
  await expect(dialog.getByText('ຮູບພາບ (1/12)',{exact:true})).toBeVisible();
  await dialog.getByLabel('ເຜີຍແຜ່ໃຫ້ລູກຄ້າເຫັນ',{exact:true}).check();
  await dialog.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();await expect(dialog).toHaveCount(0);
  assert.equal(writes.at(-1).kind,'collar');assert.equal(writes.at(-1).surcharge_lak,20000);assert.equal(writes.at(-1).collar_pricing,'extra');assert.ok(uploads.at(-1).includes('/posts/collar/'));
  rows.push({...record(80,'collar'),title_lo:'Normal collar',title_en:'Normal collar',collar_pricing:'standard',surcharge_lak:0});
  missing=true;await page.reload({waitUntil:'networkidle'});await expect(page.getByRole('alert').filter({hasText:'20261019_create_storefront_collars.sql'})).toBeVisible();missing=false;
  await page.goto(panel+'/shirt-catalog/fabrics',{waitUntil:'networkidle'});
  permission=false;await page.reload({waitUntil:'networkidle'});await expect(page.getByRole('button',{name:'ເພີ່ມໂພສ',exact:true})).toBeDisabled();await expect(page.locator('article').first().getByRole('button',{name:'ແກ້ໄຂ',exact:true})).toBeDisabled();
  permission=true;missing=true;await page.reload({waitUntil:'networkidle'});await expect(page.getByRole('alert').filter({hasText:'20261016_create_storefront_posts.sql'})).toBeVisible();await expect(page.getByRole('button',{name:'ເພີ່ມໂພສ',exact:true})).toBeDisabled();missing=false;
  for(let n=60;n<65;n++)rows.push(record(n));
  rows.push({...record(70),title_lo:'Unsafe text test',title_en:'',description_lo:'<img src=x onerror=alert(1)>',description_en:''});
  // Review and fabric feeds show only published, separately managed posts.
  await page.goto(store+'/reviews/',{waitUntil:'networkidle'});
  await expect(page.locator('#posts-grid .post-card')).toHaveCount(24);
  assert.equal(await page.evaluate(()=>Boolean(document.getElementById('posts-page').compareDocumentPosition(document.getElementById('contact')) & Node.DOCUMENT_POSITION_FOLLOWING)),true,'Page content appears before the contact/footer section');
  assert.equal(feedRequests.at(-1).p_kind,'review');
  await page.locator('#posts-grid .post-card-button').first().click();await expect(page.locator('#post-dialog')).toBeVisible();
  await expect(page.locator('#post-image-count')).toHaveText('1 / 2');await page.locator('#post-image-next').click();await expect(page.locator('#post-image-count')).toHaveText('2 / 2');await page.keyboard.press('ArrowLeft');await expect(page.locator('#post-image-count')).toHaveText('1 / 2');await page.keyboard.press('Escape');
  await page.locator('#posts-more').click();await expect(page.locator('#posts-grid .post-card')).toHaveCount(30);await expect(page.locator('#posts-more')).toBeHidden();
  await page.locator('#posts-search').fill('Unsafe text');await expect(page.locator('#posts-grid .post-card')).toHaveCount(1);await expect(page.locator('#posts-grid .post-card-copy p')).toHaveText('<img src=x onerror=alert(1)>');assert.equal(await page.locator('#posts-grid img').count(),1,'Post text is never parsed as HTML');
  await page.locator('#language').click();await expect(page.locator('#posts-title')).toHaveText('Customer photos');await expect(page.locator('#posts-grid h2')).toHaveText('Unsafe text test');
  await page.goto(store+'/fabrics/',{waitUntil:'networkidle'});await expect(page.locator('#posts-grid .post-card')).toHaveCount(2);assert.equal(feedRequests.at(-1).p_kind,'fabric');await expect(page.locator('#posts-title')).toHaveText('Fabrics');
  await page.locator('#posts-search').fill('nothing found');await expect(page.locator('#posts-status')).toHaveText('No matching posts found.');await page.locator('#posts-clear-search').click();await expect(page.locator('#posts-grid .post-card')).toHaveCount(2);
  await page.goto(store+'/collars/',{waitUntil:'networkidle'});await expect(page.locator('#posts-grid .post-card')).toHaveCount(2);
  await expect(page.locator('#posts-grid')).toContainText('+20,000');
  await page.locator('#collar-filters button').nth(2).click();await expect(page.locator('#posts-grid .post-card')).toHaveCount(1);await expect(page.locator('#posts-grid h2')).toHaveText('Premium collar');assert.equal(feedRequests.at(-1).p_pricing,'extra');
  await page.locator('#posts-grid .post-card-button').click();await expect(page.locator('#post-detail-price')).toContainText('+20,000');await page.keyboard.press('Escape');
  await page.locator('#collar-filters button').nth(1).click();await expect(page.locator('#posts-grid h2')).toHaveText('Normal collar');await expect(page.locator('#posts-grid .collar-price')).not.toContainText('+');
  await page.locator('#collar-filters button').first().click();await expect(page.locator('#posts-grid .post-card')).toHaveCount(2);
  await page.screenshot({path:'/tmp/bg-store-collars-desktop.png',fullPage:false});
  for(const width of [1440,1280,1050,800,600,390,320]){
    await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Menu and cards fit ${width}px`);
  }
  await page.locator('#menu-toggle').click();await expect(page.locator('#navigation a[data-page="reviews"]')).toBeVisible();await page.locator('#navigation a[data-page="reviews"]').click();await expect(page.locator('#posts-title')).toHaveText('Customer photos');
  await page.screenshot({path:'/tmp/bg-store-reviews-mobile.png',fullPage:false});
  failFeed=true;await page.reload({waitUntil:'networkidle'});await expect(page.locator('#posts-status')).toContainText('We could not load these posts');failFeed=false;await page.locator('#posts-status button').click();await expect(page.locator('#posts-grid .post-card')).toHaveCount(24);
  missing=true;await page.reload({waitUntil:'networkidle'});await expect(page.locator('#posts-status')).toHaveText('No published posts yet.');await expect(page.locator('#posts-grid .post-card')).toHaveCount(0);
  assert.deepEqual(errors,[]);
  console.log('Review/fabric/collar browser checks passed: upload, edit, reorder, publish/hide, drafts, delete/page clamping, search, permissions, migration error, public feeds, galleries, language, XSS, pagination, failures and 320–1440px navigation.');
}finally{await browser.close();}
