import assert from "node:assert/strict";
import test from "node:test";
import { describeDepositFieldChange, formatDepositChangeValue, parseDepositFieldChanges } from "../lib/deposit-change-log.ts";

test("edits read as label: old → new in Lao", () => {
  const names = new Map([["u1", "Noy"], ["u2", "Phet"]]);
  assert.deepEqual(describeDepositFieldChange({ field: "short_qty", from: 20, to: 25 }), { label: "ຈຳນວນແຂນສັ້ນ", text: "20 → 25" });
  assert.equal(describeDepositFieldChange({ field: "net_total", from: 1500000, to: 1650000 }).text, "1,500,000 → 1,650,000");
  assert.equal(describeDepositFieldChange({ field: "delivery_date", from: "2026-11-18", to: null }).text, "18/11/2026 → -");
  assert.equal(describeDepositFieldChange({ field: "production_priority", from: "normal", to: "urgent" }).text, "ປົກກະຕິ → ດ່ວນ");
  assert.equal(describeDepositFieldChange({ field: "admin_user_id", from: "u1", to: "u2" }, names).text, "Noy → Phet");
  assert.deepEqual(describeDepositFieldChange({ field: "production_items" }), { label: "ລາຍການຜະລິດ (ໄຊສ໌ / ຊື່ / ເບີ / ຮູບ)", text: "ມີການປ່ຽນແປງ" });
});

test("unknown fields, long text and malformed records stay readable", () => {
  assert.equal(describeDepositFieldChange({ field: "new_column", from: "a", to: "b" }).label, "new_column");
  assert.ok(formatDepositChangeValue("notes", "x".repeat(200)).endsWith("…"));
  assert.deepEqual(parseDepositFieldChanges(null), []);
  assert.deepEqual(parseDepositFieldChanges([{ field: "notes", from: "a", to: "b" }, { nope: 1 }, "x"]), [{ field: "notes", from: "a", to: "b" }]);
});
