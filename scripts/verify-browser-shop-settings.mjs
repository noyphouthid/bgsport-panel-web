// Local browser integration with mocked backend calls only; no live writes.
// Usage: node scripts/verify-browser-shop-settings.mjs /path/to/playwright/test.mjs [screenshot-dir]
import assert from "node:assert/strict";
const { chromium, expect } = await import(process.argv[2] || "playwright/test");
const shotDir = process.argv[3];
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL), base = process.env.TEST_BASE_URL || "http://localhost:3000";
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = { id: uid(1), email: "qa@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
const profile = { ...user, auth_user_id: user.id, full_name: "QA Admin", role: "superadmin", is_active: true, permission_settings: {} };
const session = { access_token: "qa-token", refresh_token: "qa-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };
// 1x1 PNG, enough to exercise upload and rendering.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==", "base64");

let shop = { shop_name: "ຮ້ານ ບີຈີ ສປອຮ໌ດ", phone: "+856 20 9220 1288", address: "ບ້ານ ໂພນຕ້ອງສະຫວາດ", logo_path: null, qr_path: "qr/old.png" };
let canEdit = true, missing = false, failUpdate = false;
const uploads = [], removals = [], updates = [], errors = [];

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ key, session }) => { localStorage.setItem(key, JSON.stringify(session)); }, { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session });
  await context.route(`${backend.origin}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split("/").pop();
    if (url.pathname.startsWith("/storage/v1/object/public/")) return route.fulfill({ status: 200, contentType: "image/png", body: png });
    if (url.pathname.startsWith("/storage/v1/object/")) {
      if (req.method() === "DELETE") { removals.push(...req.postDataJSON().prefixes); return route.fulfill({ status: 200, json: [] }); }
      uploads.push(url.pathname.replace("/storage/v1/object/shop-branding/", ""));
      return route.fulfill({ status: 200, json: { Key: url.pathname, Id: uid(9) } });
    }
    if (missing && (table === "shop_settings" || table === "can_manage_shop_settings")) return route.fulfill({ status: 404, json: { code: "PGRST205", message: "missing" } });
    let data = [];
    if (url.pathname === "/auth/v1/user") data = user;
    else if (table === "users") data = [profile];
    else if (table === "can_manage_shop_settings") data = canEdit;
    else if (table === "shop_settings") {
      if (req.method() === "PATCH") {
        if (failUpdate) return route.fulfill({ status: 403, json: { code: "42501", message: "denied" } });
        const body = req.postDataJSON(); updates.push(body); shop = { ...shop, ...body };
      }
      data = [shop];
    } else if (table === "fabrics") data = [{ id: uid(3), name: "QA Fabric", short_price: 100000, long_price: 120000, long_add: 20000, is_active: true }];
    if (req.headers().accept?.includes("vnd.pgrst.object") && Array.isArray(data)) data = data[0] || null;
    return route.fulfill({ status: 200, json: data });
  });
  await context.route("**/api/**", route => route.fulfill({ json: { counts: {} } }));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));

  // Loads saved values, and the navigation exposes the page.
  await page.goto(`${base}/settings/shop`, { waitUntil: "networkidle" });
  await expect(page.getByLabel("ຊື່ຮ້ານ")).toHaveValue("ຮ້ານ ບີຈີ ສປອຮ໌ດ");
  await expect(page.getByRole("link", { name: "ຂໍ້ມູນຮ້ານ", exact: true }).first()).toHaveAttribute("href", "/settings/shop");
  await expect(page.getByRole("button", { name: "ບັນທຶກ", exact: true })).toBeDisabled();
  await expect(page.locator('img[alt="QR ຮ້ານ"]')).toHaveAttribute("src", /shop-branding\/qr\/old\.png/);

  // Rejects unsupported files and an empty name without writing.
  await page.getByLabel("ເລືອກຮູບ QR ຮ້ານ").setInputFiles({ name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByText("ຮອງຮັບສະເພາະໄຟລ໌ JPG, PNG ແລະ WEBP")).toBeVisible();
  await page.getByLabel("ຊື່ຮ້ານ").fill("  ");
  await page.getByRole("button", { name: "ບັນທຶກ", exact: true }).click();
  await expect(page.getByText("ກະລຸນາປ້ອນຊື່ຮ້ານ")).toBeVisible();
  assert.equal(updates.length, 0);

  // A failed save discards the new upload and keeps the old QR file.
  failUpdate = true;
  await page.getByLabel("ຊື່ຮ້ານ").fill("BG Test");
  await page.getByLabel("ເລືອກຮູບ QR ຮ້ານ").setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "ບັນທຶກ", exact: true }).click();
  await expect(page.getByText("denied")).toBeVisible();
  assert.equal(uploads.length, 1);
  assert.deepEqual(removals, [uploads[0]]);
  removals.length = 0; uploads.length = 0; failUpdate = false;

  // Saves text and images, then removes the replaced file.
  await page.getByLabel("ເບີໂທ").fill("020 1111 2222");
  await page.getByLabel("ທີ່ຢູ່").fill("ບ້ານ ທົດສອບ");
  await page.getByLabel("ເລືອກຮູບ ໂລໂກ້ຮ້ານ").setInputFiles({ name: "logo.webp", mimeType: "image/webp", buffer: png });
  if (shotDir) await page.screenshot({ path: `${shotDir}/shop-settings.png`, fullPage: true });
  await page.getByRole("button", { name: "ບັນທຶກ", exact: true }).click();
  await expect(page.getByText("ບັນທຶກຂໍ້ມູນຮ້ານແລ້ວ")).toBeVisible();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].shop_name, "BG Test");
  assert.equal(updates[0].phone, "020 1111 2222");
  assert.match(updates[0].logo_path, /^logo\/[\w-]+\.webp$/);
  assert.match(updates[0].qr_path, /^qr\/[\w-]+\.png$/);
  assert.deepEqual(removals, ["qr/old.png"]);
  await expect(page.getByRole("button", { name: "ບັນທຶກ", exact: true })).toBeDisabled();

  // The quotation shows the saved details and the QR under the totals.
  await page.goto(`${base}/quotations/new`, { waitUntil: "networkidle" });
  const qr = page.locator('img[alt="QR ຮ້ານ"]');
  await expect(qr).toHaveAttribute("src", new RegExp(`shop-branding/${shop.qr_path}`));
  await expect(page.locator(`img[alt="BG Test Logo"]`)).toHaveAttribute("src", new RegExp(`shop-branding/${shop.logo_path}`));
  await expect(page.getByText("ບ້ານ ທົດສອບ")).toBeVisible();
  await expect(page.getByText("020 1111 2222")).toBeVisible();
  const totalsBox = await page.getByText("ຈຳນວນລວມ", { exact: true }).boundingBox();
  const qrBox = await qr.boundingBox();
  assert.ok(qrBox.y > totalsBox.y, "QR sits below the totals");
  if (shotDir) await page.screenshot({ path: `${shotDir}/quotation-qr.png`, fullPage: true });

  // Removing the QR hides it on the quotation.
  await page.goto(`${base}/settings/shop`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "ລົບຮູບ QR ຮ້ານ" }).click();
  await page.getByRole("button", { name: "ບັນທຶກ", exact: true }).click();
  await expect(page.getByText("ບັນທຶກຂໍ້ມູນຮ້ານແລ້ວ")).toBeVisible();
  assert.equal(shop.qr_path, null);
  await page.goto(`${base}/quotations/new`, { waitUntil: "networkidle" });
  await expect(page.locator('img[alt="BG Test Logo"]')).toBeVisible();
  await expect(page.locator('img[alt="QR ຮ້ານ"]')).toHaveCount(0);

  // View-only users cannot edit.
  canEdit = false;
  await page.goto(`${base}/settings/shop`, { waitUntil: "networkidle" });
  await expect(page.getByText("ທ່ານເບິ່ງໄດ້ຢ່າງດຽວ", { exact: false })).toBeVisible();
  await expect(page.getByLabel("ຊື່ຮ້ານ")).toBeDisabled();
  canEdit = true;

  // Before the migration: settings explains it, quotations still use the defaults.
  missing = true;
  await page.goto(`${base}/settings/shop`, { waitUntil: "networkidle" });
  await expect(page.getByRole("alert").filter({ hasText: "20261112_create_shop_settings.sql" })).toBeVisible();
  await page.goto(`${base}/quotations/new`, { waitUntil: "networkidle" });
  await expect(page.locator('img[alt="ຮ້ານ ບີຈີ ສປອຮ໌ດ Logo"]')).toBeVisible();

  assert.deepEqual(errors, []);
  console.log("shop settings browser verification passed");
} finally {
  await browser.close();
}
