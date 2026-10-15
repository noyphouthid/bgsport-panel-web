import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFileSync } from "node:fs";
function compile(path) {
  const { outputText } = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  );
  const compiled = { exports: {} };
  new Function("module", "exports", outputText)(compiled, compiled.exports);
  return compiled.exports;
}
const {
  mapTransportNoteToForm,
  getTransportNotePrintHtml,
  isPassengerBusTransport,
  PASSENGER_BUS_TRANSPORTER,
} = compile("../lib/transport-notes.ts");
const { ensureTransportBranchCodeStorage } = compile(
  "../lib/transport-branch-code.ts",
);

test("saved codes load without guessing a code for legacy notes", () => {
  assert.equal(
    mapTransportNoteToForm({ branch_code: "FCS-0310-PM" }).branchCode,
    "FCS-0310-PM",
  );
  assert.equal(
    mapTransportNoteToForm({ branch: "Legacy branch" }).branchCode,
    "",
  );
});
test("print places branch code directly below the branch and escapes entered text", () => {
  const html = getTransportNotePrintHtml([
    {
      receiver_name: "QA",
      branch: "Branch",
      branch_code: '<img src=x onerror="alert(1)">',
      city: "City",
      transporters: [],
    },
  ]);
  const lines = html
    .split("\n")
    .filter((line) => line.trim().startsWith("<div>"));
  const index = lines.findIndex((line) => line.includes("ຝາກສາຂາ:"));
  assert.ok(lines[index + 1].includes("ລະຫັດສາຂາ:"));
  assert.ok(lines[index + 2].includes("ເມືອງ:"));
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.equal(html.includes("<img src=x"), false);
  assert.ok(
    getTransportNotePrintHtml([{ transporters: [] }]).includes(
      "ລະຫັດສາຂາ: <strong>-</strong>",
    ),
  );
});
test("shipment preflight checks both storage columns and rejects an unapplied migration", async () => {
  const checks = [];
  const client = {
    from(table) {
      return {
        select(column) {
          checks.push([table, column]);
          return {
            limit: async () => ({
              error:
                table === "transport_notes"
                  ? { code: "42703", message: "missing column" }
                  : null,
            }),
          };
        },
      };
    },
  };
  await assert.rejects(
    ensureTransportBranchCodeStorage(client, true),
    /20261017_add_transport_branch_code.sql/,
  );
  assert.deepEqual(checks, [
    ["transport_notes", "branch_code"],
    ["shipment_delivery_requests", "transport_branch_code"],
  ]);
  await ensureTransportBranchCodeStorage({
    from() {
      return {
        select() {
          return { limit: async () => ({ error: null }) };
        },
      };
    },
  });
});

test("passenger bus bills use drop-off fields, omit branch codes and preserve either charge mode", () => {
  assert.equal(isPassengerBusTransport([PASSENGER_BUS_TRANSPORTER]), true);
  assert.equal(
    isPassengerBusTransport([PASSENGER_BUS_TRANSPORTER, "HAL Logistic"]),
    false,
  );
  assert.equal(
    mapTransportNoteToForm({
      transporters: [PASSENGER_BUS_TRANSPORTER],
      branch_code: "OLD-CODE",
    }).branchCode,
    "",
  );
  for (const [mode, label] of [
    ["origin", "ຈ່າຍຕົ້ນທາງ"],
    ["destination", "ຈ່າຍປາຍທາງ"],
  ]) {
    const html = getTransportNotePrintHtml([
      {
        receiver_name: "RK26-9087",
        receiver_phone: "+856 20 98 034 103",
        branch: "ສະຖານີລົດ ເມືອງລອງ",
        branch_code: "OLD-CODE",
        city: "ລອງ",
        province: "ຫຼວງນ້ຳທາ",
        transporters: [PASSENGER_BUS_TRANSPORTER],
        shipping_charge_mode: mode,
      },
    ]);
    assert.ok(html.includes("ຝາກລົງ: <strong>ສະຖານີລົດ ເມືອງລອງ</strong>"));
    assert.ok(html.includes(`ຄ່າຂົນສົ່ງ: <strong>${label}</strong>`));
    assert.ok(html.includes("RK26-9087"));
    assert.ok(html.includes("+856 20 98 034 103"));
    assert.equal(html.includes("ລະຫັດສາຂາ:"), false);
    assert.equal(html.includes("OLD-CODE"), false);
    assert.equal(html.includes("ຝາກສາຂາ:"), false);
    assert.equal(html.includes("ຝາກຂົນສົ່ງ:"), false);
  }
});
