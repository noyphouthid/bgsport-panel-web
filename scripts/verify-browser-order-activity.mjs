// Run against the local dev server. Backend, auth and storage are mocked; no production writes.
import assert from "node:assert/strict";
const { chromium } = await import(process.argv[2] || "playwright");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const current = new Date("2026-10-26T10:00:00+07:00");
const user = { id: "00000000-0000-4000-8000-000000000001", email: "qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const profile = { ...user, auth_user_id: user.id, full_name: "ສົມດີ", role: "superadmin", is_active: true, permission_settings: {} };
const graphic = { ...profile, id: "00000000-0000-4000-8000-000000000002", full_name: "ຄຳແພງ", role: "graphic" };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: current.getTime() / 1000 + 43200, token_type: "bearer", user };
const fabric = { id: "fabric-1", name: "ຜ້າໄມໂຄຕາ", short_price: 120000, long_price: 140000, long_add: 20000, is_active: true };
const order = {
  id: "00000000-0000-4000-8000-000000000003", order_code: "RK26-9124+2", order_date: "2026-10-12", created_at: "2026-10-12T00:00:00Z", factory_bill_code: null,
  admin_user_id: profile.id, graphic_user_id: graphic.id, fabric_id: fabric.id, fabric_name: fabric.name, fabric_short_price: 120000, fabric_long_price: 140000,
  short_qty: 10, long_qty: 5, free_qty: 1, qty_3xl: 0, qty_4xl: 0, qty_5xl: 0, qty_6xl: 0, collar_type: "none", collar_qty: 0, sleeve_charge_qty: 0,
  extra_charge: 0, design_deposit: 0, discount: 0, initial_deposit: 0, factory_cost: 500000, gross_total: 1900000, net_total: 1900000, balance: 1900000,
  status: "in_progress", shipment_status: "pending", production_completed_at: "2026-10-12T11:04:00Z",
};
const actions = ["update_order", "receive_customer_payment", "production_completed", "cancel_factory_receipt", "create_order", "close_order"];
const details = ["Updated order details", "Received 120000", "Marked production completed", "Canceled imported stock from edit page", "Created order", "Closed order"];
const fields = ["fabric_name", "fabric_short_price", "fabric_long_price", "customer_paid_full_at", "production_completed_at", "factory_bill_code", "initial_deposit", "factory_cost"].map((label, index) => ({ label, before: index === 0 ? "ຜ້າເກົ່າ" : "0", after: index === 0 ? fabric.name : String((index + 1) * 120000) }));
const histories = Array.from({ length: 28 }, (_, index) => {
  const day = index < 4 ? 26 : index < 8 ? 25 : 24 - Math.floor((index - 8) / 4);
  const actor = index % 2 ? graphic : profile;
  const relatedOrder = index % 4 === 1 ? { id: "other-order", order_code: "PK26-101" } : { id: order.id, order_code: order.order_code };
  return {
    id: `history-${index}`, action: actions[index % actions.length], detail: details[index % actions.length],
    action_at: `2026-10-${day}T0${9 - index % 4}:00:00+07:00`, action_by_user_id: actor.id, actor,
    order_id: relatedOrder.id, order: relatedOrder,
    action_meta: index === 0 ? { summary_lines: [`ລະຫັດອໍເດີ: ${order.order_code}`, "ຈຳນວນລາຍການທີ່ຖືກແກ້: 8 ສ່ວນ"], changed_fields: fields } : null,
  };
});
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ timezoneId: "Asia/Vientiane", viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    assert.ok(req.method() === "GET" || url.pathname.startsWith("/storage/v1/object/list/"), "Verification cannot write to the backend");
    let data = [];
    if (url.pathname === "/auth/v1/user") data = user;
    else if (url.pathname === "/rest/v1/users") data = url.searchParams.has("auth_user_id") ? [profile] : [profile, graphic];
    else if (url.pathname === "/rest/v1/orders") data = [order];
    else if (url.pathname === "/rest/v1/fabrics") data = [fabric];
    else if (url.pathname === "/rest/v1/order_code_types") data = [{ code: "RK26", is_active: true }];
    else if (url.pathname === "/rest/v1/order_status_history") {
      data = histories.filter(row => !url.searchParams.has("order_id") || url.searchParams.get("order_id") === `eq.${row.order_id}`).slice(0, Number(url.searchParams.get("limit") || 1000));
    } else if (url.pathname === "/rest/v1/factory_receipt_items") data = [{ receipt_id: "receipt-1", factory_receipts: { received_at: order.production_completed_at, received_by: "ສົມດີ (ຮັບເຄື່ອງ)", note: "ຮັບເຄື່ອງຈາກໂຮງງານ" } }];
    if (req.headers().accept?.includes("vnd.pgrst.object") && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ json: data });
  });
  await context.route("**/api/**", route => route.fulfill({ json: { counts: {} } }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: current });
  await page.goto("http://localhost:3000/reports/order-activity", { waitUntil: "networkidle" });
  const timeline = page.locator("[data-order-activity-timeline]");
  const entries = timeline.locator("[data-activity-entry]");
  await entries.first().waitFor();
  assert.equal(await entries.count(), 20);
  assert.equal(await entries.first().getAttribute("data-activity-entry"), "history-0");
  await timeline.getByRole("heading", { name: "ມື້ນີ້", exact: true }).waitFor();
  await timeline.getByRole("heading", { name: "ມື້ວານນີ້", exact: true }).waitFor();
  const newest = timeline.locator('[data-activity-entry="history-0"]');
  assert.equal(await newest.locator("details").getAttribute("open"), null);
  await newest.locator("summary").focus(); await newest.locator("summary").press("Enter");
  assert.notEqual(await newest.locator("details").getAttribute("open"), null);
  assert.equal(await newest.getByText("ຕົ້ນທຶນໂຮງງານ", { exact: true }).isVisible(), true, "All fields, including changes beyond the first six, can be opened");
  assert.ok((await newest.innerText()).includes("ຊື່ຜ້າ"));
  assert.equal((await newest.innerText()).includes("fabric_name"), false);
  assert.equal(await newest.getByRole("link", { name: order.order_code }).getAttribute("href"), `/orders/${order.id}/edit`);
  await newest.locator("summary").click();
  await newest.locator("summary").evaluate(element => element.blur());
  await timeline.locator("section").first().screenshot({ animations: "disabled", path: "/tmp/bgsport-activity-report-desktop.png" });
  await timeline.getByRole("button", { name: "ເບິ່ງກິດຈະກຳກ່ອນໜ້າ" }).click();
  assert.equal(await entries.count(), 28);
  await page.getByLabel("ປະເພດກິດຈະກຳ", { exact: true }).selectOption("update_order");
  assert.equal(await entries.count(), histories.filter(row => row.action === "update_order").length);
  await page.getByLabel("ປະເພດກິດຈະກຳ", { exact: true }).selectOption("all");
  assert.equal(await entries.count(), 20, "External filtering resets the visible page");
  await page.getByLabel("ຜູ້ດຳເນີນການ", { exact: true }).selectOption(graphic.id);
  assert.equal(await entries.count(), 14);
  await page.getByLabel("ຜູ້ດຳເນີນການ", { exact: true }).selectOption("all");
  await page.getByLabel("ຈາກວັນທີ").fill("2026-10-26");
  await page.getByLabel("ເຖິງວັນທີ").fill("2026-10-26");
  assert.equal(await entries.count(), 4);
  await page.getByLabel("ຈາກວັນທີ").fill(""); await page.getByLabel("ເຖິງວັນທີ").fill("");
  const search = page.getByPlaceholder("ອໍເດີ, ID, ຊື່...");
  await search.fill("ແກ້ໄຂຂໍ້ມູນອໍເດີ");
  assert.equal(await entries.count(), 5);
  await search.fill("no-matching-activity");
  await timeline.getByText("ບໍ່ມີລາຍການກິດຈະກຳ", { exact: true }).waitFor();
  await search.fill("");
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await timeline.evaluate(el => el.scrollWidth <= el.clientWidth), "Timeline fits small screens");
    assert.ok(await entries.first().evaluate(el => el.scrollWidth <= el.clientWidth), "Entry content does not overflow");
  }
  await timeline.locator("section").first().screenshot({ animations: "disabled", path: "/tmp/bgsport-activity-report-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`http://localhost:3000/orders/${order.id}/edit`, { waitUntil: "networkidle" });
  await entries.first().waitFor();
  assert.equal(await entries.count(), 10);
  assert.ok(await timeline.evaluate(el => el.previousElementSibling.textContent.includes("ຂໍ້ມູນການນຳເຂົ້າ")), "Order history stays below import information");
  await timeline.getByRole("button", { name: "ເບິ່ງກິດຈະກຳກ່ອນໜ້າ" }).click();
  assert.equal(await entries.count(), 20);
  await timeline.getByLabel("ປະເພດກິດຈະກຳ", { exact: true }).selectOption("update_order");
  assert.equal(await entries.count(), 5);
  await timeline.getByLabel("ປະເພດກິດຈະກຳ", { exact: true }).selectOption("all");
  await timeline.locator("section").first().screenshot({ animations: "disabled", path: "/tmp/bgsport-activity-order-desktop.png" });
  await page.setViewportSize({ width: 375, height: 1000 });
  assert.ok(await timeline.evaluate(el => el.scrollWidth <= el.clientWidth));
  await timeline.locator("section").first().screenshot({ animations: "disabled", path: "/tmp/bgsport-activity-order-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  await timeline.locator("section").first().screenshot({ animations: "disabled", path: "/tmp/bgsport-activity-order-dark.png" });
  assert.deepEqual(errors, []);
  console.log("PASS: shared report/order timeline, today/yesterday groups, ordering, keyboard details, all changed fields, Lao labels/search, linked orders, filters, paging, empty state, history placement, 320–1440px layouts and no runtime errors or backend writes.");
} finally { await browser.close(); }
