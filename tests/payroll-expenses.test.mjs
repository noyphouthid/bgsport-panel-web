import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as reportQuery from "../lib/report-query.ts";

const { outputText } = ts.transpileModule(readFileSync(new URL("../lib/payroll-expenses.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const compiled = { exports: {} };
new Function("require", "module", "exports", outputText)(name => {
  assert.equal(name, "@/lib/report-query");
  return reportQuery;
}, compiled, compiled.exports);
const { buildPayrollExpenseRows, fetchPayrollExpenseRuns } = compiled.exports;

const employee = { id: "employee-1", employee_code: "001", full_name: "Original Name", department: "Production",
  base_salary: 9000000, overtime_hours: 99, is_active: false, netSalary: 4083774.5 };
const run = (overrides = {}) => ({ id: "run-oct-1", month_key: "2026-10", revision: 1, payment_date: "2026-11-02",
  closed_by_name: "Accountant", entries: [{ ...employee }], payroll_months: { status: "closed" }, ...overrides });
const inRange = (rows, from, to) => rows.filter(row => {
  const date = new Date(row.occurredAt);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return day >= from && day <= to;
});

test("expenses use frozen net pay and employee details, even for a now inactive/deleted employee", () => {
  const snapshot = run();
  const original = structuredClone(snapshot);
  const [row] = buildPayrollExpenseRows([snapshot]);
  assert.equal(row.amount, 4083774.5); // Must not recalculate from salary/OT inputs.
  assert.equal(row.title, "ເງິນເດືອນ Original Name");
  assert.equal(row.referenceCode, "001");
  assert.equal(row.createdByName, "Accountant");
  assert.equal(row.entryType, "expense");
  assert.equal(row.source, "payroll");
  assert.equal(row.isManual, false);
  assert.deepEqual(snapshot, original);
});

test("unclosed and reopened months do not generate payroll expenses", () => {
  assert.deepEqual(buildPayrollExpenseRows([]), []);
  assert.deepEqual(buildPayrollExpenseRows([run({ payroll_months: { status: "draft" } })]), []);
});

test("multiple salary months are counted on their actual payment dates across year boundaries", () => {
  const rows = buildPayrollExpenseRows([
    run(),
    run({ id: "run-nov", month_key: "2026-11", payment_date: "2026-12-03" }),
    run({ id: "run-dec", month_key: "2026-12", payment_date: "2027-01-04" }),
  ]);
  assert.equal(inRange(rows, "2026-10-01", "2026-10-31").length, 0);
  assert.equal(inRange(rows, "2026-11-02", "2026-11-02").length, 1);
  assert.equal(inRange(rows, "2026-11-01", "2026-12-31").length, 2);
  assert.equal(inRange(rows, "2026-11-01", "2027-01-31").length, 3);
  assert.equal(new Set(rows.map(row => row.id)).size, 3);
});

test("only the latest revision counts, before date filtering, even if payment moves months", () => {
  const corrected = run({ id: "run-oct-2", revision: 2, payment_date: "2026-12-01",
    entries: [{ ...employee, netSalary: 4200000 }] });
  for (const runs of [[run(), corrected], [corrected, run()]]) {
    const rows = buildPayrollExpenseRows(runs);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount, 4200000);
    assert.equal(inRange(rows, "2026-11-01", "2026-11-30").length, 0);
    assert.equal(inRange(rows, "2026-12-01", "2026-12-31").length, 1);
  }
});

test("employee expenses preserve the stored sum, including fractional, zero and negative net pay", () => {
  const amounts = [4083774.5, 0, -100.25];
  const rows = buildPayrollExpenseRows([run({ entries: amounts.map((netSalary, i) => ({ ...employee, id: `employee-${i}`, netSalary })) })]);
  assert.deepEqual(rows.map(row => row.amount), amounts);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 4083674.25);
});

function mockClient(runs, failureAt) {
  const pages = [];
  const client = { from(table) {
    assert.equal(table, "payroll_runs");
    let from = 0, to = Infinity, onlyClosed = false;
    const query = {
      select(fields) { assert.ok(fields.includes("payroll_months!inner(status)")); return query; },
      eq(field, value) { assert.equal(field, "payroll_months.status"); assert.equal(value, "closed"); onlyClosed = true; return query; },
      order() { return query; },
      range(start, end) { from = start; to = end; pages.push([from, to]); return query; },
      overrideTypes() { return query; },
      then(resolve) {
        const data = runs.filter(row => !onlyClosed || row.payroll_months.status === "closed").slice(from, to + 1);
        return Promise.resolve(from === failureAt
          ? { data: null, error: { message: "Payroll read failed" } }
          : { data, error: null }).then(resolve);
      },
    };
    return query;
  } };
  return { client, pages };
}

test("history queries fetch every page and exclude drafts without reading employee templates", async () => {
  const runs = Array.from({ length: 1001 }, (_, i) => run({ id: `run-${i}`, revision: i + 1 }));
  runs.push(run({ payroll_months: { status: "draft" } }));
  const { client, pages } = mockClient(runs);
  const result = await fetchPayrollExpenseRuns(client);
  assert.equal(result.error, null);
  assert.equal(result.data.length, 1001);
  assert.deepEqual(pages, [[0, 499], [500, 999], [1000, 1499]]);
  assert.equal(buildPayrollExpenseRows(result.data).length, 1);
});

test("a failed later history page returns an error instead of a partial payroll total", async () => {
  const { client } = mockClient(Array.from({ length: 501 }, () => run()), 500);
  const result = await fetchPayrollExpenseRuns(client);
  assert.equal(result.data, null);
  assert.equal(result.error.message, "Payroll read failed");
});
