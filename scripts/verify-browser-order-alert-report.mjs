// Run against the local dev server with mocked auth/backend and no production writes.
import assert from "node:assert/strict";
import XLSX from "xlsx";
const { chromium } = await import(process.argv[2] || "playwright");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const current = new Date("2026-10-28T10:00:00+07:00");
const user = { id: "00000000-0000-4000-8000-000000000001", email: "qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const profile = { ...user, auth_user_id: user.id, full_name: "QA", role: "superadmin", is_active: true, permission_settings: {} };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: current.getTime() / 1000 + 43200, token_type: "bearer", user };
const deposits = [
  ["normal", "2026-10-27"], ["urgent", "2026-10-23"], ["today", "2026-10-28"],
  ["upcoming", "2026-10-29"], ["received", "2026-10-26"], ["completed", "2026-10-25"],
].map(([id, delivery_date]) => ({
  id, order_id: `order-${id}`, order_code: `BG-${id}`, factory_bill_code: id === "urgent" ? "000123" : null,
  production_sent_date: id === "urgent" ? "2026-10-19" : "2026-10-20", delivery_date, production_priority: id === "urgent" ? "urgent" : "normal", status: "converted",
}));
const orders = deposits.map(row => ({
  id: row.order_id, status: "in_progress", closed_at: null, production_completed_at: row.id === "completed" ? "2026-10-26T00:00:00Z" : null,
  shipment_status: "pending", shipment_completed_at: null, order_image_url: null,
  factory_bill_code: row.id === "normal" ? "FACTORY-NORMAL" : null, short_qty: 10, long_qty: 5, free_qty: 2,
}));
const headers = ["ລຳດັບ", "ລະຫັດອໍເດີ້ BG", "ລະຫັດບິນໂຮງງານ", "ຈຳນວນ", "ວັນທີ່ສົ່ງຜະລິດ", "ກຳນົດສົ່ງລູກຄ້າ", "ເກີນກຳນົດຈັກວັນ", "ປະເພດງານ (ງານດ່ວນ/ປົກກະຕິ)"];
const expected = [
  [1, "BG-urgent", "000123", 17, "19/10/2026", "23/10/2026", 5, "ງານດ່ວນ"],
  [2, "BG-normal", "FACTORY-NORMAL", 17, "20/10/2026", "27/10/2026", 1, "ປົກກະຕິ"],
];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ timezoneId: "Asia/Vientiane", viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
  let mode = "data";
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    assert.equal(req.method(), "GET", "Verification cannot write to the backend");
    let data = [];
    if (url.pathname === "/auth/v1/user") data = user;
    else if (url.pathname === "/rest/v1/users") data = [profile];
    else if (url.pathname === "/rest/v1/factory_deposit_orders") {
      assert.equal(url.searchParams.get("delivery_date"), "lt.2026-10-28");
      if (mode === "error") return route.fulfill({ status: 500, json: { message: "QA report failure" } });
      data = mode === "empty" ? [] : deposits;
    } else if (url.pathname === "/rest/v1/orders") data = orders;
    else if (url.pathname === "/rest/v1/factory_receipt_items") data = [{ order_id: "order-received" }];
    if (req.headers().accept?.includes("vnd.pgrst.object") && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ json: data });
  });
  await context.route("**/api/**", route => route.fulfill({ json: { counts: {} } }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: current });
  await page.goto("http://localhost:3000/reports/order-alerts", { waitUntil: "networkidle" });
  const table = page.getByRole("table");
  await table.getByRole("link", { name: "BG-urgent", exact: true }).waitFor();
  assert.deepEqual((await table.locator("thead th").allTextContents()).slice(1), headers);
  assert.deepEqual(await table.locator("tbody tr").evaluateAll(rows => rows.map(row => [...row.cells].slice(1).map(cell => cell.innerText))), expected.map(row => row.map(String)));
  assert.equal(await table.getByRole("link", { name: "BG-urgent", exact: true }).getAttribute("href"), "/orders/order-urgent/edit");
  assert.ok((await table.locator("tfoot").innerText()).includes("34"));

  const exportButton = page.getByRole("button", { name: /^ດາວໂຫຼດ Excel/ });
  const allCheckbox = page.getByRole("checkbox", { name: "ເລືອກທັງໝົດຕາມຕົວກອງ", exact: true });
  const urgentCheckbox = page.getByRole("checkbox", { name: "ເລືອກ BG-urgent", exact: true });
  const normalCheckbox = page.getByRole("checkbox", { name: "ເລືອກ BG-normal", exact: true });
  const priority = page.getByRole("combobox", { name: "ປະເພດງານ", exact: true });
  const resetFilters = page.getByRole("button", { name: "ລ້າງຕົວກອງ", exact: true });
  const normalExport = [1, ...expected[1].slice(1)];
  async function downloadRows() {
    const pending = page.waitForEvent("download");
    await exportButton.click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), "order-alerts-report-2026-10-28.xlsx");
    const workbook = XLSX.readFile(await download.path());
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    assert.equal(sheet.C2.t, "s", "Factory bill codes retain leading zeros");
    assert.equal(sheet.D2.t, "n", "Quantities remain numeric in Excel");
    assert.equal(sheet.G2.t, "n", "Overdue days remain numeric in Excel");
    return XLSX.utils.sheet_to_json(sheet, { header: 1 });
  }
  assert.equal(await exportButton.isDisabled(), true, "Export requires an explicit row selection");
  await urgentCheckbox.check();
  assert.equal(await allCheckbox.evaluate(element => element.indeterminate), true);
  assert.deepEqual(await downloadRows(), [headers, expected[0]]);
  await allCheckbox.check();
  assert.equal(await normalCheckbox.isChecked(), true);
  assert.deepEqual(await downloadRows(), [headers, ...expected]);
  await allCheckbox.uncheck();
  assert.equal(await exportButton.isDisabled(), true);
  await normalCheckbox.check();
  assert.deepEqual(await downloadRows(), [headers, normalExport], "Selected subset is re-numbered from one");
  await allCheckbox.check();
  await priority.selectOption("urgent");
  assert.equal(await table.locator("tbody tr").count(), 1);
  assert.deepEqual(await downloadRows(), [headers, expected[0]], "Selected rows hidden by a filter are excluded from export");
  await allCheckbox.uncheck();
  await priority.selectOption("all");
  assert.equal(await urgentCheckbox.isChecked(), false);
  assert.equal(await normalCheckbox.isChecked(), true, "Deselect all affects only rows in the current filter");
  await page.getByRole("button", { name: "ຍົກເລີກການເລືອກ", exact: true }).click();
  assert.equal(await normalCheckbox.isChecked(), false);
  assert.equal(await exportButton.isDisabled(), true);
  await allCheckbox.check();

  const dateField = page.getByLabel("ກອງຕາມວັນທີ່", { exact: true });
  const fromDate = page.getByLabel("ຕັ້ງແຕ່ວັນທີ່", { exact: true });
  const toDate = page.getByLabel("ເຖິງວັນທີ່", { exact: true });
  await fromDate.fill("2026-10-23");
  await toDate.fill("2026-10-23");
  assert.equal(await table.locator("tbody tr").count(), 1);
  assert.deepEqual(await downloadRows(), [headers, expected[0]], "Delivery date boundaries are inclusive");
  await toDate.fill("2026-10-22");
  await page.getByRole("alert").filter({ hasText: "ວັນທີ່ເລີ່ມຕົ້ນ" }).waitFor();
  assert.equal(await exportButton.isDisabled(), true, "An inverted date range cannot export");
  await fromDate.fill("2026-10-20");
  await toDate.fill("2026-10-20");
  await dateField.selectOption("productionSentDate");
  assert.deepEqual(await downloadRows(), [headers, normalExport], "Production date uses the selected date field");
  await resetFilters.click();

  const minDays = page.getByLabel("ເກີນກຳນົດຕ່ຳສຸດ (ວັນ)", { exact: true });
  const maxDays = page.getByLabel("ເກີນກຳນົດສູງສຸດ (ວັນ)", { exact: true });
  await minDays.fill("5");
  await maxDays.fill("5");
  assert.deepEqual(await downloadRows(), [headers, expected[0]], "Overdue day boundaries are inclusive");
  await maxDays.fill("4");
  await page.getByRole("alert").filter({ hasText: "ຈຳນວນວັນຕ່ຳສຸດ" }).waitFor();
  assert.equal(await exportButton.isDisabled(), true);
  await minDays.fill("-1");
  await page.getByRole("alert").filter({ hasText: "ເລກເຕັມ" }).waitFor();
  await minDays.fill("1.5");
  assert.equal(await exportButton.isDisabled(), true);
  await resetFilters.click();
  await maxDays.fill("1");
  assert.deepEqual(await downloadRows(), [headers, normalExport], "A single bound works without a minimum");
  await resetFilters.click();
  const search = page.getByRole("textbox", { name: "ຄົ້ນຫາອໍເດີ້", exact: true });
  await search.fill("factory-normal");
  await table.getByRole("link", { name: "BG-normal", exact: true }).waitFor();
  assert.equal(await table.locator("tbody tr").count(), 1);
  assert.deepEqual(await downloadRows(), [headers, normalExport]);
  await search.fill("missing");
  await table.getByText("ບໍ່ພົບລາຍການທີ່ຄົ້ນຫາ", { exact: true }).waitFor();
  assert.equal(await exportButton.isDisabled(), true);
  await search.fill("");
  await page.screenshot({ path: "/tmp/bgsport-order-alert-report-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.screenshot({ path: "/tmp/bgsport-order-alert-report-mobile.png", fullPage: true, animations: "disabled" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile page fits viewport");
  const region = page.getByRole("region", { name: "ຕາລາງອໍເດີ້ເກີນກຳນົດ", exact: true });
  assert.ok(await region.evaluate(element => element.scrollWidth > element.clientWidth), "Table scrolls horizontally on mobile");
  await page.getByRole("button", { name: "ໂຫຼດໃໝ່", exact: true }).click();
  await urgentCheckbox.waitFor();
  assert.equal(await urgentCheckbox.isChecked(), false, "Refresh clears the prior selection");
  assert.equal(await exportButton.isDisabled(), true);
  mode = "error";
  await page.getByRole("button", { name: "ໂຫຼດໃໝ່", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "QA report failure" }).waitFor();
  assert.equal(await exportButton.isDisabled(), true);
  mode = "empty";
  await page.getByRole("button", { name: "ໂຫຼດໃໝ່", exact: true }).click();
  await table.getByText("ບໍ່ມີອໍເດີ້ເກີນກຳນົດ", { exact: true }).waitFor();
  assert.equal(await exportButton.isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log("PASS: eight export columns, row selection, filtered select-all, indeterminate state, selection reset, selected Excel rows/types, date/day filters and validation, search, mobile scrolling, failure/empty states, no backend writes.");
} finally { await browser.close(); }
