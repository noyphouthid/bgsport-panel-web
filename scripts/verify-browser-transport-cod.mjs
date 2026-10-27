// Local browser verification. Every backend/API request is mocked; no production writes.
import assert from "node:assert/strict";
const { chromium } = await import(process.argv[2] || "playwright");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const user = { id: "00000000-0000-4000-8000-000000000001", email: "qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const profile = { ...user, auth_user_id: user.id, full_name: "ສົມດີ", role: "superadmin", is_active: true, permission_settings: {} };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };
const order = { id: "00000000-0000-4000-8000-000000000002", order_code: "RK26-9143", factory_bill_code: null, production_completed_at: "2026-10-01T00:00:00Z", status: "in_progress", shipment_status: "pending", balance: 2000000, net_total: 2000000, short_qty: 10, long_qty: 0, initial_deposit: 0, design_deposit: 0 };
const qr = { id: "00000000-0000-4000-8000-000000000003", order_id: order.id, order_code: order.order_code, label_status: "received", received_at: "2026-10-02T00:00:00Z" };
const notes = [{ id: "00000000-0000-4000-8000-000000000004", note_no: "TN26-10241318", source_type: "standalone", status: "saved", created_at: new Date().toISOString(), created_by_user_id: profile.id, receiver_name: "RK26-9143", receiver_phone: "+856 20 51 696 353", branch: "ສາຂາ ນ້ຳພາງ (ເມືອງທ່າໂທມ)", branch_code: "FCS-DP-0121", city: "ທ່າໂທມ", province: "ໄຊສົມບູນ", transporters: ["Anousith Express"], shipping_charge_mode: "destination", cod_enabled: false, cod_amount: 0 }];
let delivery = null, missingSchema = false;
const writes = [], errors = [];
let debugPage;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, timezoneId: "Asia/Vientiane" });
  await context.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
    window.print = () => {};
  }, { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split("/").pop();
    let data = [];
    if (missingSchema && (url.searchParams.get("select") || "").includes("cod_enabled")) {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "PGRST204", message: "Missing COD columns" }) });
      return;
    }
    if (url.pathname === "/auth/v1/user") data = user;
    else if (table === "users") data = [profile];
    else if (table === "orders") data = [order];
    else if (table === "order_qr_labels") data = [qr];
    else if (table === "shipment_delivery_requests") data = delivery ? [delivery] : [];
    else if (table === "transport_notes") {
      data = notes.filter(note => (!url.searchParams.has("id") || url.searchParams.get("id") === `eq.${note.id}`) && (!url.searchParams.has("delivery_request_id") || url.searchParams.get("delivery_request_id") === `eq.${note.delivery_request_id}`));
    }
    if (["POST", "PATCH", "DELETE"].includes(req.method())) {
      const body = req.postDataJSON();
      writes.push({ table, method: req.method(), body });
      if (table === "transport_notes") {
        let target = req.method() === "PATCH" ? notes.find(note => url.searchParams.get("id") === `eq.${note.id}`) : null;
        if (!target) { target = { id: `note-${notes.length}`, created_at: new Date().toISOString(), cod_enabled: false, cod_amount: 0 }; notes.push(target); }
        Object.assign(target, body);
        data = target;
      } else if (table === "shipment_delivery_requests") {
        delivery = { id: "request-qa", created_at: new Date().toISOString(), transport_cod_enabled: false, transport_cod_amount: 0, ...delivery, ...body };
        data = delivery;
      }
    }
    if (req.headers().accept?.includes("vnd.pgrst.object") && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await context.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const data = url.pathname === "/api/transport-branches" ? { provider: url.searchParams.get("provider"), branches: [{ id: "a1", name: notes[0].branch, code: notes[0].branch_code, district: notes[0].city, province: notes[0].province }], fetchedAt: new Date().toISOString(), stale: false } : { counts: {} };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  const page = await context.newPage();
  debugPage = page;
  page.on("dialog", dialog => dialog.accept());
  page.on("pageerror", error => errors.push(error.message));
  const codCheckbox = () => page.getByRole("checkbox", { name: /^COD/ });
  const amountInput = () => page.getByLabel("ຈຳນວນເງິນ COD (ກີບ)", { exact: true });
  const preview = page.locator("[data-transport-note-preview]");
  const openNote = async () => page.goto(`http://localhost:3000/shipments/transport-note?id=${notes[0].id}`, { waitUntil: "networkidle" });
  const saveNote = async () => {
    const response = page.waitForResponse(r => r.url().includes("/rest/v1/transport_notes") && r.request().method() === "PATCH");
    await page.getByRole("button", { name: "ອັບເດດ", exact: true }).click();
    await response;
  };
  await openNote();
  assert.equal(await preview.locator(".receiver-name").innerText(), "RK26-9143");
  assert.equal((await preview.locator(".details").innerText()).includes("RK26-9143"), false, "The recipient is not duplicated below the heading");
  assert.equal(await preview.locator(".header img").getAttribute("alt"), "BG SPORT — 20 9220 1288");
  await page.evaluate(() => document.fonts.ready);
  await preview.screenshot({ path: "/tmp/bgsport-transport-no-cod.png" });
  await codCheckbox().check();
  await amountInput().fill("0");
  const beforeInvalid = writes.length;
  await page.getByRole("button", { name: "ອັບເດດ", exact: true }).click();
  await page.getByText("ກະລຸນາປ້ອນຈຳນວນເງິນ COD ໃຫ້ຖືກຕ້ອງ", { exact: true }).waitFor();
  assert.equal(writes.length, beforeInvalid);
  await amountInput().fill("1500000");
  assert.equal(await preview.locator(".header img").getAttribute("alt"), "BG SPORT — 20 23 515 558");
  assert.equal(await preview.locator(".cod-amount").innerText(), "1,500,000 ກີບ");
  missingSchema = true;
  await page.getByRole("button", { name: "ອັບເດດ", exact: true }).click();
  await page.getByText(/20261102_add_transport_cod.sql/).waitFor();
  assert.equal(writes.length, beforeInvalid);
  missingSchema = false;
  await saveNote();
  await openNote();
  assert.equal(await codCheckbox().isChecked(), true);
  assert.equal(await amountInput().inputValue(), "1500000");
  await preview.screenshot({ path: "/tmp/bgsport-transport-cod.png" });
  await codCheckbox().uncheck();
  await saveNote();
  assert.equal(notes[0].cod_enabled, false);
  assert.equal(notes[0].cod_amount, 0);
  await openNote();
  assert.equal(await preview.locator(".cod").count(), 0);
  await codCheckbox().check();
  await amountInput().fill("1500000");
  await saveNote();
  notes.push({ ...notes[0], id: "second-note", note_no: "TN26-NO-COD", cod_enabled: false, cod_amount: 0 });
  await page.goto("http://localhost:3000/shipments/notes", { waitUntil: "networkidle" });
  for (const checkbox of await page.locator('tbody input[type="checkbox"]').all()) await checkbox.check();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: /^ເປີດພິມ/ }).click();
  const popup = await popupPromise;
  await popup.locator(".note").first().waitFor();
  await popup.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, image => image.decode())); });
  assert.equal(await popup.locator(".note").count(), 2);
  assert.equal(await popup.locator(".note").nth(0).locator(".header img").getAttribute("alt"), "BG SPORT — 20 23 515 558");
  assert.equal(await popup.locator(".note").nth(1).locator(".header img").getAttribute("alt"), "BG SPORT — 20 9220 1288");
  assert.equal(await popup.locator(".note").nth(1).locator(".cod").count(), 0);
  for (const note of await popup.locator(".note").all()) assert.ok(await note.evaluate(note => [...note.querySelectorAll(".charge,.cod,.receiver-heading")].every(item => item.getBoundingClientRect().bottom <= note.getBoundingClientRect().bottom)), "Every label fits the paper");
  const pdf = await popup.pdf({ preferCSSPageSize: true, printBackground: true });
  assert.equal((pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length, 2);
  await popup.locator(".note").nth(0).screenshot({ path: "/tmp/bgsport-transport-cod-printed.png" });
  await popup.locator(".note").nth(1).screenshot({ path: "/tmp/bgsport-transport-no-cod-printed.png" });
  await popup.close();
  const oldAddress = { branch: notes[0].branch, branch_code: notes[0].branch_code, city: notes[0].city, province: notes[0].province };
  Object.assign(notes[0], { branch: "ບ້ານ ຕານມີໄຊ ໜ້າຮ້ານລ້າງລົດ ທູບີຄາແຄ ເສັ້ນທາງຫວຍຫົງ - ເມືອງ ໄຊທານີ", branch_code: "VIC0603", city: "ໄຊທານີ", province: "ນະຄອນຫຼວງວຽງຈັນ" });
  await openNote();
  await page.evaluate(() => document.fonts.ready);
  await preview.screenshot({ path: "/tmp/bgsport-transport-cod-long-branch.png" });
  const longBounds = await preview.locator('.note').evaluate(note => ({ paper: note.getBoundingClientRect().bottom, footer: note.querySelector('.cod').getBoundingClientRect().bottom }));
  assert.ok(longBounds.footer <= longBounds.paper, 'COD and a long branch must fit the paper: ' + JSON.stringify(longBounds));
  Object.assign(notes[0], oldAddress);
  const openShipment = async () => {
    await page.goto("http://localhost:3000/shipments", { waitUntil: "networkidle" });
    await page.getByPlaceholder("ວາງ QR ໂຮງງານ, QR ຂອງຮ້ານ, ລະຫັດບິນໂຮງງານ ຫຼື ລະຫັດອໍເດີ").fill(order.order_code);
    await page.getByRole("button", { name: "ເປີດອໍເດີ", exact: true }).click();
    await page.getByText(`ໂຫຼດ ${order.order_code} ສຳເລັດ`, { exact: true }).waitFor();
  };
  const saveShipment = async () => {
    const response = page.waitForResponse(r => r.url().includes("/rest/v1/transport_notes") && ["POST", "PATCH"].includes(r.request().method()));
    await page.getByRole("button", { name: "ບັນທຶກບິນ ແລະ ການຈັດສົ່ງ", exact: true }).click();
    await response;
  };
  await openShipment();
  await page.getByRole("button", { name: "ຝາກຂົນສົ່ງ", exact: true }).click();
  await page.getByLabel("ຊື່ຜູ້ຮັບ", { exact: true }).fill("RK26-9143");
  await page.getByLabel("ເບີຜູ້ຮັບ", { exact: true }).fill("02051696353");
  const picker = page.locator("[data-transport-branch-picker]");
  await picker.getByLabel("ຝາກຂົນສົ່ງ", { exact: true }).selectOption("Anousith Express");
  await picker.getByLabel(/^ສາຂາຂົນສົ່ງ/).selectOption("a1");
  await codCheckbox().check();
  assert.equal(await amountInput().inputValue(), "2000000", "COD starts with the uncollected balance");
  await amountInput().fill("2500000");
  const beforeShipment = writes.length;
  await page.getByRole("button", { name: "ບັນທຶກບິນ ແລະ ການຈັດສົ່ງ", exact: true }).click();
  await page.getByText("ຈຳນວນເງິນ COD ເກີນຍອດຄ້າງຫຼັງຫັກເງິນທີ່ຮັບຕອນນີ້", { exact: true }).waitFor();
  assert.equal(writes.length, beforeShipment);
  await amountInput().fill("1500000");
  missingSchema = true;
  await page.getByRole("button", { name: "ບັນທຶກບິນ ແລະ ການຈັດສົ່ງ", exact: true }).click();
  await page.getByText(/20261102_add_transport_cod.sql/).waitFor();
  assert.equal(writes.length, beforeShipment, "Missing COD columns cannot partially save a delivery request");
  missingSchema = false;
  await saveShipment();
  assert.equal(delivery.transport_cod_enabled, true);
  assert.equal(delivery.transport_cod_amount, 1500000);
  assert.equal(delivery.payment_amount, 0, "COD has not yet been received");
  const linkedNote = notes.find(note => note.delivery_request_id === delivery.id);
  assert.equal(linkedNote.cod_enabled, true);
  assert.equal(linkedNote.cod_amount, 1500000);
  await openShipment();
  assert.equal(await codCheckbox().isChecked(), true);
  assert.equal(await amountInput().inputValue(), "1500000");
  await codCheckbox().uncheck();
  await saveShipment();
  assert.equal(delivery.transport_cod_enabled, false);
  assert.equal(delivery.transport_cod_amount, 0);
  assert.equal(linkedNote.cod_enabled, false);
  assert.equal(linkedNote.cod_amount, 0);
  delivery.status = "submitted";
  await openShipment();
  assert.equal(await codCheckbox().isDisabled(), true);
  assert.equal(writes.some(write => ["orders", "payment_transactions", "shipment_payments"].includes(write.table)), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ["recipient heading without duplicate name", "COD and non-COD preview, persistence, and mixed-batch PDF", "COD validation and schema preflight", "shipment COD snapshot and reopening", "clearing both COD snapshots", "submitted request lock", "long COD branch fits 80 × 100 mm", "no payments recorded by COD"], mockWrites: writes.length }));
} catch (error) {
  if (debugPage) console.error(JSON.stringify({ url: debugPage.url(), body: (await debugPage.locator("body").innerText()).slice(-2500), errors }));
  throw error;
} finally {
  await browser.close();
}
