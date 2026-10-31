// Local browser verification with mocked Supabase responses; no production writes.
// node scripts/verify-browser-payroll-expenses.mjs /path/to/playwright/test.mjs
import assert from "node:assert/strict";
import XLSX from "xlsx";
const { chromium, expect } = await import(process.argv[2] || "playwright/test");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
const user = { id: "00000000-0000-4000-8000-000000000001", email: "qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
const profile = { ...user, auth_user_id: user.id, full_name: "QA Accountant", role: "superadmin", is_active: true, permission_settings: {} };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: Math.floor(Date.now() / 1000) + 86400 * 30, token_type: "bearer", user };
const employee = { id: "employee-1", employee_code: "PT01", full_name: "Frozen October Employee", department: "Production", netSalary: 3000000, base_salary: 9000000 };
const run = (overrides = {}) => ({ id: "oct-r1", month_key: "2026-10", revision: 1, payment_date: "2026-11-02", closed_by_name: "QA Accountant", entries: [{ ...employee }], payroll_months: { status: "closed" }, ...overrides });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  for (const timezoneId of ["Asia/Vientiane", "America/Los_Angeles"]) {
    let runs = [run(), run({ id: "nov-r1", month_key: "2026-11", payment_date: "2026-12-03", entries: [{ ...employee, full_name: "Frozen November Employee", netSalary: 4000000 }] })];
    let missing = false, failed = false, payrollReads = 0;
    const errors = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId });
    await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
    await context.route(`${backend.origin}/**`, async route => {
      const request = route.request(), url = new URL(request.url()), table = url.pathname.split("/").pop();
      if (url.pathname.startsWith("/rest/v1/") && !url.pathname.includes("/rpc/")) {
        assert.equal(request.method(), "GET", "Browser checks must not mutate tables");
      }
      let data = [];
      if (url.pathname === "/auth/v1/user") data = user;
      else if (table === "users") data = [profile];
      else if (table === "payroll_employees") assert.fail("Report must not query current employee templates");
      else if (table === "payroll_runs") {
        payrollReads += 1;
        assert.equal(url.searchParams.get("payroll_months.status"), "eq.closed");
        if (missing || failed) {
          await route.fulfill({ status: missing ? 404 : 403, json: { message: missing ? "Could not find the table 'public.payroll_runs' in the schema cache" : "Payroll permission denied" } });
          return;
        }
        data = runs.filter(row => row.payroll_months.status === "closed");
        const offset = Number(url.searchParams.get("offset") || 0), limit = Number(url.searchParams.get("limit") || 1000);
        data = data.slice(offset, offset + limit);
      } else if (table === "income_expense_entries") data = [{ id: "manual-1", entry_type: "expense", entry_date: "2026-11-04T12:00:00", category: "ຄ່າພະນັກງານ", title: "Manual staff expense", amount: 250000, payment_method: "cash", created_at: "2026-11-04T12:00:00" }];
      if (request.headers().accept?.includes("vnd.pgrst.object") && Array.isArray(data)) data = data[0] || null;
      await route.fulfill({ json: data });
    });
    await context.route("**/api/**", route => route.fulfill({ json: { counts: {} } }));
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-11-05T12:00:00Z"));
    await page.goto(`${base}/reports/income-expense`, { waitUntil: "networkidle" });
    const dates = async (from, to) => {
      await page.getByLabel("ຈາກວັນທີ", { exact: true }).fill(from);
      await page.getByLabel("ຫາວັນທີ", { exact: true }).fill(to);
    };
    const expense = page.getByText("ລາຍຈ່າຍລວມ", { exact: true }).first().locator("../..");
    const table = page.getByRole("table").first();
    await expect(expense).toContainText("3,250,000");
    await expect(table).toContainText("02/11/2026");
    await dates("2026-11-01", "2026-12-31");
    await expect(expense).toContainText("7,250,000");
    await expect(table).toContainText("Frozen November Employee");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Export Excel/ }).click()]);
    const book = XLSX.readFile(await download.path());
    const exported = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
    assert.deepEqual(exported.filter(row => row.source === "ເງິນເດືອນພະນັກງານ").map(row => row.amount).sort(), [3000000, 4000000]);
    await dates("2026-11-02", "2026-11-02");
    await expect(expense).toContainText("3,000,000");
    await expect(table).not.toContainText("Manual staff expense");
    await dates("2026-10-01", "2026-10-31");
    await expect(expense).toContainText("₭ 0");
    await dates("2026-11-01", "2026-11-30");
    runs.push(run({ id: "oct-r2", revision: 2, payment_date: "2026-12-01", entries: [{ ...employee, netSalary: 3500000 }] }));
    await page.getByRole("button", { name: /ໂຫຼດຄືນ/ }).click();
    await expect(expense).toContainText("250,000");
    await expect(table).not.toContainText("Frozen October Employee");
    await dates("2026-12-01", "2026-12-31");
    await expect(expense).toContainText("7,500,000");
    runs = runs.map(row => ({ ...row, payroll_months: { status: "draft" } }));
    await page.getByRole("button", { name: /ໂຫຼດຄືນ/ }).click();
    await expect(expense).toContainText("₭ 0");
    missing = true;
    await page.getByRole("button", { name: /ໂຫຼດຄືນ/ }).click();
    await expect(page.getByText(/ຍັງບໍ່ພົບປະຫວັດ payroll/)).toContainText("20261015_create_payroll_month_history.sql");
    missing = false; failed = true;
    await page.getByRole("button", { name: /ໂຫຼດຄືນ/ }).click();
    await expect(page.getByText("Payroll permission denied", { exact: true })).toBeVisible();
    assert.ok(payrollReads >= 5);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Payroll expense browser checks passed: ${timezoneId}`);
  }
} finally {
  await browser.close();
}
