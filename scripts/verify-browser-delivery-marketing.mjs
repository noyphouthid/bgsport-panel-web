// All backend requests are mocked; no production sessions or writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import XLSX from "xlsx";
const { chromium } = await import(process.argv[2] || "playwright");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const user = { id: "00000000-0000-4000-8000-000000000001", email: "qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const profile = { ...user, auth_user_id: user.id, full_name: "QA Admin", role: "superadmin", is_active: true, permission_settings: {} };
const graphic = { ...profile, id: "00000000-0000-4000-8000-000000000002", full_name: "QA Graphic", role: "graphic" };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };
const fabric = { id: "00000000-0000-4000-8000-000000000003", name: "QA Fabric", short_price: 100000, long_add: 20000, long_price: 120000, is_active: true };
const orders = Array.from({ length: 505 }, (_, index) => ({
  id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, order_code: `PK26-${index + 1}`, order_date: index === 0 ? "2026-09-20" : "2026-10-01",
  work_category: index === 1 ? "boat_racing" : index === 2 ? "team_group" : index === 3 ? null : "sports",
  short_qty: 10, long_qty: 5, free_qty: 1, net_total: 1500000, customer_phone: index < 2 ? "020 1234 5678" : index === 2 ? "+8562098765432" : "", customer_whatsapp: "", factory_bill_code: null,
  admin_user_id: profile.id, graphic_user_id: graphic.id, fabric_id: fabric.id, fabric_name: fabric.name, fabric_short_price: fabric.short_price, fabric_long_price: fabric.long_price,
  qty_3xl: 0, qty_4xl: 0, qty_5xl: 0, qty_6xl: 0, collar_type: "none", collar_qty: 0, sleeve_charge_qty: 0,
  extra_charge: 0, design_deposit: 0, initial_deposit: 0, factory_cost: 500000, gross_total: 1500000, balance: 1500000, status: "in_progress",
  production_completed_at: null, shipment_status: "pending", created_at: "2026-10-01T00:00:00Z",
}));
const requests = orders.map((order, index) => ({
  id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`, request_no: `REQ-${index}`, order_id: order.id,
  status: index < 4 ? "delivered" : "draft", delivery_method: index === 2 ? "pickup" : "transport",
  delivery_scheduled_at: "2026-10-05T10:00:00Z", updated_at: "2026-10-06T10:00:00Z", requested_by_user_id: profile.id,
  transport_city: index === 3 ? null : "ເມືອງທົດສອບ", transport_province: index === 3 ? null : index === 0 ? "ບໍແກ້ວ" : "ບໍ່ແກ້ວ",
  transport_providers: ["QA Transport"], transport_receiver_name: "QA Receiver", transport_receiver_phone: "",
  payment_amount: 50000, payment_outstanding_amount: 1450000, delivery_person_name: "QA Pickup",
}));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ acceptDownloads: true, timezoneId: "Asia/Vientiane" });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
  const pages = [], batchSizes = [], writes = [], errors = [];
  let missingCategory = false;
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    let data = [];
    const objectResponse = req.headers().accept?.includes("vnd.pgrst.object");
    if (url.pathname === "/auth/v1/user") data = user;
    else if (url.pathname === "/rest/v1/users") data = url.searchParams.has("auth_user_id") ? [profile] : [profile, graphic];
    else if (url.pathname === "/rest/v1/fabrics") data = [fabric];
    else if (url.pathname === "/rest/v1/order_code_types") data = [{ code: "PK26", is_active: true }];
    else if (url.pathname === "/rest/v1/shipment_delivery_requests") {
      const offset = Number(url.searchParams.get("offset") || 0), limit = Number(url.searchParams.get("limit") || 500);
      pages.push(offset);
      data = requests.filter(row => !url.searchParams.has("order_id") || url.searchParams.get("order_id") === `eq.${row.order_id}`).slice(offset, offset + limit);
    } else if (url.pathname === "/rest/v1/orders") {
      if (["POST", "PATCH"].includes(req.method())) {
        writes.push(req.postDataJSON());
        data = req.method() === "POST" ? { id: orders[0].id } : null;
      } else {
        const selection = url.searchParams.get("select") || "*";
        if (missingCategory && selection.includes("work_category")) {
          await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "42703", message: "column orders.work_category does not exist" }) });
          return;
        }
        const idFilter = url.searchParams.get("id") || "";
        if (idFilter.startsWith("in.")) {
          const ids = idFilter.slice(4, -1).split(",");
          batchSizes.push(ids.length);
          assert.ok(ids.length <= 100);
          data = orders.filter(order => ids.includes(order.id));
        } else data = orders.filter(order => !idFilter || idFilter === `eq.${order.id}`);
        if (missingCategory) data = data.map(order => { const legacy = { ...order }; delete legacy.work_category; return legacy; });
      }
    }
    if (objectResponse && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await context.route("**/api/**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"counts":{}}' }));
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1400 });
  page.on("dialog", dialog => dialog.accept());
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://localhost:3000/reports/customer-delivery", { waitUntil: "networkidle" });
  await page.locator('input[type="date"]').nth(0).fill("2026-01-01");
  await page.locator('input[type="date"]').nth(1).fill("2026-12-31");
  const analysis = page.getByRole("region", { name: "ວິເຄາະການຕະຫຼາດ" });
  await analysis.waitFor();
  assert.ok(pages.includes(500), "Report loads the second API page");
  assert.ok(batchSizes.length >= 6, "All order lookups are batched");
  assert.ok((await analysis.textContent()).includes("6,000,000"), "Sales use four completed orders, not handoff payments");
  assert.ok((await analysis.textContent()).includes("2026-09"), "Monthly analysis uses order date");
  const map = page.getByRole("region", { name: "ແຜນທີ່ລູກຄ້າຕາມແຂວງ" });
  assert.equal(await map.locator("g[data-province]").count(), 18, "Map renders all province boundaries");
  assert.equal(await map.locator('g[data-province-label="LABK"] text').last().textContent(), "1", "Repeat orders count as one customer");
  assert.equal(await map.locator('g[data-province-label="LAVT"] text').last().textContent(), "1", "Store pickup appears in Vientiane Capital");
  await map.locator('g[data-province="LABK"]').focus();
  await map.locator('g[data-province="LABK"]').press("Enter");
  assert.equal(await map.locator('g[data-province="LABK"]').getAttribute("aria-pressed"), "true", "Province selection supports the keyboard");
  await map.getByRole("button", { name: "ກອງແຂວງນີ້", exact: true }).click();
  assert.equal(await page.getByLabel("ແຂວງບ່ອນສົ່ງ").inputValue(), "ບໍ່ແກ້ວ", "Map drill-down uses canonical province filters");
  await map.getByRole("button", { name: "ທຸກແຂວງ", exact: true }).click();
  await map.getByRole("button", { name: "ອໍເດີ", exact: true }).click();
  assert.equal(await map.locator('g[data-province-label="LABK"] text').last().textContent(), "2", "Map can display order counts separately");
  const mapDownloadPromise = page.waitForEvent("download");
  await map.getByRole("button", { name: "ດາວໂຫຼດແຜນທີ່", exact: true }).click();
  const mapExport = await readFile(await (await mapDownloadPromise).path(), "utf8");
  assert.ok(mapExport.includes("Simplemaps.com"));
  assert.equal((mapExport.match(/data-province="/g) || []).length, 18);
  assert.equal(mapExport.includes("2012345678"), false, "Map exports contain only aggregate counts");
  await map.getByRole("button", { name: "ລູກຄ້າ", exact: true }).click();
  await map.locator('g[data-province-label="LAVT"] rect').click();
  assert.equal(await map.locator('g[data-province="LAVT"]').getAttribute("aria-pressed"), "true", "Count badges select their province");
  await map.getByRole("button", { name: "ເລືອກແຂວງ ບໍ່ແກ້ວ", exact: true }).click();
  await map.screenshot({ path: "/tmp/bgsport-laos-customer-map-desktop.png" });
  await page.getByLabel("ແຂວງບ່ອນສົ່ງ").selectOption("ນະຄອນຫຼວງວຽງຈັນ");
  assert.ok((await analysis.textContent()).includes("1,500,000"), "Pickup is grouped in Vientiane Capital");
  await page.getByLabel("ລະດັບພື້ນທີ່").selectOption("district");
  assert.ok((await analysis.textContent()).includes("ຮັບໜ້າຮ້ານ (ບໍ່ລະບຸເມືອງ)"));
  await page.getByLabel("ແຂວງບ່ອນສົ່ງ").selectOption("all");
  await page.getByLabel("ກອງປະເພດງານ").selectOption("boat_racing");
  assert.ok((await analysis.textContent()).includes("ເສື້ອຊ່ວງເຮືອ"));
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "ດາວໂຫຼດຜົນວິເຄາະ", exact: true }).click();
  const workbook = XLSX.readFile(await (await downloadPromise).path());
  assert.deepEqual(workbook.SheetNames, ["provinces", "districts", "monthly_work_categories"]);
  assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets.monthly_work_categories)[0].work_category, "ເສື້ອຊ່ວງເຮືອ");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Close navigation", exact: true }).evaluate(button => button.click());
  await page.waitForFunction(() => document.querySelector(".app-sidebar").getBoundingClientRect().right <= 1);
  await map.getByRole("button", { name: "ຂະຫຍາຍແຜນທີ່", exact: true }).click();
  assert.ok((await map.locator('svg[viewBox="0 0 1000 1050"]').getAttribute("style")).includes("125%"), "Mobile map can be enlarged");
  await map.getByRole("button", { name: "ກັບຂະໜາດແຜນທີ່ເດີມ", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 1800 });
  await map.screenshot({ path: "/tmp/bgsport-laos-customer-map-mobile.png" });
  await page.screenshot({ path: "/tmp/bgsport-delivery-marketing-mobile.png", fullPage: true });
  missingCategory = true;
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByText("ຂໍ້ຜິດພາດ:", { exact: false }).count(), 0, "Older schemas still load");
  await page.getByLabel("ກອງປະເພດງານ").selectOption("unclassified");
  assert.ok((await analysis.textContent()).includes("ຍັງບໍ່ລະບຸ"));
  missingCategory = false;
  await page.goto("http://localhost:3000/orders/new", { waitUntil: "networkidle" });
  const category = page.getByLabel("ປະເພດງານ / ກຸ່ມເສື້ອ", { exact: true });
  await category.waitFor();
  assert.equal(await category.locator("option").count(), 9);
  await category.selectOption("sports");
  assert.equal(await category.inputValue(), "sports");
  await page.locator("select").filter({ has: page.locator('option[value="PK26"]') }).selectOption("PK26");
  await page.getByPlaceholder("ຕົວຢ່າງ 5001 ຫຼື 5001+1").fill("9001");
  await page.locator("select").filter({ has: page.locator(`option[value="${profile.id}"]`) }).first().selectOption(profile.id);
  await page.locator("select").filter({ has: page.locator(`option[value="${graphic.id}"]`) }).selectOption(graphic.id);
  await page.locator('input[type="number"]').first().fill("10");
  await category.selectOption("");
  await page.getByRole("button", { name: "ບັນທຶກ", exact: true }).click();
  await page.getByText("ກະລຸນາເລືອກປະເພດງານ", { exact: true }).waitFor();
  assert.equal(writes.length, 0, "New orders require a work category");
  await category.selectOption("sports");
  await page.getByRole("button", { name: "ບັນທຶກ", exact: true }).click();
  await page.locator(".swal2-confirm").click();
  await page.getByText("ບັນທຶກອໍເດີສຳເລັດ", { exact: true }).waitFor();
  assert.equal(writes.at(-1).work_category, "sports", "New orders persist the selected category");
  assert.equal(await category.inputValue(), "", "Saving clears the category for the next order");
  await page.goto(`http://localhost:3000/orders/${orders[0].id}/edit`, { waitUntil: "networkidle" });
  assert.equal(await category.inputValue(), "sports", "Editing loads the stored category");
  await category.selectOption("rocket_festival");
  await page.getByRole("button", { name: "ບັນທຶກ", exact: true }).click();
  await page.waitForFunction(() => document.body.textContent.includes("ບັນທຶກແລ້ວ"));
  assert.equal(writes.at(-1).work_category, "rocket_festival", "Editing persists the selected category");
  await page.goto("http://localhost:3000/imports", { waitUntil: "networkidle" });
  const importWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(importWorkbook, XLSX.utils.json_to_sheet([
    { order_code: "PK26-9101", order_date: "2026-10-01", fabric_name: fabric.name, admin_name: profile.full_name, graphic_name: graphic.full_name, short_qty: 10, work_category: "ເສື້ອກິລາ" },
    { order_code: "PK26-9102", order_date: "2026-10-01", fabric_name: fabric.name, admin_name: profile.full_name, graphic_name: graphic.full_name, short_qty: 10 },
    { order_code: "PK26-9103", order_date: "2026-10-01", fabric_name: fabric.name, admin_name: profile.full_name, graphic_name: graphic.full_name, short_qty: 10, work_category: "bad-category" },
  ]), "orders");
  await page.locator('input[type="file"]').setInputFiles({ name: "categories.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(importWorkbook, { type: "buffer", bookType: "xlsx" }) });
  await page.getByText("ປະເພດງານບໍ່ຖືກຕ້ອງ", { exact: true }).waitFor();
  await page.locator("select").selectOption("upsert");
  const importWriteStart = writes.length;
  await page.getByRole("button", { name: "ຢືນຢັນນຳເຂົ້າ", exact: true }).click();
  await page.locator(".swal2-confirm").click();
  await page.getByText("ນຳເຂົ້າສຳເລັດ (upsert): 2 ລາຍການ", { exact: true }).waitFor();
  const imported = writes.slice(importWriteStart).flat();
  assert.equal(imported.find(order => order.order_code === "PK26-9101").work_category, "sports");
  assert.equal("work_category" in imported.find(order => order.order_code === "PK26-9102"), false, "Blank categories do not clear existing assignments in mixed upserts");
  assert.equal(imported.some(order => order.order_code === "PK26-9103"), false, "Invalid categories are not imported");
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log("Browser checks passed: province map and labels, customer deduplication, province drill-down and keyboard selection, SVG export, mobile zoom, paginated report, destination/category filters, pickup grouping, order-month analysis, XLSX export, legacy fallback, order category creation/editing and Excel imports.");
} finally {
  await browser.close();
}
