// Run against the local panel. All backend calls are mocked; no live data changes.
import assert from 'node:assert/strict';
const { chromium, expect } = await import(process.argv[2] || 'playwright/test');
process.loadEnvFile(new URL('../.env.local', import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = { id: uid(1), email: 'qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const profile = { ...user, auth_user_id: user.id, full_name: 'QA Admin', role: 'superadmin', is_active: true, permission_settings: {} };
const session = { access_token: 'qa-token', refresh_token: 'qa-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user };
const categories = [{id:'teamwear',lo:'ເສື້ອທີມງານ',en:'Teamwear'}, {id:'polo',lo:'ໂປໂລ',en:'Polo'}, {id:'football',lo:'ບານເຕະ',en:'Football'}];
const legacy = { id: uid(10), design_code: 'BG-TEAM', name_lo: 'QA Teamwear', name_en: '', description_lo: '', description_en: '', caption_lo: '', caption_en: '', slogan_lo: '', slogan_en: '', category: 'teamwear', placement: 'catalog', images: [{ url: 'https://assets.example.invalid/design.jpg' }], price_lak: null, is_published: true, is_featured: false };
let entries = [legacy], saved = null, batches = [], schemaMissing = false;
const mockup = { id: uid(20), file_url: 'https://assets.example.invalid/batch.jpg', file_name: 'batch.jpg', file_path: 'batch.jpg', queue_entry_id: uid(30), queue: { type_code: 'RK', order_no: '26-10001' } };
const errors = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({key, session}) => localStorage.setItem(key, JSON.stringify(session)), {key:`sb-${backend.hostname.split('.')[0]}-auth-token`,session});
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split('/').pop();
    let data = [];
    if (url.pathname === '/auth/v1/user') data = user;
    else if (table === 'users') data = [profile];
    else if (table === 'can_manage_shirt_catalog') data = true;
    else if (table === 'storefront_categories') data = categories;
    else if (table === 'design_queue_mockups') data = [mockup];
    else if (table === 'shirt_catalog_entries') {
      if (url.searchParams.get('select') === 'category_ids' && schemaMissing) {
        await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'42703',message:'column category_ids does not exist'})});
        return;
      }
      if (req.method() === 'PATCH') {
        saved = req.postDataJSON(); entries = [{...legacy,...saved}]; data = [{id:legacy.id}];
      } else if (url.searchParams.has('design_code')) data = [];
      else data = entries;
    } else if (table === 'publish_shirt_catalog_batch') {
      batches.push(req.postDataJSON().p_entries); data = [uid(50)];
    }
    if (req.headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await context.route('**/api/**', route => route.fulfill({status:200,contentType:'application/json',body:'{"counts":{}}'}));
  await context.route('https://assets.example.invalid/**', route => route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'}));
  const page = await context.newPage();
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/shirt-catalog`, {waitUntil:'networkidle'});
  const card = page.locator('article').filter({hasText:'BG-TEAM'});
  await card.getByRole('button',{name:'ແກ້ໄຂ',exact:true}).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox',{name:'ເສື້ອທີມງານ',exact:true})).toBeChecked();
  await dialog.getByRole('checkbox',{name:'ໂປໂລ',exact:true}).check();
  await dialog.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  assert.deepEqual(saved.category_ids,['teamwear','polo']);
  assert.equal(saved.category,'teamwear');
  await expect(card).toContainText('ເສື້ອທີມງານ · ໂປໂລ');
  await page.getByRole('checkbox',{name:'ໂປໂລ',exact:true}).check();
  await expect(card).toHaveCount(1);
  await card.getByRole('button',{name:'ແກ້ໄຂ',exact:true}).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox',{name:'ໂປໂລ',exact:true})).toBeChecked();
  await dialog.getByRole('checkbox',{name:'ເສື້ອທີມງານ',exact:true}).uncheck();
  await dialog.getByRole('checkbox',{name:'ໂປໂລ',exact:true}).uncheck();
  const previousSave = saved;
  await dialog.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();
  await expect(dialog).toBeVisible();
  assert.equal(saved,previousSave,'Empty tag selection must not save');
  await dialog.getByRole('checkbox',{name:'ໂປໂລ',exact:true}).check();
  await dialog.getByRole('button',{name:'ບັນທຶກ',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  assert.deepEqual(saved.category_ids,['polo']);
  assert.equal(saved.category,'polo');
  await page.getByRole('checkbox',{name:'ໂປໂລ',exact:true}).uncheck();
  async function prepareBatch() {
    await page.getByRole('button',{name:'ເລືອກຈາກຄັງເປັນກຸ່ມ',exact:true}).click();
    const batch = page.getByRole('dialog');
    await batch.getByRole('checkbox',{name:'ໂປໂລ',exact:true}).check();
    await batch.getByRole('checkbox',{name:'ເລືອກຮູບ batch.jpg',exact:true}).check();
    await batch.getByRole('button',{name:'ຕໍ່ໄປ: ຈັດກຸ່ມແລະປະເພດ',exact:true}).click();
    await expect(batch.getByRole('checkbox',{name:'ເສື້ອທີມງານ',exact:true})).toBeChecked();
    await expect(batch.getByRole('checkbox',{name:'ໂປໂລ',exact:true})).toBeChecked();
    return batch;
  }
  const batch = await prepareBatch();
  await batch.getByRole('button',{name:'ເຜີຍແຜ່ 1 ແບບ',exact:true}).click();
  await expect(batch).toHaveCount(0);
  assert.deepEqual(batches[0][0].category_ids,['teamwear','polo']);
  schemaMissing = true;
  const blocked = await prepareBatch();
  await blocked.getByRole('button',{name:'ເຜີຍແຜ່ 1 ແບບ',exact:true}).click();
  await expect(page.getByText('ກະລຸນາຕິດຕັ້ງ 20261016_add_shirt_catalog_category_tags.sql ກ່ອນ',{exact:true})).toBeVisible();
  assert.equal(batches.length,1,'Unmigrated database must not silently discard batch tags');
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  await card.getByRole('button',{name:'ແກ້ໄຂ',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('checkbox',{name:'ໂປໂລ',exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('Panel category tags passed: legacy edit, save/reload, secondary filtering, empty selection, removal, batch publishing, migration guard, mobile.');
} finally { await browser.close(); }
