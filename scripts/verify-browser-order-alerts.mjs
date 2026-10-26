// Run against the local dev server; auth and backend are mocked, with no production writes.
import assert from "node:assert/strict";
const { chromium } = await import(process.argv[2] || "playwright");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const current = new Date("2026-10-27T10:00:00+07:00");
const user = { id: "00000000-0000-4000-8000-000000000001", email: "qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const profile = { ...user, auth_user_id: user.id, full_name: "QA", role: "superadmin", is_active: true, permission_settings: {} };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: current.getTime() / 1000 + 43200, token_type: "bearer", user };
const deposits = [
  ["overdue", "2026-10-26"], ["today", "2026-10-27"], ["tomorrow", "2026-10-28"],
  ["day-2", "2026-10-29"], ["day-3", "2026-10-30"], ["day-4", "2026-10-31"],
  ["received", "2026-10-28"], ["completed", "2026-10-29"],
].map(([id, delivery_date]) => ({
  id, deposit_no: `DEP-${id}`, order_code: `QA-${id}`, order_id: `order-${id}`, factory_bill_code: null,
  customer_name: "QA Customer", customer_phone: "02012345678", team_name: "QA Team", production_sent_date: "2026-10-20",
  delivery_date, production_priority: "normal", urgent_due_date: null, production_items: [], status: "converted", created_at: "2026-10-20T00:00:00Z",
}));
const orders = deposits.map(row => ({
  id: row.order_id, status: "in_progress", closed_at: null, production_completed_at: row.id === "completed" ? "2026-10-26T00:00:00Z" : null,
  shipment_status: "pending", shipment_completed_at: null, order_image_url: null, factory_bill_code: null, short_qty: 10, long_qty: 5, free_qty: 1,
}));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ timezoneId: "Asia/Vientiane", viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
  let alertRequests = 0;
  let empty = false;
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    assert.equal(req.method(), "GET", "Verification cannot write to the backend");
    let data = [];
    if (url.pathname === "/auth/v1/user") data = user;
    else if (url.pathname === "/rest/v1/users") data = [profile];
    else if (url.pathname === "/rest/v1/factory_deposit_orders") {
      alertRequests += 1;
      assert.ok(url.searchParams.getAll("delivery_date").includes("lte.2026-10-30"), "Query includes exactly the next three days");
      data = empty ? [] : deposits.filter(row => row.delivery_date <= "2026-10-30");
    } else if (url.pathname === "/rest/v1/orders") data = orders;
    else if (url.pathname === "/rest/v1/factory_receipt_items") data = [{ order_id: "order-received" }];
    if (req.headers().accept?.includes("vnd.pgrst.object") && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ json: data });
  });
  await context.route("**/api/**", route => route.fulfill({ json: { counts: {} } }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: current });
  await page.goto("http://localhost:3000/order-alerts", { waitUntil: "networkidle" });
  const sections = page.locator("main section");
  await sections.nth(1).getByRole("link", { name: "ເປີດອໍເດີ", exact: true }).first().waitFor();
  assert.equal(await sections.count(), 2);
  assert.equal(await sections.nth(0).getByRole("link", { name: "ເປີດອໍເດີ", exact: true }).count(), 1);
  const upcoming = sections.nth(1);
  assert.equal(await upcoming.getByRole("link", { name: "ເປີດອໍເດີ", exact: true }).count(), 4);
  assert.deepEqual(await upcoming.getByRole("link", { name: "ເປີດອໍເດີ", exact: true }).evaluateAll(links => links.map(link => link.getAttribute("href"))),
    ["today", "tomorrow", "day-2", "day-3"].map(id => `/orders/order-${id}/edit`));
  assert.ok((await upcoming.innerText()).includes("ຮອດກຳນົດມື້ນີ້"));
  assert.ok((await upcoming.innerText()).includes("ອີກ 3 ມື້ຮອດກຳນົດ"));
  for (const excluded of ["day-4", "received", "completed"]) assert.equal(await page.getByText(`QA-${excluded}`, { exact: true }).count(), 0);
  await page.screenshot({ path: "/tmp/bgsport-order-alerts-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 375, height: 1000 });
  await upcoming.screenshot({ path: "/tmp/bgsport-order-alerts-mobile.png", animations: "disabled" });
  assert.ok(await upcoming.evaluate(el => el.scrollWidth <= el.clientWidth), "Upcoming list fits mobile screens");
  empty = true;
  await page.getByRole("button", { name: "ໂຫຼດໃໝ່", exact: true }).click();
  await sections.nth(1).getByText("ບໍ່ມີລາຍການ", { exact: true }).waitFor();
  assert.equal(await sections.nth(0).getByText("ບໍ່ມີລາຍການ", { exact: true }).count(), 1);
  assert.ok(alertRequests >= 2, "Refresh reloads alerts");
  assert.deepEqual(errors, []);
  console.log("PASS: overdue and upcoming groups, today through day three, sorting, completed/received exclusions, links, mobile layout, refresh, empty states and no runtime errors or backend writes.");
} finally { await browser.close(); }
