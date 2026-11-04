// Local panel verification. All backend calls are mocked; no production writes.
import assert from 'node:assert/strict';
const { chromium, expect } = await import(process.argv[2] || 'playwright/test');
process.loadEnvFile(new URL('../.env.local', import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = { id: uid(1), email: 'qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: 'qa-token', refresh_token: 'qa-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user };
const item = (n, extra) => ({ source: 'note', source_id: uid(n), transport_note_id: uid(n), delivery_request_id: null, note_no: `TN-${n}`, order_id: uid(n + 100), order_code: `BG-${n}`, receiver_name: `Receiver ${n}`, receiver_phone: '020', transporters: ['HAL'], branch: 'Branch', created_at: '2026-11-01T05:00:00Z', amount: 100000, received_at: null, received_by_name: null, ...extra });
const rows = [item(1, { received_at: '2026-11-02T05:00:00Z', received_by_name: 'QA' }), item(2, {})];
let role = 'accountant', reply = null, cancelError = null;
const errors = [], cancels = [], dialogs = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${backend.hostname.split('.')[0]}-auth-token`, session });
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split('/').pop();
    let data = [];
    if (url.pathname === '/auth/v1/user') data = user;
    else if (table === 'users') data = [{ ...user, auth_user_id: user.id, full_name: 'QA', role, is_active: true, permission_settings: {} }];
    else if (table === 'list_transport_cod') {
      const received = rows.filter(row => row.received_at), pending = rows.filter(row => !row.received_at);
      const sum = list => list.reduce((total, row) => total + row.amount, 0);
      data = { rows, total: rows.length, summary: { count: rows.length, total: sum(rows), pending_count: pending.length, pending_amount: sum(pending), received_count: received.length, received_amount: sum(received) } };
    } else if (table === 'cancel_transport_cod_receipt') {
      const input = req.postDataJSON();
      cancels.push(input);
      if (cancelError) { await route.fulfill({ status: 400, json: cancelError }); return; }
      const row = rows.find(row => row.source_id === input.p_source_id);
      row.received_at = null; row.received_by_name = null;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (req.headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ status: 200, json: data });
  });
  await context.route('**/api/**', route => route.fulfill({ json: { counts: {} } }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { dialogs.push(dialog.message()); return reply === null ? dialog.dismiss() : dialog.accept(reply); });
  const open = () => page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/shipments/cod`, { waitUntil: 'networkidle' });
  const bodyRows = page.getByRole('table', { name: 'ລາຍການ COD', exact: true }).locator('tbody tr');
  const button = bodyRows.filter({ hasText: 'TN-1' }).getByRole('button', { name: 'ຍົກເລີກຮັບຍອດ', exact: true });

  await open();
  await expect(button).toBeVisible();
  await expect(bodyRows.filter({ hasText: 'TN-2' }).getByRole('button', { name: 'ຍົກເລີກຮັບຍອດ', exact: true })).toHaveCount(0);

  reply = null; await button.click();
  assert.equal(cancels.length, 0, 'Dismissing the prompt never writes');
  assert.match(dialogs.at(-1), /100,000/);
  reply = '   '; await button.click();
  assert.equal(cancels.length, 0, 'A blank reason never writes');
  await expect(page.getByText('ກະລຸນາໃສ່ເຫດຜົນທີ່ຍົກເລີກ').first()).toBeVisible();

  cancelError = { code: '22023', message: 'cod_order_closed' };
  reply = 'Pressed by mistake'; await button.click();
  await expect(page.getByText(/ຖືກປິດງານແລ້ວ/).first()).toBeVisible();
  assert.ok(rows[0].received_at, 'A failed cancel leaves the item received');
  await expect(button).toBeEnabled();

  cancelError = null; await button.click();
  await expect(bodyRows.filter({ hasText: 'TN-1' }).getByRole('button', { name: 'ຮັບຍອດ COD ແລ້ວ', exact: true })).toBeVisible();
  assert.deepEqual(cancels.at(-1), { p_source: 'note', p_source_id: uid(1), p_reason: 'Pressed by mistake' });

  rows[0].received_at = '2026-11-02T05:00:00Z'; rows[0].received_by_name = 'QA';
  role = 'staff'; await open();
  await expect(bodyRows.filter({ hasText: 'TN-1' })).toContainText('ບັນທຶກແລ້ວ');
  await expect(button).toHaveCount(0);

  assert.deepEqual(errors, []);
  console.log('COD cancel browser passed: button only on received rows, prompt dismissal, blank reason, closed-order error, success returns row to pending, hidden from staff.');
} finally { await browser.close(); }
