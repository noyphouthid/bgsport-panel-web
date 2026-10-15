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
const { mapTransportNoteToForm, getTransportNotePrintHtml } = compile(
  "../lib/transport-notes.ts",
);
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
