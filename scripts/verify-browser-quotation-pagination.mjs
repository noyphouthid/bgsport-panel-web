// Run against the local development server. All backend calls are mocked.
import assert from "node:assert/strict";
const { chromium, expect } = await import(process.argv[2] || "playwright/test");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = { id: uid(1), email: "qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const profile = { ...user, auth_user_id: user.id, full_name: "QA Admin", role: "superadmin", is_active: true, permission_settings: {} };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };
let quotations = Array.from({ length: 1205 }, (_, i) => ({
  id: uid(i + 10), quote_no: `QT-${i + 1}`, order_code: `ORDER-${i + 1}`,
  quote_date: i < 40 ? "2026-10-15" : "2026-10-01",
  customer_name: i < 21 ? `Group ${i + 1}` : `Customer ${i + 1}`,
  customer_phone: `PHONE-${i + 1}`, customer_whatsapp: `WA-${i + 1}`,
  fabric_name: `Fabric ${i + 1}`, deposit: "12500", status: "draft",
}));
const listRequests = [], deletedIds = [], errors = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split("/").pop();
    let data = [];
    if (url.pathname === "/auth/v1/user") data = user;
    else if (table === "users") data = [profile];
    else if (table === "quotation_drafts") {
      if (req.method() === "DELETE") {
        const id = url.searchParams.get("id").slice(3);
        deletedIds.push(id);
        quotations = quotations.filter(row => row.id !== id);
      } else {
        const offset = Number(url.searchParams.get("offset") || 0);
        const limit = Number(url.searchParams.get("limit") || 1000);
        const columns = url.searchParams.get("select").split(",");
        assert.ok(!columns.includes("*") && !columns.includes("pants_items") && !columns.includes("notes"), "List must omit item details and form fields");
        assert.ok(limit <= 500, "List requests must be bounded");
        assert.equal(url.searchParams.get("order"), "updated_at.desc,id.desc");
        listRequests.push([offset, limit]);
        data = quotations.slice(offset, offset + limit).map(row => Object.fromEntries(columns.map(key => [key, row[key]])));
      }
    }
    if (req.headers().accept?.includes("vnd.pgrst.object") && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await context.route("**/api/**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"counts":{}}' }));
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await page.goto(`${process.env.TEST_BASE_URL || "http://localhost:3000"}/quotations`, { waitUntil: "networkidle" });
  const rows = page.locator("tbody tr");
  const prev = page.getByRole("button", { name: "ໜ້າກ່ອນໜ້າ", exact: true });
  const next = page.getByRole("button", { name: "ໜ້າຖັດໄປ", exact: true });
  const search = page.getByPlaceholder(/ຄົ້ນຫາລະຫັດອໍເດີ/);
  const fromDate = page.getByLabel("ວັນທີເລີ່ມຕົ້ນ", { exact: true });
  const toDate = page.getByLabel("ວັນທີສິ້ນສຸດ", { exact: true });
  const count = page.getByRole("status").filter({ hasText: "ສະແດງ" });
  await expect(rows).toHaveCount(20);
  await expect(rows.first()).toContainText("ORDER-1");
  await expect(rows.last()).toContainText("ORDER-20");
  await expect(rows.first()).toContainText("12,500");
  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();
  await expect(count).toContainText("1–20 ຈາກ 1,205");
  // Development Strict Mode may run the initial loading effect twice.
  assert.deepEqual([...new Set(listRequests.map(([offset]) => offset))].sort((a, b) => a - b), [0, 500, 1000]);
  const initialRequestCount = listRequests.length;

  await next.click();
  await expect(rows.first()).toContainText("ORDER-21");
  await expect(rows.last()).toContainText("ORDER-40");
  await expect(count).toContainText("21–40");
  await expect(rows.first().getByRole("link", { name: "ແກ້ໄຂ", exact: true })).toHaveAttribute("href", `/quotations/new?draftId=${uid(30)}`);
  await expect(rows.first().getByRole("link", { name: "ພິມ", exact: true })).toHaveAttribute("href", `/quotations/new?draftId=${uid(30)}`);
  await expect(rows.first().getByRole("link", { name: "ສ້າງໃບມັດຈຳ", exact: true })).toHaveAttribute("href", `/factory-deposit-orders/new?draftId=${uid(30)}`);
  await prev.click();
  await expect(rows.first()).toContainText("ORDER-1");

  // Every original search field must find a quotation beyond the first 1000.
  await next.click();
  for (const keyword of ["QT-1205", "ORDER-1205", "customer 1205", "PHONE-1205", "WA-1205", "fabric 1205"]) {
    await search.fill(keyword);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("ORDER-1205");
    await expect(prev).toBeDisabled();
    await expect(next).toBeDisabled();
  }
  await search.fill("no matching quotation");
  await expect(count).toContainText("0–0 ຈາກ 0");
  await expect(rows).toContainText("ບໍ່ພົບຂໍ້ມູນຕາມຄຳຄົ້ນຫາ");
  await search.fill("");
  await next.click();
  await fromDate.fill("2026-10-15");
  await expect(count).toContainText("1–20 ຈາກ 40");
  await expect(prev).toBeDisabled();
  await next.click();
  await toDate.fill("2026-10-15");
  await expect(count).toContainText("1–20 ຈາກ 40");
  await expect(prev).toBeDisabled();
  await next.click();
  await toDate.fill("2026-10-14");
  await expect(count).toContainText("0–0 ຈາກ 0");
  await fromDate.fill("");
  await expect(count).toContainText("1–20 ຈາກ 1,165");
  await expect(rows.first()).toContainText("ORDER-41");
  await toDate.fill("");
  assert.equal(listRequests.length, initialRequestCount, "Filtering and paging should reuse the lightweight list without refetching full quotations");

  await search.fill("Group");
  await expect(rows).toHaveCount(20);
  await next.click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("ORDER-21");
  await expect(next).toBeDisabled();
  await rows.getByRole("button", { name: "ລົບ", exact: true }).click();
  await expect(rows).toHaveCount(20);
  await expect(count).toContainText("1–20 ຈາກ 20");
  await expect(prev).toBeDisabled();
  await expect(next).toBeDisabled();
  assert.deepEqual(deletedIds, [uid(30)]);

  await page.setViewportSize({ width: 390, height: 844 });
  await search.fill("");
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeInViewport();
  await expect(prev).toBeInViewport();
  await next.click();
  await expect(rows).toHaveCount(20);
  await expect(rows.first()).toContainText("ORDER-22");
  assert.deepEqual(errors, []);
  console.log("PASS: 20-row pages, search across 1205 quotations, lightweight requests, date filters, action links, deletion clamping and mobile controls");
} finally {
  await browser.close();
}
