// Run against the local dev server with mocked auth/backend and no production writes.
import assert from "node:assert/strict";
import XLSX from "xlsx";
const { chromium } = await import(process.argv[2] || "playwright");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const current = new Date("2026-11-05T10:00:00+07:00");
const user = { id: "00000000-0000-4000-8000-000000000001", email: "qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const profile = { ...user, auth_user_id: user.id, full_name: "QA", role: "superadmin", is_active: true, permission_settings: {} };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: current.getTime() / 1000 + 43200, token_type: "bearer", user };
const item = (orderId, received_by, received_at, order_code, short_qty = 10) => ({
  order_id: orderId,
  factory_receipts: { received_at, received_by },
  orders: { order_code, factory_bill_code: orderId === "o1" ? "000123" : null, net_total: 1000, short_qty, long_qty: 5, free_qty: 1 },
});
// The page must paginate past one API page; 600 rows for one employee prove nothing is truncated.
const bulk = Array.from({ length: 600 }, (_, n) => item(`bulk-${n}`, "Bulk Staff", "2026-11-03T03:00:00Z", `BG-BULK-${n}`));
const november = [
  item("o1", "Noy", "2026-11-04T03:00:00Z", "BG-1"),
  item("o1", "Noy", "2026-11-04T03:00:00Z", "BG-1"), // second QR label of the same order
  item("o2", " noy ", "2026-11-04T04:00:00Z", "BG-2"),
  item("o3", "Kham", "2026-10-31T17:30:00Z", "BG-3"), // 00:30 on 1 Nov in Laos
];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ timezoneId: "Asia/Vientiane", viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
  let mode = "data";
  const periods = [];
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    assert.equal(req.method(), "GET", "Verification cannot write to the backend");
    let data = [];
    if (url.pathname === "/auth/v1/user") data = user;
    else if (url.pathname === "/rest/v1/users") data = [profile];
    else if (url.pathname === "/rest/v1/factory_receipt_items" && url.searchParams.has("factory_receipts.received_at")) {
      if (mode === "error") return route.fulfill({ status: 500, json: { message: "QA report failure" } });
      const filters = url.searchParams.getAll("factory_receipts.received_at");
      periods.push(filters.join(" "));
      const all = filters.includes("gte.2026-10-31T17:00:00.000Z") ? [...november, ...bulk] : [];
      const offset = Number(url.searchParams.get("offset") || 0), limit = Number(url.searchParams.get("limit") || 1000);
      data = all.slice(offset, offset + limit);
    }
    if (req.headers().accept?.includes("vnd.pgrst.object") && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ json: data });
  });
  await context.route("**/api/**", route => route.fulfill({ json: { counts: {} } }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: current });
  await page.goto("http://localhost:3000/reports/factory-imports", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "ລາຍງານການນຳເຂົ້າສິນຄ້າ", exact: true }).waitFor();

  const summary = page.getByRole("table").nth(0), detail = page.getByRole("table").nth(1);
  await summary.getByRole("cell", { name: "Bulk Staff", exact: true }).waitFor();
  const cells = table => table.locator("tbody tr").evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.innerText)));
  assert.deepEqual(await cells(summary), [
    ["Bulk Staff", "600", "9,600", "600,000"],
    ["noy", "2", "32", "2,000"],
    ["Kham", "1", "16", "1,000"],
  ], "Rows from every API page are grouped; spacing variants merge under the latest spelling; an order with two labels counts once");
  assert.equal(await detail.locator("tbody tr").count(), 603);

  const employee = page.getByRole("combobox", { name: "ຜູ້ນຳເຂົ້າ", exact: true });
  await employee.selectOption({ label: "noy" });
  assert.deepEqual((await cells(detail)).map(row => row.slice(1, 4)), [["noy", "BG-2", "-"], ["Noy", "BG-1", "000123"]], "Each employee's orders are listed");

  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /ດາວໂຫຼດ Excel/ }).click();
  const download = await pending;
  assert.equal(download.suggestedFilename(), "factory-import-summary-2026-11.xlsx");
  const workbook = XLSX.readFile(await download.path());
  assert.deepEqual(workbook.SheetNames, ["factory_import_summary", "factory_import_orders"]);
  assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets.factory_import_summary, { header: 1 }).slice(1), [["noy", 2, 32, 2000], ["ລວມທັງໝົດ", 2, 32, 2000]]);
  assert.equal(workbook.Sheets.factory_import_orders.C3.v, "BG-1");
  assert.equal(workbook.Sheets.factory_import_orders.D3.t, "s", "Factory bill codes retain leading zeros");

  await page.screenshot({ path: process.env.SCREENSHOT_PATH || "/tmp/bgsport-factory-imports-desktop.png", animations: "disabled" });

  const month = page.getByRole("combobox", { name: "ເດືອນ", exact: true });
  await month.selectOption("10");
  await summary.getByText("ບໍ່ມີຂໍ້ມູນ", { exact: true }).waitFor();
  assert.ok(periods.at(-1).includes("gte.2026-09-30T17:00:00.000Z") && periods.at(-1).includes("lt.2026-10-31T17:00:00.000Z"), "Months use Laos time");
  assert.equal(await employee.inputValue(), "ALL", "A name missing from the new period resets the filter");
  assert.equal(await page.getByRole("button", { name: /ດາວໂຫຼດ Excel/ }).isDisabled(), true);

  mode = "error";
  await month.selectOption("9");
  await page.getByText("Error: QA report failure").waitFor();
  assert.equal(await page.getByRole("button", { name: /ດາວໂຫຼດ Excel/ }).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log("PASS: pagination past one API page, per-employee totals, order list, Excel sheets, Laos month boundaries, filter reset, failure state, no backend writes.");
} finally { await browser.close(); }
