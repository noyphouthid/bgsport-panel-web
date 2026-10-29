// Run against the local dev server; all backend requests are mocked.
import assert from "node:assert/strict";
const { chromium } = await import(process.argv[2] || "playwright");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const user = { id: "00000000-0000-4000-8000-000000000001", email: "qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const viewer = { ...user, auth_user_id: user.id, full_name: "Owner QA", role: "superadmin", is_active: true, permission_settings: {} };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: Math.floor(Date.now() / 1000) + 43200, token_type: "bearer", user };
const codes = ["PK26", "MK26", "PM26", "MM26", "PKF26"];
let rows = codes.map((code, index) => ({ id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`, code, label: null, sort_order: index * 10, is_active: true, is_system: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }));
const writes = [];
const usedCodes = new Set(["PK26"]);
let tableMissing = false;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split("/").at(-1);
    let data = [];
    if (url.pathname === "/auth/v1/user") data = user;
    else if (table === "users") data = [viewer];
    else if (table === "order_code_types") {
      if (tableMissing) {
        await route.fulfill({ status: 404, json: { code: "PGRST205", message: "Could not find the table 'public.order_code_types' in the schema cache" } });
        return;
      }
      if (req.method() === "PATCH") {
        const patch = req.postDataJSON(), id = url.searchParams.get("id")?.slice(3);
        writes.push({ method: "PATCH", id, patch });
        rows = rows.map(row => row.id === id ? { ...row, ...patch } : row);
      } else if (req.method() === "DELETE") {
        const id = url.searchParams.get("id")?.slice(3);
        writes.push({ method: "DELETE", id });
        rows = rows.filter(row => row.id !== id);
      } else {
        assert.equal(req.method(), "GET", "Reading an empty table must not seed defaults");
        data = url.searchParams.get("is_active") === "eq.true" ? rows.filter(row => row.is_active) : rows;
      }
    } else if (table === "orders" && req.method() === "HEAD") {
      const code = url.searchParams.get("order_code")?.replace(/^ilike\./, "").replace(/-%$/, "");
      await route.fulfill({ status: 200, headers: { "content-range": `*/${usedCodes.has(code) ? 1 : 0}`, "access-control-expose-headers": "content-range" }, body: "" });
      return;
    } else assert.equal(req.method(), "GET", "Unrelated backend writes are forbidden");
    if (req.headers().accept?.includes("vnd.pgrst.object") && Array.isArray(data)) data = data[0] || null;
    await route.fulfill({ json: data });
  });
  await context.route("**/api/**", async route => {
    assert.equal(route.request().method(), "GET");
    await route.fulfill({ json: { counts: {} } });
  });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const rowFor = code => page.locator("tbody tr").filter({ has: page.locator("td:first-child", { hasText: new RegExp(`^${code}$`) }) });
  const go = async path => {
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/rest/v1/order_code_types"),
      page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" }),
    ]);
    if (path === "/orders/new") {
      await page.getByRole("option", { name: "ເລືອກ TYPE", exact: true }).waitFor({ state: "attached" });
    } else {
      await page.getByText(/ຈຳນວນ: \d+ ລາຍການ/).waitFor();
    }
  };
  await go("/order-code-types");
  for (const code of codes) {
    await rowFor(code).getByRole("button", { name: "ແກ້ໄຂ", exact: true }).click();
    const active = page.getByRole("checkbox").last();
    assert.equal(await active.isEnabled(), true, `${code} can be disabled`);
    await active.uncheck();
    await page.getByRole("button", { name: "ບັນທຶກການແກ້ໄຂ", exact: true }).click();
    await rowFor(code).getByText("ປິດ", { exact: true }).waitFor();
    assert.equal(rows.find(row => row.code === code).is_active, false);
  }
  assert.equal(rows.every(row => !row.is_active), true);
  await go("/orders/new");
  for (const code of codes) assert.equal(await page.getByRole("option", { name: code, exact: true }).count(), 0, "Disabling every type must not restore defaults");
  await go("/order-code-types");
  await rowFor("PK26").getByRole("button", { name: "ລຶບ", exact: true }).click();
  await page.getByText(/ຍັງມີອໍເດີໃຊ້ລະຫັດນີ້ຢູ່/).waitFor();
  assert.equal(writes.filter(write => write.method === "DELETE").length, 0, "Used types cannot be deleted");
  // Re-enable a type with historical orders to verify both status transitions.
  await rowFor("PK26").getByRole("button", { name: "ແກ້ໄຂ", exact: true }).click();
  await page.getByRole("checkbox").last().check();
  await page.getByRole("button", { name: "ບັນທຶກການແກ້ໄຂ", exact: true }).click();
  await rowFor("PK26").getByText("ໃຊ້ງານ", { exact: true }).waitFor();
  await go("/orders/new");
  await page.getByRole("option", { name: "PK26", exact: true }).waitFor({ state: "attached" });
  assert.equal(await page.getByRole("option", { name: "PK26", exact: true }).count(), 1);
  assert.equal(await page.getByRole("option", { name: "MK26", exact: true }).count(), 0);
  await go("/order-code-types");
  usedCodes.clear();
  for (const code of codes) {
    await rowFor(code).getByRole("button", { name: "ລຶບ", exact: true }).click();
    await page.locator(".swal2-confirm").click();
    await rowFor(code).waitFor({ state: "detached" });
  }
  assert.equal(rows.length, 0);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("cell", { name: "ບໍ່ມີຂໍ້ມູນໃນລະບົບ", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "+ ເພີ່ມລາຍການ", exact: true }).isEnabled(), true);
  await go("/orders/new");
  for (const code of codes) assert.equal(await page.getByRole("option", { name: code, exact: true }).count(), 0, "Deleted types stay absent");
  tableMissing = true;
  await go("/order-code-types");
  assert.equal(await rowFor("PK26").getByRole("button", { name: "ແກ້ໄຂ", exact: true }).isDisabled(), true, "Missing-table fallback rows remain read-only");
  assert.equal(writes.filter(write => write.method === "DELETE").length, codes.length);
  assert.deepEqual(errors, []);
  console.log("PASS: disable/re-enable system and legacy types, preserve used types, delete unused defaults, no resurrection after disabling/deleting all types, missing-table fallback, and no production writes.");
} finally { await browser.close(); }
