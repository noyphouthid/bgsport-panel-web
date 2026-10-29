// Run against the local development server. All backend calls are mocked.
import assert from "node:assert/strict";
const { chromium } = await import(process.argv[2] || "playwright");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = { id: uid(1), email: "qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const profile = { ...user, auth_user_id: user.id, full_name: "QA Admin", role: "superadmin", is_active: true, permission_settings: {} };
const designer = { ...profile, id: uid(2), auth_user_id: uid(2), full_name: "QA Graphic", role: "graphic" };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: Math.floor(Date.now()/1000)+3600, token_type: "bearer", user };
const fabric = { id: uid(3), name: "QA Fabric", short_price: 100000, long_price: 120000, long_add: 20000, is_active: true };
let queue = { id: uid(4), queue_number: "0001", type_code: "PK26", order_no: "10001", customer_name: "QA Team", customer_phone: "20 99 999 999", work_category: "sports", design_payment_type: null, design_deposit_amount: null, queue_date: "2026-10-15", queue_year: 2026, queue_month: 10, queue_sequence: 1, order_sequence: 1, graphic_user_id: designer.id, is_designed: false, style_name: "ງານປົກກະຕິ", created_at: "2026-10-15T00:00:00Z" };
let quotation = null, deposit = null;
let manualMigrationReady = true;
const writes = [], errors = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(({key,session}) => { localStorage.setItem(key, JSON.stringify(session)); window.print = () => { window.__printed = (window.__printed || 0) + 1; }; }, { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split("/").pop();
    if (table === "quotation_design_deposit_is_manual" && !manualMigrationReady) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "PGRST202", message: "Could not find the function public.quotation_design_deposit_is_manual in the schema cache" }) });
      return;
    }
    let data = [];
    if (url.pathname === "/auth/v1/user") data = user;
    else if (table === "users") data = url.searchParams.has("auth_user_id") || url.searchParams.has("email") ? [profile] : [profile, designer];
    else if (table === "internal_collar_types") data = [{ code: "none", label: "ຄໍປົກກະຕິ", unit_price: 0, sort_order: 0, is_active: true }, { code: "polo", label: "ຄໍໂປໂລ", unit_price: 20000, sort_order: 10, is_active: true }];
    else if (table === "internal_work_categories") data = [{ code: "sports", label: "ເສື້ອກິລາ", sort_order: 10, is_active: true }];
    else if (table === "fabrics") data = [fabric];
    else if (table === "order_code_types") data = [{ code: "PK26", type_code: "PK26", is_active: true, sort_order: 1 }];
    else if (table === "design_queue_entries") data = [queue];
    else if (table === "quotation_drafts") data = quotation ? [quotation] : [];
    else if (table === "factory_deposit_orders") data = deposit ? [deposit] : [];
    if (["POST", "PATCH"].includes(req.method())) {
      const body = req.postDataJSON();
      writes.push({ table, method: req.method(), body });
      if (table === "quotation_design_deposit_is_manual") data = true;
      else if (table === "search_design_queue_customers") data = [queue];
      else if (table === "create_design_queue_entry") { queue = { ...queue, customer_name: body.p_customer_name, customer_phone: body.p_customer_phone, work_category: body.p_work_category, design_payment_type: body.p_design_payment_type, design_deposit_amount: body.p_design_deposit_amount }; data = queue; }
      else if (table === "design_queue_entries") { queue = { ...queue, ...body }; data = queue; }
      else if (table === "quotation_drafts") { quotation = { ...quotation, ...body, id: uid(5), quote_no: quotation?.quote_no || "QT26-10-000" }; data = quotation; }
      else if (table === "factory_deposit_orders") { deposit = { ...deposit, ...body, id: uid(6), deposit_no: deposit?.deposit_no || "DPF26-10-000" }; data = deposit; }
      else data = { ...body, id: uid(7) };
    }
    if (req.headers().accept?.includes("vnd.pgrst.object") && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await context.route("**/api/**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"counts":{}}' }));
  const page = await context.newPage();
  page.on("dialog", d => d.accept());
  page.on("pageerror", e => errors.push(e.message));
  const field = text => page.locator("label").filter({ hasText: new RegExp(`^${text}$`) }).locator("..").locator("input,select").first();
  await page.goto("http://localhost:3000/design-queue", { waitUntil: "networkidle" });
  await page.getByLabel("ປະເພດງານ / ກຸ່ມເສື້ອ").selectOption("sports");
  await field("ຊື່ລູກຄ້າ").fill("QA Team");
  await field("ເບີໂທ / ຕິດຕໍ່").fill("20 99 999 999");
  await field("ກຣາຟິກ").selectOption(designer.id);
  const designPaymentType = page.getByLabel("ຄ່າອອກແບບ", { exact: true });
  const depositAmountField = page.getByLabel("ຈຳນວນເງິນມັດຈຳທີ່ໄດ້ຮັບ (ກີບ)", { exact: true });
  assert.equal(await designPaymentType.inputValue(), "free");
  assert.equal(await depositAmountField.count(), 0);
  await designPaymentType.selectOption("deposit");
  await page.getByRole("button", { name: "ບັນທຶກຄິວໃໝ່" }).click();
  await page.getByText("ກະລຸນາປ້ອນຈຳນວນເງິນມັດຈຳທີ່ໄດ້ຮັບໃຫ້ຫຼາຍກວ່າ 0", { exact: true }).waitFor();
  assert.equal(writes.filter(w => w.table === "create_design_queue_entry").length, 0);
  await depositAmountField.fill("100000.50");
  await designPaymentType.selectOption("free");
  assert.equal(await depositAmountField.count(), 0);
  await designPaymentType.selectOption("deposit");
  assert.equal(await depositAmountField.inputValue(), "");
  await depositAmountField.fill("100000.50");
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith("/rpc/create_design_queue_entry")),
    page.getByRole("button", { name: "ບັນທຶກຄິວໃໝ່" }).click(),
  ]);
  const created = writes.find(w => w.table === "create_design_queue_entry").body;
  assert.equal(created.p_customer_name, "QA Team");
  assert.equal(created.p_work_category, "sports");
  assert.equal(created.p_design_payment_type, "deposit");
  assert.equal(created.p_design_deposit_amount, 100000.5);
  await page.getByRole("button", { name: "ແກ້ໄຂ", exact: true }).click();
  assert.equal(await designPaymentType.inputValue(), "deposit");
  assert.equal(await depositAmountField.inputValue(), "100000.5");
  await page.goto("http://localhost:3000/quotations/new", { waitUntil: "networkidle" });
  await page.getByRole("searchbox").fill("2099999999");
  await page.getByRole("button", { name: /QA Team · PK26-10001/ }).click();
  assert.equal(await page.getByLabel("ເບີໂທ", { exact: true }).inputValue(), queue.customer_phone);
  assert.equal(await field("ລະຫັດອໍເດີ").inputValue(), "PK26-10001");
  assert.equal(await page.getByLabel("ປະເພດງານ / ກຸ່ມເສື້ອ").inputValue(), "sports");
  assert.equal(await field("ເລກທີ່ໃບປະເມີນ").getAttribute("readonly"), "");
  assert.equal(await page.getByLabel("ຫັກຄ່າແບບ", { exact: true }).inputValue(), "", "A paid customer queue must not auto-deduct the old payment");
  assert.equal(await page.getByLabel("ຫັກຄ່າແບບ", { exact: true }).getAttribute("readonly"), null);
  // An older backend must not save or print a bill using its automatic-fee trigger.
  manualMigrationReady = false;
  await page.getByRole("button", { name: "ພິມ A5", exact: true }).click();
  await page.getByText("ກະລຸນາຮັນ migration 20261101_manual_quotation_design_deposits.sql ໃນ Supabase ກ່ອນບັນທຶກໃບປະເມີນ", { exact: true }).waitFor();
  assert.equal(writes.filter(w => w.table === "quotation_drafts").length, 0);
  assert.equal(await page.evaluate(() => window.__printed || 0), 0);
  manualMigrationReady = true;
  await page.getByLabel("ຫັກຄ່າແບບ", { exact: true }).fill("25000.50");
  await page.getByRole("searchbox").fill("2099999999");
  await page.getByRole("button", { name: /QA Team · PK26-10001/ }).click();
  assert.equal(Number(await page.getByLabel("ຫັກຄ່າແບບ", { exact: true }).inputValue()), 25000.5, "Customer lookup cannot overwrite an explicitly entered deduction");
  // A linked quotation can carry a repeat-order suffix without losing its queue.
  await field("ລະຫັດອໍເດີ").fill("RK26-9124+2");
  await page.getByRole("button", { name: "ພິມ A5", exact: true }).click();
  await page.waitForFunction(() => window.__printed === 1);
  assert.equal(quotation.design_queue_entry_id, queue.id);
  assert.equal(quotation.order_code, "RK26-9124+2");
  assert.equal(quotation.work_category, "sports");
  assert.equal(quotation.design_deposit, 25000.5);
  assert.equal(await field("ເລກທີ່ໃບປະເມີນ").inputValue(), "QT26-10-000");
  await page.getByRole("button", { name: "ສ້າງໃບມັດຈຳ", exact: true }).first().click();
  await page.waitForURL(/factory-deposit-orders\/new\?draftId=/);
  await page.waitForLoadState("networkidle");
  assert.equal(await field("ລະຫັດອໍເດີ").inputValue(), "RK26-9124+2");
  assert.equal(await field("ເລກທີ່ໃບປະເມີນ").inputValue(), "QT26-10-000");
  assert.equal(await page.getByLabel("ປະເພດງານ / ກຸ່ມເສື້ອ").inputValue(), "sports");
  assert.equal(writes.filter(w => w.table === "quotation_drafts" && w.method === "POST").length, 1, "Printing followed by deposit creation must update the saved quotation");
  await field("ລະຫັດອໍເດີ").fill("RK26-9124+A");
  await field("ຊື່ທີມ").fill("QA Team");
  await page.getByLabel("ແອັດມິນ", { exact: true }).selectOption(profile.id);
  await page.getByLabel("ຜູ້ອອກແບບ", { exact: true }).selectOption(designer.id);
  await page.getByRole("button", { name: /ບັນທຶກຮ່າງ/ }).first().click();
  await page.locator(".swal2-confirm").click();
  await page.waitForURL("**/factory-deposit-orders");
  assert.equal(deposit.deposit_no, "DPF26-10-000");
  assert.equal(deposit.quotation_quote_no, "QT26-10-000");
  assert.equal(deposit.order_code, "RK26-9124+A");
  assert.equal(deposit.work_category, "sports");
  assert.equal(deposit.design_queue_entry_id, queue.id);
  assert.equal(deposit.design_deposit, 25000.5);
  await page.goto(`http://localhost:3000/factory-deposit-orders/new?id=${deposit.id}`, { waitUntil: "networkidle" });
  assert.equal(await field("ລະຫັດອໍເດີ").inputValue(), "RK26-9124+A");
  // Conversion must preserve the suffix in the real orders insert payload.
  deposit = { ...deposit, status: "approved" };
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "ບັນທຶກເປັນອໍເດີ", exact: true }).first().click();
  await page.waitForURL("**/factory-deposit-orders");
  assert.equal(writes.find(w => w.table === "orders" && w.method === "POST").body.order_code, "RK26-9124+A");
  assert.equal(deposit.status, "converted");
  // Direct queue handoff also hydrates the same data, including completed queues.
  await page.goto(`http://localhost:3000/quotations/new?queueId=${queue.id}`, { waitUntil: "networkidle" });
  assert.equal(await field("ລະຫັດອໍເດີ").inputValue(), "PK26-10001");
  assert.equal(await page.getByLabel("ຫັກຄ່າແບບ", { exact: true }).inputValue(), "", "A new bill for the same paid queue starts with no deduction");
  // Editing a paid queue to free clears its stored amount, without changing a saved quotation.
  await page.goto("http://localhost:3000/design-queue", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "ແກ້ໄຂ", exact: true }).click();
  await designPaymentType.selectOption("free");
  assert.equal(await depositAmountField.count(), 0);
  await Promise.all([
    page.waitForResponse(r => r.request().method() === "PATCH" && r.url().includes("/design_queue_entries")),
    page.getByRole("button", { name: "ບັນທຶກການແກ້ໄຂ", exact: true }).click(),
  ]);
  assert.equal(queue.design_deposit_amount, null);
  assert.equal(queue.design_payment_type, "free");
  await page.goto(`http://localhost:3000/quotations/new?draftId=${uid(5)}`, { waitUntil: "networkidle" });
  assert.equal(await page.getByLabel("ຫັກຄ່າແບບ", { exact: true }).inputValue(), "25000.5");
  await page.getByRole("searchbox").fill("2099999999");
  await page.getByRole("button", { name: /QA Team · PK26-10001/ }).click();
  assert.equal(await page.getByLabel("ຫັກຄ່າແບບ", { exact: true }).inputValue(), "25000.5", "Selecting a free queue also leaves the bill's manually entered deduction alone");
  await page.getByRole("button", { name: "ຍົກເລີກການເຊື່ອມ", exact: true }).click();
  assert.equal(await page.getByLabel("ຫັກຄ່າແບບ", { exact: true }).inputValue(), "25000.5", "Unlinking does not change a manually entered amount");
  await page.getByLabel("ຫັກຄ່າແບບ", { exact: true }).fill("");
  await page.getByRole("button", { name: "ພິມ A5", exact: true }).click();
  await page.waitForFunction(() => window.__printed === 1);
  assert.equal(quotation.design_deposit, 0);
  await page.goto(`http://localhost:3000/quotations/new?queueId=${queue.id}`, { waitUntil: "networkidle" });
  assert.equal(await page.getByLabel("ຫັກຄ່າແບບ", { exact: true }).inputValue(), "");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/bgsport-queue-quotation-mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(errors, []);
  console.log("Browser checks passed: queue category/customer save, phone search, linked repeat-order codes, print-before-save, deposit inheritance/save/reopen, manual fees, repeat bills without reused deductions, migration preflight, saved financial history and mobile layout.");
} finally { await browser.close(); }
