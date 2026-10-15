// Run against the local development server. All backend calls are mocked.
import assert from "node:assert/strict";
const { chromium, expect } = await import(process.argv[2] || "playwright/test");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = { id: uid(1), email: "qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const profile = { ...user, auth_user_id: user.id, full_name: "QA Admin", role: "superadmin", is_active: true, permission_settings: {} };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };
let orders = Array.from({ length: 1205 }, (_, i) => ({
  id: uid(i + 10), deposit_no: `DP-${i + 1}`, order_code: i === 1204 ? "RK26-9124+2" : `ORDER-${i + 1}`,
  quotation_quote_no: null, customer_name: `Customer ${i + 1}`, customer_phone: "2099999999",
  factory_bill_code: `FACTORY-${i + 1}`, status: i % 2 ? "approved" : "submitted",
  created_by_user_id: profile.id, net_total: 100, design_deposit: 0, initial_deposit: 20, balance: 80,
  fabric_name: "QA Fabric", production_items: [], pants_items: [],
}));
// A search with 21 results exercises the last page and deletion clamping.
orders = orders.map((row, i) => ({ ...row, customer_name: i < 21 ? `Group ${i + 1}` : row.customer_name }));
const indexRequests = [], detailRequests = [], errors = [];
let delayId = null;
let failDetails = false;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split("/").pop();
    let data = [];
    if (url.pathname === "/auth/v1/user") data = user;
    else if (table === "users") data = [profile];
    else if (table === "factory_deposit_orders") {
      if (req.method() === "DELETE") {
        const id = url.searchParams.get("id").slice(3);
        orders = orders.filter(row => row.id !== id);
      } else if (url.searchParams.get("select") === "*") {
        const idFilter = url.searchParams.get("id");
        assert.ok(idFilter?.startsWith("in.("), "Full details must be restricted to the displayed IDs");
        const ids = idFilter.slice(4, -1).split(",");
        assert.ok(ids.length <= 20, "At most 20 full orders may be requested");
        detailRequests.push(ids);
        data = orders.filter(row => ids.includes(row.id)).reverse();
        if (ids.includes(delayId)) await new Promise(resolve => setTimeout(resolve, 500));
        if (failDetails) {
          await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "QA detail load failed" }) });
          return;
        }
      } else {
        const offset = Number(url.searchParams.get("offset") || 0);
        const limit = Number(url.searchParams.get("limit") || 1000);
        indexRequests.push([offset, limit]);
        const columns = url.searchParams.get("select").split(",");
        assert.ok(!columns.includes("production_items"));
        data = orders.slice(offset, offset + limit).map(row => Object.fromEntries(columns.map(key => [key, row[key]])));
      }
    }
    if (req.headers().accept?.includes("vnd.pgrst.object") && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await context.route("**/api/**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"counts":{}}' }));
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${process.env.TEST_BASE_URL || "http://localhost:3000"}/factory-deposit-orders`, { waitUntil: "networkidle" });
  const tableRows = page.locator("tbody tr");
  const prev = page.getByRole("button", { name: "ໜ້າກ່ອນໜ້າ", exact: true });
  const next = page.getByRole("button", { name: "ໜ້າຖັດໄປ", exact: true });
  const search = page.getByPlaceholder(/ຄົ້ນຫາເລກທີ່ໃບມັດຈຳ/);
  const status = page.locator("select");
  const count = page.getByRole("status").filter({ hasText: "ສະແດງ" });
  await expect(tableRows).toHaveCount(20);
  await expect(tableRows.first()).toContainText("ORDER-1");
  await expect(tableRows.last()).toContainText("ORDER-20");
  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();
  await expect(count).toContainText("1–20 ຈາກ 1,205");
  await expect(page.getByText("ຍອດລວມ 120,500", { exact: true })).toBeVisible();
  assert.ok(indexRequests.some(([offset]) => offset === 1000), "Search index must include orders beyond the API's first 1000 rows");
  await next.click();
  await expect(tableRows.first()).toContainText("ORDER-21");
  await expect(tableRows.last()).toContainText("ORDER-40");
  await expect(count).toContainText("21–40");
  await prev.click();
  await expect(tableRows.first()).toContainText("ORDER-1");

  // Exact result beyond the first 1000, and all pre-existing search fields.
  for (const keyword of ["DP-1205", "RK26-9124+2", "customer 1205", "FACTORY-1205"]) {
    await search.fill(keyword);
    await expect(tableRows).toHaveCount(1);
    await expect(tableRows.first()).toContainText("RK26-9124+2");
    await expect(prev).toBeDisabled();
    await expect(next).toBeDisabled();
  }
  await search.fill("no matching order");
  await expect(count).toContainText("0–0 ຈາກ 0");
  await expect(tableRows).toContainText("ຍັງບໍ່ມີລາຍການ");

  await search.fill("");
  await expect(next).toBeEnabled();
  await next.click();
  await expect(tableRows.first()).toContainText("ORDER-21");
  await status.selectOption("approved");
  await expect(tableRows.first()).toContainText("ORDER-2");
  await expect(count).toContainText("1–20 ຈາກ 602");
  await expect(prev).toBeDisabled();
  await status.selectOption("all");

  // A late response from the old search must not replace the newer results.
  delayId = uid(1214);
  const slowRequest = page.waitForRequest(req => req.url().includes("select=*") && req.url().includes(delayId));
  await search.fill("RK26-9124+2");
  await slowRequest;
  await search.fill("ORDER-1204");
  await expect(tableRows.first()).toContainText("ORDER-1204");
  await page.waitForLoadState("networkidle");
  await expect(tableRows.first()).toContainText("ORDER-1204");
  delayId = null;

  await search.fill("Group");
  await expect(tableRows).toHaveCount(20);
  await next.click();
  await expect(tableRows).toHaveCount(1);
  await expect(next).toBeDisabled();
  await tableRows.getByRole("button", { name: "ລົບ", exact: true }).click();
  await page.locator(".swal2-confirm").click();
  await expect(tableRows).toHaveCount(20);
  await expect(count).toContainText("1–20 ຈາກ 20");
  await expect(prev).toBeDisabled();
  await expect(next).toBeDisabled();

  failDetails = true;
  await search.fill("RK26-9124+2");
  await expect(page.getByText(/QA detail load failed/)).toBeVisible();
  failDetails = false;
  await page.getByRole("button", { name: "ໂຫຼດໃໝ່", exact: true }).click();
  await expect(tableRows.first()).toContainText("RK26-9124+2");
  await expect(page.getByText(/QA detail load failed/)).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await search.fill("Group");
  await expect(tableRows).toHaveCount(20);
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeInViewport();
  await expect(prev).toBeInViewport();
  assert.deepEqual(errors, []);
  console.log(`PASS: pagination, global search across 1205 orders, totals, status reset, stale responses, deletion, retry and mobile controls (${detailRequests.length} bounded detail requests)`);
} finally {
  await browser.close();
}
