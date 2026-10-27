// Run against the local dev server. API and Supabase requests are mocked; no production writes.
import assert from "node:assert/strict";
const { chromium } = await import(process.argv[2] || "playwright");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const user = { id: "00000000-0000-4000-8000-000000000001", email: "qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const profile = { ...user, auth_user_id: user.id, full_name: "Owner QA", role: "superadmin", is_active: true, permission_settings: {} };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: Math.floor(Date.now() / 1000) + 43200, token_type: "bearer", user };
const requests = ["submitted", "rejected", "delivered"].map(status => ({
  id: `request-${status}`, order_id: `order-${status}`, request_no: `SDR-${status}`,
  status, delivery_method: "pickup", requested_by_user_id: user.id,
  delivery_person_name: "QA Delivery", transport_providers: [], payment_amount: 0,
  updated_at: "2026-10-28T01:00:00Z", delivery_scheduled_at: "2026-10-28T01:00:00Z",
}));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
  const writes = [], loads = [], errors = [];
  let delayRejected = false;
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    let data = [];
    if (req.method() !== "GET") {
      assert.ok(["POST", "PATCH"].includes(req.method()));
      assert.ok(["/rest/v1/shipment_delivery_requests", "/rest/v1/order_status_history"].includes(url.pathname));
      writes.push({ path: url.pathname, body: req.postDataJSON() });
      if (url.pathname === "/rest/v1/shipment_delivery_requests") requests[0].status = "rejected";
    } else if (url.pathname === "/auth/v1/user") data = user;
    else if (url.pathname === "/rest/v1/users") data = [profile];
    if (req.headers().accept?.includes("vnd.pgrst.object") && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ json: data });
  });
  await context.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/shipments/approvals") { await route.fulfill({ json: { counts: {} } }); return; }
    const status = url.searchParams.get("status");
    loads.push(status);
    if (delayRejected && status === "rejected") await new Promise(resolve => setTimeout(resolve, 700));
    const rows = requests.filter(row => status === "all" || row.status === status);
    await route.fulfill({ json: {
      ok: true, viewerRole: "superadmin", viewerUserId: user.id, rows,
      ordersById: Object.fromEntries(requests.map(row => [row.order_id, { id: row.order_id, order_code: row.order_id, factory_bill_code: `bill-${row.id}` }])),
      usersById: { [user.id]: profile }, transportNotesByRequestId: {},
    } });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://localhost:3000/shipments/approvals", { waitUntil: "networkidle" });
  const filter = page.locator("main select");
  const search = page.getByPlaceholder("ລະຫັດອໍເດີ / ບິນໂຮງງານ / ຜູ້ຂໍ");
  const orderCell = status => page.getByText(`order-${status}`, { exact: true });
  assert.equal(loads[0], "submitted");
  await orderCell("submitted").waitFor();
  assert.equal(await orderCell("delivered").count(), 0);
  await filter.selectOption("all");
  await orderCell("delivered").waitFor();
  assert.equal(await page.locator("tbody tr").count(), 3);
  await search.fill("bill-request-delivered");
  assert.equal(await page.locator("tbody tr").count(), 1);
  await orderCell("delivered").waitFor();
  await search.fill("");

  // A slow response from the old filter must never replace a newer selection.
  delayRejected = true;
  const rejectedLoad = page.waitForRequest(req => req.url().includes("approvals?status=rejected"));
  await filter.selectOption("rejected");
  await rejectedLoad;
  await filter.selectOption("delivered");
  await orderCell("delivered").waitFor();
  await page.waitForTimeout(900);
  assert.equal(await orderCell("rejected").count(), 0);
  assert.equal(await page.locator("tbody tr").count(), 1);
  delayRejected = false;

  // A completed action reloads the current queue and removes the processed row.
  await filter.selectOption("submitted");
  await orderCell("submitted").waitFor();
  await page.getByRole("button", { name: "ປະຕິເສດ", exact: true }).click();
  await page.locator("textarea.swal2-textarea").fill("QA rejection");
  await page.locator("button.swal2-confirm").click();
  await page.getByText("ບໍ່ພົບຄຳຂໍ", { exact: true }).waitFor();
  assert.equal(loads.at(-1), "submitted");
  assert.equal(writes.filter(write => write.path === "/rest/v1/shipment_delivery_requests").length, 1);
  assert.equal(writes[0].body.status, "rejected");
  assert.deepEqual(errors, []);
  console.log("PASS: status-scoped loads, history, search, stale-response cancellation, and queue refresh after rejection.");
} finally { await browser.close(); }
