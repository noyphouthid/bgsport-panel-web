// Run against the local dev server. All app APIs and database calls are mocked; no production writes.
import assert from "node:assert/strict";
const { chromium } = await import(process.argv[2] || "playwright");
process.loadEnvFile(new URL("../.env.local", import.meta.url));
const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "qa@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const profile = {
  ...user,
  auth_user_id: user.id,
  full_name: "QA Admin",
  role: "superadmin",
  is_active: true,
  permission_settings: {},
};
const session = {
  access_token: "qa-token",
  refresh_token: "qa-refresh",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user,
};
const order = {
  id: "00000000-0000-4000-8000-000000000002",
  order_code: "PK26-QA",
  factory_bill_code: null,
  production_completed_at: "2026-10-01T00:00:00Z",
  status: "in_progress",
  shipment_status: "pending",
  balance: 0,
  net_total: 1000000,
  short_qty: 10,
  long_qty: 0,
  initial_deposit: 1000000,
  design_deposit: 0,
};
const qr = {
  id: "00000000-0000-4000-8000-000000000003",
  order_id: order.id,
  order_code: order.order_code,
  label_status: "received",
  received_at: "2026-10-02T00:00:00Z",
};
let note = {
  id: "00000000-0000-4000-8000-000000000004",
  note_no: "QA-NOTE",
  created_at: new Date().toISOString(),
  print_count: 0,
  created_by_user_id: profile.id,
  receiver_name: "QA Receiver",
  receiver_phone: "02012345678",
  branch: "Legacy branch",
  city: "Legacy city",
  province: "Legacy province",
  transporters: ["HAL Logistic"],
  shipping_charge_mode: "destination",
  source_type: "standalone",
  status: "saved",
};
const directories = {
  hal: [
    {
      id: "h1",
      name: "ຮ່ອງຄ້າ",
      code: "HL01",
      district: "ຈັນທະບູລີ",
      province: "ນະຄອນຫຼວງວຽງຈັນ",
    },
    {
      id: "h2",
      name: "ສາຂາ ວັງວຽງ",
      code: "HL02",
      district: "ວັງວຽງ",
      province: "ວຽງຈັນ",
    },
  ],
  anousith: [
    {
      id: "a1",
      name: "ສາຂາ ມະຫາໄຊ",
      code: "FCS-001",
      district: "ມະຫາໄຊ",
      province: "ຄຳມ່ວນ",
    },
  ],
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  await context.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: `sb-${backend.hostname.split(".")[0]}-auth-token`, session },
  );
  const writes = [],
    errors = [],
    apiCalls = [];
  let apiFails = false,
    submitted = false,
    schemaMissing = false;
  await context.route(`${backend.origin}/**`, async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    let data = [];
    if (
      schemaMissing &&
      ["branch_code", "transport_branch_code"].includes(
        url.searchParams.get("select"),
      )
    ) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "42703",
          message: "column does not exist",
        }),
      });
      return;
    }
    if (url.pathname === "/auth/v1/user") data = user;
    else if (url.pathname === "/rest/v1/users") data = [profile];
    else if (url.pathname === "/rest/v1/orders") data = [order];
    else if (url.pathname === "/rest/v1/order_qr_labels") data = [qr];
    else if (url.pathname === "/rest/v1/transport_notes")
      data = url.searchParams.has("delivery_request_id") ? [] : [note];
    else if (
      url.pathname === "/rest/v1/shipment_delivery_requests" &&
      submitted
    )
      data = [
        {
          id: "submitted",
          order_id: order.id,
          delivery_method: "transport",
          status: "submitted",
          delivery_scheduled_at: "2026-10-14T10:00:00Z",
          transport_branch: note.branch,
          transport_city: note.city,
          transport_province: note.province,
          transport_providers: note.transporters,
        },
      ];
    if (["POST", "PATCH"].includes(req.method())) {
      const body = req.postDataJSON();
      writes.push({ table: url.pathname.split("/").pop(), body });
      data = { ...body, id: "saved-id" };
      if (
        url.pathname === "/rest/v1/transport_notes" &&
        !body.delivery_request_id
      ) {
        note = { ...note, ...body };
        data = note;
      }
    }
    if (
      req.headers().accept?.includes("vnd.pgrst.object") &&
      Array.isArray(data)
    )
      data = data[0] || null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/transport-branches") {
      const provider = url.searchParams.get("provider");
      apiCalls.push(provider);
      assert.equal(route.request().headers().authorization, "Bearer qa-token");
      await route.fulfill({
        status: apiFails ? 502 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          apiFails
            ? { message: "QA API unavailable" }
            : {
                provider,
                branches: directories[provider],
                fetchedAt: new Date().toISOString(),
                stale: false,
              },
        ),
      });
    } else
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"counts":{}}',
      });
  });
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    "http://localhost:3000/shipments/transport-note?id=" + note.id,
    { waitUntil: "networkidle" },
  );
  let picker = page.locator("[data-transport-branch-picker]");
  assert.equal(
    await picker.getByLabel("ຝາກສາຂາ", { exact: true }).inputValue(),
    note.branch,
    "Loading a directory does not change historical notes",
  );
  await page.getByRole("button", { name: "ອັບເດດ", exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(writes.at(-1).body.branch, note.branch);
  await picker.getByLabel("ກັ່ນຕອງແຂວງ").selectOption("ວຽງຈັນ");
  await picker.getByLabel("ຄົ້ນຫາຊື່ ຫຼືລະຫັດສາຂາ").fill("HL02");
  await picker.getByLabel(/^ສາຂາຂົນສົ່ງ/).selectOption("h2");
  assert.equal(
    await picker.getByLabel("ເມືອງ", { exact: true }).inputValue(),
    "ວັງວຽງ",
  );
  assert.equal(
    await picker.getByLabel("ແຂວງ", { exact: true }).inputValue(),
    "ວຽງຈັນ",
  );
  assert.ok((await page.locator("body").textContent()).includes("ສາຂາ ວັງວຽງ"));
  await picker
    .getByLabel("ຝາກຂົນສົ່ງ", { exact: true })
    .selectOption("Anousith Express");
  assert.equal(
    await picker.getByLabel("ຝາກສາຂາ", { exact: true }).inputValue(),
    "",
    "Switching carrier clears the previous destination",
  );
  await picker.getByLabel(/^ສາຂາຂົນສົ່ງ/).selectOption("a1");
  await page.getByRole("button", { name: "ອັບເດດ", exact: true }).click();
  await page.waitForTimeout(200);
  const saved = writes.at(-1).body;
  assert.equal(saved.branch, directories.anousith[0].name);
  assert.equal(saved.city, "ມະຫາໄຊ");
  assert.equal(saved.province, "ຄຳມ່ວນ");
  assert.equal(saved.branch_code, "FCS-001");
  const preview = page.locator("[data-transport-note-preview]");
  assert.ok((await preview.innerText()).includes("ລະຫັດສາຂາ: FCS-001"));
  const detailLines = await preview.locator("div").allInnerTexts();
  const branchLine = detailLines.findIndex((text) =>
    text.startsWith("ຝາກສາຂາ:"),
  );
  assert.ok(
    branchLine >= 0 && detailLines[branchLine + 1].startsWith("ລະຫັດສາຂາ:"),
  );
  directories.anousith[0].code = "CHANGED-LATER";
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await picker.getByLabel("ລະຫັດສາຂາ", { exact: true }).inputValue(),
    "FCS-001",
    "Saved branch codes remain snapshots after directory changes",
  );
  directories.anousith[0].code = "FCS-001";
  assert.deepEqual(saved.transporters, ["Anousith Express"]);
  await picker.screenshot({
    path: "/tmp/bgsport-transport-branches-desktop.png",
  });
  await preview.screenshot({
    path: "/tmp/bgsport-transport-note-branch-code.png",
  });
  schemaMissing = true;
  const writesBeforeSchemaFailure = writes.length;
  await page.getByRole("button", { name: "ອັບເດດ", exact: true }).click();
  await page.getByText(/20261017_add_transport_branch_code.sql/).waitFor();
  assert.equal(
    writes.length,
    writesBeforeSchemaFailure,
    "A missing migration cannot partially save code-bearing notes",
  );
  schemaMissing = false;
  apiFails = true;
  await picker
    .getByLabel("ຝາກຂົນສົ່ງ", { exact: true })
    .selectOption("HAL Logistic");
  await picker.getByRole("alert").waitFor();
  assert.ok((await picker.textContent()).includes("QA API unavailable"));
  await picker.getByLabel("ຝາກສາຂາ", { exact: true }).fill("Manual branch");
  await picker.getByLabel("ເມືອງ", { exact: true }).fill("Manual district");
  await picker.getByLabel("ແຂວງ", { exact: true }).fill("Manual province");
  apiFails = false;
  await picker.getByRole("button", { name: "ລອງໃໝ່", exact: true }).click();
  await picker.getByLabel(/^ສາຂາຂົນສົ່ງ/).waitFor();
  assert.equal(
    await picker.getByLabel("ຝາກສາຂາ", { exact: true }).inputValue(),
    "Manual branch",
  );
  await picker
    .getByLabel("ຝາກຂົນສົ່ງ", { exact: true })
    .selectOption("Mixay Express");
  assert.equal(await picker.getByLabel(/^ສາຂາຂົນສົ່ງ/).count(), 0);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page
    .getByRole("button", { name: "Close navigation", exact: true })
    .evaluate((b) => b.click());
  await page.waitForFunction(
    () =>
      document.querySelector(".app-sidebar").getBoundingClientRect().right <= 1,
  );
  await picker
    .getByLabel("ຝາກຂົນສົ່ງ", { exact: true })
    .selectOption("HAL Logistic");
  await picker.getByLabel(/^ສາຂາຂົນສົ່ງ/).selectOption("h1");
  await picker.screenshot({
    path: "/tmp/bgsport-transport-branches-mobile.png",
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Mobile form fits the viewport",
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("http://localhost:3000/shipments", {
    waitUntil: "networkidle",
  });
  await page
    .getByPlaceholder(
      "ວາງ QR ໂຮງງານ, QR ຂອງຮ້ານ, ລະຫັດບິນໂຮງງານ ຫຼື ລະຫັດອໍເດີ",
    )
    .fill(order.order_code);
  await page.getByRole("button", { name: "ເປີດອໍເດີ", exact: true }).click();
  await page
    .getByText(`ໂຫຼດ ${order.order_code} ສຳເລັດ`, { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "ຝາກຂົນສົ່ງ", exact: true }).click();
  picker = page.locator("[data-transport-branch-picker]");
  await page.getByLabel("ຊື່ຜູ້ຮັບ", { exact: true }).fill("QA Receiver");
  await page.getByLabel("ເບີຜູ້ຮັບ", { exact: true }).fill("02012345678");
  await picker
    .getByLabel("ຝາກຂົນສົ່ງ", { exact: true })
    .selectOption("HAL Logistic");
  await picker.getByLabel(/^ສາຂາຂົນສົ່ງ/).selectOption("h1");
  assert.equal(
    await page.getByLabel("ຊື່ຜູ້ຮັບ", { exact: true }).inputValue(),
    "QA Receiver",
  );
  await page
    .getByRole("button", { name: "ບັນທຶກບິນ ແລະ ການຈັດສົ່ງ", exact: true })
    .click();
  await page.waitForTimeout(300);
  const delivery = writes.find(
    (w) => w.table === "shipment_delivery_requests",
  )?.body;
  assert.ok(
    delivery,
    "Delivery request saved: " +
      (await page.locator("body").innerText()).slice(-2400),
  );
  assert.equal(delivery.transport_branch, directories.hal[0].name);
  assert.equal(delivery.transport_branch_code, "HL01");
  assert.equal(delivery.transport_city, "ຈັນທະບູລີ");
  assert.equal(delivery.transport_province, "ນະຄອນຫຼວງວຽງຈັນ");
  assert.equal(writes.at(-1).table, "transport_notes");
  assert.equal(writes.at(-1).body.branch, delivery.transport_branch);
  assert.equal(writes.at(-1).body.branch_code, delivery.transport_branch_code);
  submitted = true;
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByPlaceholder(
      "ວາງ QR ໂຮງງານ, QR ຂອງຮ້ານ, ລະຫັດບິນໂຮງງານ ຫຼື ລະຫັດອໍເດີ",
    )
    .fill(order.order_code);
  await page.getByRole("button", { name: "ເປີດອໍເດີ", exact: true }).click();
  picker = page.locator("[data-transport-branch-picker]");
  await picker.waitFor();
  assert.equal(
    await picker.getByLabel("ຝາກຂົນສົ່ງ", { exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await picker.getByLabel("ເມືອງ", { exact: true }).isDisabled(),
    true,
  );
  note = {
    ...note,
    branch: "ສາຂາຈອມແຈ້ງ(ເມືອງລອງ)",
    branch_code: "FCS-0310-PM",
    city: "ລອງ",
    province: "ຫຼວງນ້ຳທາ",
  };
  await context.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("http://localhost:3000/shipments/notes", {
    waitUntil: "networkidle",
  });
  await page.locator('tbody input[type="checkbox"]').first().check();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: /^ເປີດພິມ/ }).click();
  const popup = await popupPromise;
  await popup.locator(".note .details").waitFor();
  await popup.evaluate(() => document.fonts.ready);
  const printLines = await popup
    .locator(".note .details > div")
    .allTextContents();
  const branchIndex = printLines.findIndex((line) =>
    line.startsWith("ຝາກສາຂາ:"),
  );
  assert.ok(printLines[branchIndex + 1].includes("ລະຫັດສາຂາ: FCS-0310-PM"));
  assert.equal(await popup.locator(".barcode-wrap svg").count(), 1);
  assert.ok(
    await popup.evaluate(
      () =>
        document.querySelector(".barcode-wrap").getBoundingClientRect()
          .bottom <=
        document.querySelector(".note").getBoundingClientRect().bottom,
    ),
    "The new line must not clip the printed barcode",
  );
  await popup
    .locator(".note")
    .screenshot({ path: "/tmp/bgsport-printed-branch-code.png" });
  await popup.close();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "legacy address preservation",
        "carrier search and filtering",
        "automatic location",
        "saved note snapshot",
        "carrier switch",
        "API failure and retry",
        "Mixay manual",
        "mobile layout",
        "shipment linked note",
        "submitted lock",
        "branch-code persistence, preview ordering and reload",
        "printed branch code and barcode fit",
        "missing migration aborts before any writes",
        "first typed recipient survives dirty guard and carrier changes",
      ],
      mockWrites: writes.length,
      apiCalls,
    }),
  );
} finally {
  await browser.close();
}
