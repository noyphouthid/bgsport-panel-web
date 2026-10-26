// Local browser validation. All API/storage traffic is mocked; no production writes.
import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
process.loadEnvFile(new URL('../.env.local', import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const profile = { ...user, auth_user_id: user.id, full_name: 'QA Admin', role: 'superadmin', is_active: true, permission_settings: {} };
const session = { access_token: 'qa-token', refresh_token: 'qa-refresh', expires_at: Math.floor(Date.now()/1000)+3600, token_type: 'bearer', user };
const order = { id: '00000000-0000-4000-8000-000000000002', order_code: 'PK26-QA', factory_bill_code: null, production_completed_at: '2026-10-01T00:00:00Z', status: 'in_progress', shipment_status: 'pending', balance: 100000, net_total: 100000, short_qty: 10, long_qty: 0, initial_deposit: 0, design_deposit: 0 };
const qr = { id: '00000000-0000-4000-8000-000000000003', order_id: order.id, order_code: order.order_code, label_status: 'received', received_at: '2026-10-02T00:00:00Z' };
let saved = { id: 'request-1', request_no: 'SDR-QA', order_id: order.id, qr_label_id: qr.id, delivery_method: 'transport', status: 'draft', delivery_scheduled_at: '2026-10-26T08:00:00Z', delivery_person_name: 'QA Admin', payment_amount: 1000, payment_method: 'transfer', transport_receiver_name: 'Receiver', transport_receiver_phone: '02012345678', transport_branch: 'Station', transport_city: 'City', transport_province: 'Province', transport_providers: ['ລົດໂດຍສານ'], transfer_slip_url: `${backend.origin}/storage/v1/object/public/shipment-delivery-slips/legacy-slip.png`, transfer_slip_path: 'legacy-slip.png', handoff_photo_url: `${backend.origin}/storage/v1/object/public/shipment-delivery-slips/legacy-product.png`, handoff_photo_path: 'legacy-product.png', handoff_photo_file_name: 'legacy-product.png' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const image = (name) => ({ name, mimeType: 'image/png', buffer: png });
const uploads = [], writes = [], errors = [];
let schemaMissing = false, uploadFails = false;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${backend.hostname.split('.')[0]}-auth-token`, session });
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname.startsWith('/storage/v1/object/public/')) { await route.fulfill({ contentType: 'image/png', body: png }); return; }
    if (url.pathname.startsWith('/storage/') && req.method() === 'POST') {
      uploads.push(url.pathname);
      await route.fulfill({ status: uploadFails ? 400 : 200, json: uploadFails ? { message: 'QA upload failed' } : { Key: url.pathname } }); return;
    }
    if (schemaMissing && url.searchParams.get('select') === 'transfer_slips,handoff_photos') {
      await route.fulfill({ status: 400, json: { code: '42703', message: 'missing column' } }); return;
    }
    let data = [];
    if (url.pathname === '/auth/v1/user') data = user;
    else if (url.pathname === '/rest/v1/users') data = [profile];
    else if (url.pathname === '/rest/v1/orders') data = [order];
    else if (url.pathname === '/rest/v1/order_qr_labels') data = [qr];
    else if (url.pathname === '/rest/v1/shipment_delivery_requests') data = url.searchParams.get('limit') === '0' ? [] : [saved];
    if (['POST','PATCH'].includes(req.method())) {
      const body = req.postDataJSON(); writes.push({ table: url.pathname.split('/').pop(), body });
      if (url.pathname.endsWith('/shipment_delivery_requests')) { saved = { ...saved, ...body }; data = saved; }
      else data = { ...body, id: 'saved-id' };
    }
    if (req.headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ status: 200, json: data });
  });
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const payload = url.pathname === '/api/shipments/approvals'
      ? { ok: true, viewerRole: 'superadmin', viewerUserId: user.id, rows: [{...saved, status: 'submitted', delivery_method: 'pickup'}], ordersById: { [order.id]: order }, usersById: { [user.id]: profile }, transportNotesByRequestId: {} }
      : { counts: {} };
    await route.fulfill({ json: payload });
  });
  const page = await context.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => errors.push(e.message));
  const openOrder = async () => {
    await page.goto('http://localhost:3000/shipments', {waitUntil:'networkidle'});
    await page.getByPlaceholder('ວາງ QR ໂຮງງານ, QR ຂອງຮ້ານ, ລະຫັດບິນໂຮງງານ ຫຼື ລະຫັດອໍເດີ').fill(order.order_code);
    await page.getByRole('button',{name:'ເປີດອໍເດີ',exact:true}).click();
    await page.getByRole('group',{name:'ແນບສະລິບການໂອນເງິນ',exact:true}).waitFor();
    await page.getByRole('button',{name:'ລຶບ legacy-slip.png',exact:true}).waitFor();
  };
  await openOrder();
  const slips = page.getByRole('group',{name:'ແນບສະລິບການໂອນເງິນ',exact:true});
  const products = page.getByRole('group',{name:'ຮູບສິນຄ້າ / ຮູບພາບການຮັບເຄື່ອງ',exact:true});
  await slips.locator('input[multiple]').setInputFiles([image('slip-1.png'),{name:'slip-2.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n') }]);
  await slips.locator('input[capture]').setInputFiles(image('camera.png'));
  await slips.locator('input[capture]').setInputFiles(image('camera-again.png'));
  await slips.getByRole('button',{name:'ລຶບ camera.png',exact:true}).click();
  assert.equal(await slips.locator('a').count(),4,'Selections append and camera captures accumulate');
  assert.equal(await slips.getByText('ເປີດ PDF',{exact:true}).count(),1,'PDF gets a link instead of an image');
  await products.locator('input[multiple]').setInputFiles([image('product-1.png'),image('product-2.png')]);
  await products.getByRole('button',{name:'ລຶບ product-1.png',exact:true}).click();
  const save = page.getByRole('button',{name:'ບັນທຶກບິນ ແລະ ການຈັດສົ່ງ',exact:true});
  schemaMissing = true;
  await save.click(); await page.getByText(/20261031_add_shipment_attachment_galleries.sql/).waitFor();
  assert.equal(uploads.length,0); assert.equal(writes.length,0,'Missing schema fails before uploads or database writes');
  schemaMissing = false;
  uploadFails = true;
  await save.click(); await save.waitFor({state:'visible'});
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(b=>b.textContent.includes('ກຳລັງບັນທຶກ')));
  assert.equal(writes.length,0,'An upload failure cannot save a partial gallery');
  assert.equal(await slips.locator('a').count(),4,'Failed uploads keep selected files');
  uploadFails = false;
  await save.click();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(b=>b.textContent.includes('ກຳລັງບັນທຶກ')));
  assert.equal(saved.transfer_slips.length,4); assert.equal(saved.handoff_photos.length,2);
  assert.equal(saved.transfer_slip_url,saved.transfer_slips[0].url); assert.equal(saved.handoff_photo_url,saved.handoff_photos[0].url);
  assert.equal(new Set(saved.transfer_slips.map(i=>i.path)).size,4,'Every file uses a distinct storage path');
  assert.ok(saved.transfer_slips.every(i=>!('file' in i)));
  const uploadCount = uploads.length;
  await openOrder();
  assert.equal(await slips.locator('a').count(),4); assert.equal(await products.locator('a').count(),2,'All images survive reload');
  await slips.getByRole('button',{name:'ລຶບ slip-1.png',exact:true}).click();
  await save.click();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(b=>b.textContent.includes('ກຳລັງບັນທຶກ')));
  assert.equal(saved.transfer_slips.length,3); assert.equal(uploads.length,uploadCount,'Editing saved lists does not reupload existing media');
  for (const width of [375,1440]) {
    await page.setViewportSize({width,height:1000});
    assert.ok(await slips.evaluate(el=>el.scrollWidth<=el.clientWidth),'Gallery fits the viewport');
  }
  await slips.screenshot({path:'/tmp/bgsport-shipment-slips.png'});
  await products.screenshot({path:'/tmp/bgsport-shipment-products.png'});
  order.balance = 0; saved.payment_amount = 0;
  await openOrder();
  await save.click();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(b=>b.textContent.includes('ກຳລັງບັນທຶກ')));
  assert.equal(saved.transfer_slips.length,3,'Slips persist even without an outstanding payment');
  assert.equal(saved.payment_amount,0);
  saved.status = 'submitted'; await openOrder();
  assert.equal(await slips.locator('input[multiple]').isDisabled(),true); assert.equal(await products.getByRole('button',{name:'ລຶບ product-2.png',exact:true}).isDisabled(),true,'Submitted requests lock gallery edits');
  await page.goto('http://localhost:3000/shipments/approvals',{waitUntil:'networkidle'});
  assert.equal(await page.getByRole('link',{name:/^ເບິ່ງສະລິບ/}).count(),3); assert.equal(await page.getByRole('link',{name:/^ເບິ່ງຮູບສິນຄ້າ/}).count(),2,'Approvers can open every attachment');
  assert.deepEqual(errors,[]);
  console.log('PASS: legacy media, multiple selection, repeated camera, PDF preview, removal, schema/upload errors, save/reload, primary compatibility, submitted lock, approvals and mobile galleries.');
} finally { await browser.close(); }
