import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeImportsByOrder,
  getImporterKey,
  getLocalPeriodRange,
  summarizeImportsByEmployee,
  UNNAMED_IMPORTER_LABEL,
} from "../lib/factory-import-report.ts";

const row = (orderId, receivedBy, receivedAt = "2026-11-02T03:00:00Z", shirts = 10, netTotal = 1000) => ({
  orderId,
  orderCode: `BG-${orderId}`,
  factoryBillCode: null,
  receivedAt,
  receivedBy,
  shirts,
  netTotal,
});

test("spacing and letter case do not split one employee's total", () => {
  assert.equal(getImporterKey("  Noy   Phouthid "), "noy phouthid");
  const [summary, ...rest] = summarizeImportsByEmployee([row("1", "Noy Phouthid"), row("2", " noy  phouthid ")]);
  assert.deepEqual(rest, []);
  assert.deepEqual(summary, { employeeKey: "noy phouthid", employeeName: "Noy Phouthid", ordersTotal: 2, shirtsTotal: 20, valueTotal: 2000 });
});

test("employees are ranked by imported order count", () => {
  const summaries = summarizeImportsByEmployee([row("1", "A", undefined, 500), row("2", "B"), row("3", "B")]);
  assert.deepEqual(summaries.map((item) => [item.employeeName, item.ordersTotal]), [["B", 2], ["A", 1]]);
});

test("a blank importer stays visible instead of disappearing from totals", () => {
  assert.equal(summarizeImportsByEmployee([row("1", "   ")])[0].employeeName, UNNAMED_IMPORTER_LABEL);
});

test("an order with several labels or receipts is credited once, to its earliest importer", () => {
  const rows = dedupeImportsByOrder([
    row("1", "Later", "2026-11-03T03:00:00Z"),
    row("1", "First", "2026-11-01T03:00:00Z"),
    row("2", "Other", "2026-11-02T03:00:00Z"),
  ]);
  assert.deepEqual(rows.map((item) => [item.orderId, item.receivedBy]), [["2", "Other"], ["1", "First"]]);
});

test("period boundaries use local time, so early-morning imports stay in their own month", () => {
  const previousTz = process.env.TZ;
  process.env.TZ = "Asia/Vientiane";
  try {
    assert.deepEqual(getLocalPeriodRange(2026, 11), { start: "2026-10-31T17:00:00.000Z", endExclusive: "2026-11-30T17:00:00.000Z" });
    assert.deepEqual(getLocalPeriodRange(2026, 12).endExclusive, "2026-12-31T17:00:00.000Z");
    assert.deepEqual(getLocalPeriodRange(2026, "ALL"), { start: "2025-12-31T17:00:00.000Z", endExclusive: "2026-12-31T17:00:00.000Z" });
  } finally {
    process.env.TZ = previousTz;
  }
});
