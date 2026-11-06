// Every backend request is intercepted. No production reads or writes.
import assert from "node:assert/strict";
const { chromium } = await import(process.argv[2] || "playwright");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
const id = "00000000-0000-4000-8000-000000000002";
const user = { id, email: "agent-qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const profile = { ...user, auth_user_id: id, full_name: "Agent QA", role: "agent", is_active: true, permission_settings: {} };
const admin = { ...profile, id: "00000000-0000-4000-8000-000000000001", auth_user_id: "00000000-0000-4000-8000-000000000001", full_name: "Admin QA", role: "superadmin" };
const graphic = { ...profile, id: "00000000-0000-4000-8000-000000000003", auth_user_id: "00000000-0000-4000-8000-000000000003", full_name: "Graphic QA", role: "graphic" };
const fabric = { id: "00000000-0000-4000-8000-000000000004", name: "QA Fabric", short_price: 50000, long_price: 60000, long_add: 10000, is_active: true };
let queue = { id: "00000000-0000-4000-8000-000000000005", agent_user_id: id, created_by_user_id: id, graphic_user_id: graphic.id, queue_date: "2026-11-01", queue_number: "0001", queue_year: 2026, queue_month: 11, queue_sequence: 1, order_sequence: 1, order_no: "11001", type_code: "AG26", customer_name: "QA customer", customer_phone: "20 99999999", work_category: "sports", style_name: "QA", notes: "", is_designed: false, created_at: "2026-11-01T02:00:00Z" };
const quotation = { id: "00000000-0000-4000-8000-000000000006", quote_no: "QT26-11-000", quote_date: "2026-11-01", status: "draft", deposit: 0 };
let deposit = null;
const writes = [];
const order = { id: "00000000-0000-4000-8000-000000000012", order_code: "AG26-1001", order_date: "2026-01-01", created_at: "2026-11-01T02:00:00Z", agent_user_id: id, short_qty: 80, long_qty: 20, free_qty: 5, net_total: 9000000, balance: 9000000, design_deposit: 0, initial_deposit: 0, factory_cost: 0, agent_commission_rate_lak: 2500, status: "in_progress", shipment_status: "pending" };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: Math.floor(Date.now() / 1000) + 43200, token_type: "bearer", user };
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    const table = url.pathname.split("/").pop();
    let data = [];
    if (url.pathname === "/auth/v1/user") data = user;
    else if (url.pathname === "/rest/v1/users") data = url.searchParams.has("auth_user_id") ? [profile] : [profile, admin, graphic];
    else if (url.pathname === "/rest/v1/orders") data = [order];
    else if (table === "fabrics") data = [fabric];
    else if (table === "internal_collar_types") data = [{ code: "none", label: "ຄໍປົກກະຕິ", unit_price: 0, sort_order: 0, is_active: true }];
    else if (table === "internal_work_categories") data = [{ code: "sports", label: "ເສື້ອກິລາ", sort_order: 10, is_active: true }];
    else if (table === "order_code_types") data = [{ code: "AG26", type_code: "AG26", is_active: true, sort_order: 1 }];
    else if (table === "factory_deposit_orders") data = deposit ? [deposit] : [];
    else if (table === "quotation_drafts") data = [quotation];
    else if (table === "design_queue_entries") data = queue && url.searchParams.get("is_designed") !== "eq.true" ? [queue] : [];
    if (req.method() !== "GET") {
      assert.ok(["factory_deposit_orders", "factory_deposit_order_history", "design_queue_entries", "sales_agent_deposit_editing_enabled"].includes(table), `Unexpected mocked mutation: ${req.method()} ${table}`);
      const body = req.method() === "DELETE" ? null : req.postDataJSON();
      writes.push({ table, method: req.method(), body });
      if (table === "sales_agent_deposit_editing_enabled") data = true;
      else if (table === "factory_deposit_orders") {
        deposit = { ...deposit, ...body, id: "00000000-0000-4000-8000-000000000007", agent_user_id: id, deposit_no: "DPF26-11-000" };
        data = [deposit];
      } else if (table === "design_queue_entries" && req.method() === "DELETE") {
        assert.equal(url.searchParams.get("id"), `eq.${queue.id}`);
        data = [{ id: queue.id }]; queue = null;
      }
    }
    if (req.headers().accept?.includes("vnd.pgrst.object") && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ json: data, headers: { "Content-Range": "0-0/1" } });
  });
  let reportCalls = 0;
  await context.route("**/api/**", async route => {
    const req = route.request(), url = new URL(req.url());
    assert.equal(req.method(), "GET");
    if (url.pathname === "/api/agent-sales") {
      reportCalls++;
      assert.equal(req.headers().authorization, "Bearer qa-token");
      assert.equal(url.searchParams.has("agentId"), false);
      const empty = url.searchParams.get("month") === "12";
      await route.fulfill({ json: { agents: [], orders: empty ? [] : [order], summary: empty
        ? { orders: 0, paidShirts: 0, freeShirts: 0, salesLak: 0, commissionLak: 0 }
        : { orders: 1, paidShirts: 100, freeShirts: 5, salesLak: 9000000, commissionLak: 250000 } } });
    } else await route.fulfill({ json: { counts: {} } });
  });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/orders`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "ເບິ່ງຍອດຂາຍ ແລະ ຄ່າຄອມປະຈຳເດືອນ", exact: true }).click();
  await page.getByLabel("ເດືອນລາຍງານ").fill("2026-11");
  const report = page.getByRole("region", { name: "ຍອດຂາຍແລະຄ່າຄອມຕົວແທນ" });
  await report.getByText("250,000", { exact: true }).first().waitFor();
  assert.equal(await report.getByRole("combobox").count(), 0, "Other agents cannot be selected");
  assert.equal(await report.getByRole("link", { name: order.order_code }).count(), 1);
  const allowed = new Set(["/orders","/order-alerts","/design-queue","/design-queue/assets","/quotations","/factory-deposit-orders","/factory-receipts/orders","/shipments","/shipments/notes"]);
  for (const href of await page.locator(".app-sidebar a[href]").evaluateAll(links => links.map(link => link.getAttribute("href")))) assert.ok(allowed.has(href), `Unexpected agent sidebar link ${href}`);
  await page.screenshot({ path: "/private/tmp/bgsport-sales-agent-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForFunction(() => document.querySelector(".app-sidebar").getBoundingClientRect().right <= 1);
  const mobileBounds = await report.boundingBox();
  assert.ok(mobileBounds.x >= 0 && mobileBounds.x + mobileBounds.width <= 375, `Report must fit the visible mobile viewport: ${JSON.stringify(mobileBounds)}`);
  const overflow = await report.evaluate(el => Array.from(el.children).map(child => ({ width: child.getBoundingClientRect().width, scrollWidth: child.scrollWidth, right: child.getBoundingClientRect().right })));
  assert.ok(overflow.every(child => child.right <= 375), `Report content must stay within the viewport: ${JSON.stringify(overflow)}`);
  assert.ok(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth), "Report fits mobile viewport");
  await page.screenshot({ path: "/private/tmp/bgsport-sales-agent-mobile.png", fullPage: true });
  await page.getByLabel("ເດືອນລາຍງານ").fill("2026-12");
  await report.getByText("ບໍ່ມີອໍເດີໃນເດືອນນີ້", { exact: true }).waitFor();
  await page.goto(`${base}/users`, { waitUntil: "networkidle" });
  await page.waitForURL(`${base}/orders`);
  await page.goto(`${base}/quotations`, { waitUntil: "networkidle" });
  assert.equal(await page.locator('main a[href^="/factory-deposit-orders/new"]').count(), 1);
  await page.goto(`${base}/quotations/new`, { waitUntil: "networkidle" });
  assert.ok(await page.getByRole("button", { name: "ສ້າງໃບມັດຈຳ", exact: true }).count() > 0);
  for (const path of ["/design-queue", "/design-queue/completed", "/design-queue/assets"]) {
    await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
    assert.equal(new URL(page.url()).pathname, path, `Agent can open ${path} directly`);
    assert.ok(await page.locator('main a[href="/design-queue/completed"]').count() > 0);
    assert.ok(await page.locator('main a[href="/design-queue/assets"]').count() > 0);
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${base}/factory-deposit-orders`, { waitUntil: "networkidle" });
  assert.equal(await page.locator('main a[href="/factory-deposit-orders/new"]').count(), 1);
  await page.locator('main a[href="/factory-deposit-orders/new"]').click();
  const field = text => page.locator("label").filter({ hasText: new RegExp(`^${text}$`) }).locator("..").locator("input,select").first();
  await page.getByPlaceholder("ຊື່ທີມ", { exact: true }).fill("Agent deposit QA");
  await field("ລະຫັດອໍເດີ").fill("AG26-11002");
  await page.getByLabel("ແອັດມິນ", { exact: true }).selectOption(admin.id);
  await page.getByLabel("ຜູ້ອອກແບບ", { exact: true }).selectOption(graphic.id);
  await page.getByRole("button", { name: "ບັນທຶກຮ່າງ", exact: true }).first().click();
  await page.locator(".swal2-confirm").click();
  await page.waitForURL(`${base}/factory-deposit-orders`);
  assert.equal(deposit.team_name, "Agent deposit QA");
  assert.ok(writes.some(write => write.table === "factory_deposit_orders" && write.method === "POST"));
  // An agent must also be able to edit an owned deposit originally authored by staff.
  deposit.created_by_user_id = admin.id;
  await page.goto(`${base}/factory-deposit-orders/new?id=${deposit.id}`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("ຊື່ທີມ", { exact: true }).fill("Agent edited own deposit");
  await page.getByRole("button", { name: "ບັນທຶກຮ່າງ", exact: true }).first().click();
  await page.locator(".swal2-confirm").click();
  await page.waitForURL(`${base}/factory-deposit-orders`);
  assert.equal(deposit.team_name, "Agent edited own deposit");
  assert.ok(writes.some(write => write.table === "factory_deposit_orders" && write.method === "PATCH"));
  await page.goto(`${base}/design-queue`, { waitUntil: "networkidle" });
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "ລົບ", exact: true }).click();
  await page.getByText(/ລົບຄິວ .* ສຳເລັດແລ້ວ/).waitFor();
  assert.equal(queue, null);
  assert.ok(writes.some(write => write.table === "design_queue_entries" && write.method === "DELETE"));
  assert.ok(reportCalls >= 2);
  assert.deepEqual(errors, []);
  console.log("PASS: agent deposit create/edit, staff-created owned deposits, queue deletion, design subpages, commissions, boundaries and mobile layout. All backend writes mocked.");
} finally { await browser.close(); }
