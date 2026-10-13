import assert from "node:assert/strict";
import test from "node:test";
import { calculatePayroll } from "../lib/payroll-demo.ts";
import { buildPayrollImportPayload, parsePayrollCsv, payrollCsvHeaders } from "../lib/payroll-csv.ts";

const header = payrollCsvHeaders.join(",");
const csv = (rows, extraHeader = "") => `${header}${extraHeader}\r\n${rows}\r\n`;
const employee = (overrides = {}) => ({
  id: "existing-id", employee_code: "PT01", full_name: "Test", department: "Production", position: "Staff",
  working_days: 26, overtime_hours: 1.5, base_salary: 3990000, overtime_rate: 19183,
  attendance_bonus: 0, commission: 0, allowance: 0, late_penalty: 0, leave_penalty: 0,
  social_security: 0, tax: 0, other_deduction: 0, is_active: true, ...overrides,
});

test("imports the OT M10 format: BOM, CRLF, quoted thousands, trailing empty rows", () => {
  const rows = parsePayrollCsv(`\uFEFF${csv('PT01,Test,"3,990,000","19,183.00",0.00,0.00\r\nPT02,Second,"4,500,000","21,635.00",0,0\r\nGP01,Third,"4,650,000","22,356.00",0,0\r\n,,,,,\r\n,,,,,')}`);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.overtime_rate), [19183, 21635, 22356]);
  assert.equal(rows[0].base_salary, 3990000);
  assert.equal(rows[0].overtime_hours, undefined);
});

test("keeps codes with leading zeros and quoted names", () => {
  const rows = parsePayrollCsv(csv('001,"Test, ""Name""",1000,10,0,0'));
  assert.equal(rows[0].employee_code, "001");
  assert.equal(rows[0].full_name, 'Test, "Name"');
});

test("accepts an optional hours column and reordered columns", () => {
  const rows = parsePayrollCsv(csv("PT01,Test,1000,10,20,5,1.5", ",ຊົ່ວໂມງ OT"));
  assert.equal(rows[0].overtime_hours, 1.5);
  const fields = [...payrollCsvHeaders].reverse();
  const reversed = parsePayrollCsv(`${fields.join(",")}\n5,20,10,1000,Test,PT01`);
  assert.equal(reversed[0].base_salary, 1000);
});

test("rejects duplicates, missing headers, empty files and incomplete employee rows", () => {
  assert.throws(() => parsePayrollCsv(csv("PT01,Test,1000,10,0,0\nPT01,Other,1000,10,0,0")), /PT01/);
  assert.throws(() => parsePayrollCsv("code,name\nPT01,Test"), /ຂາດຖັນ/);
  assert.throws(() => parsePayrollCsv(csv(",,,,,")), /ບໍ່ມີຂໍ້ມູນ/);
  assert.throws(() => parsePayrollCsv(csv("PT01,,1000,10,0,0")), /ແຖວ 2/);
});

test("rejects malformed money, negative amounts, overflows and invalid CSV quoting", () => {
  for (const value of ["-1", "NaN", "Infinity", "1abc", "1.234", '"1,23"', "1000000000000", ""]) {
    assert.throws(() => parsePayrollCsv(csv(`PT01,Test,${value},10,0,0`)), /ແຖວ 2/);
  }
  assert.throws(() => parsePayrollCsv(csv('PT01,"Test,1000,10,0,0')), /CSV/);
  assert.throws(() => parsePayrollCsv(csv('PT01,"Test"extra,1000,10,0,0')), /CSV/);
  assert.throws(() => parsePayrollCsv(csv("PT01,Test,1000,10,0,0,unexpected")), /ແຖວ 2/);
});

test("preserves existing benefits, deductions, OT hours and inactive status", () => {
  const [row] = parsePayrollCsv(csv("PT01,Updated,3990000,19183,20000,5000"));
  const payload = buildPayrollImportPayload(row, employee({ attendance_bonus: 50000, commission: 10000, tax: 1000, is_active: false }));
  assert.equal(payload.department, "Production");
  assert.equal(payload.overtime_hours, 1.5);
  assert.equal(payload.attendance_bonus, 50000);
  assert.equal(payload.commission, 10000);
  assert.equal(payload.tax, 1000);
  assert.equal(payload.allowance, 20000);
  assert.equal(payload.other_deduction, 5000);
  assert.equal(payload.is_active, false);
  assert.equal(payload.full_name, "Updated");
});

test("new employees start with zero hours; an explicit zero resets existing hours", () => {
  const [row] = parsePayrollCsv(csv("PT01,Test,3990000,19183,0,0"));
  assert.equal(buildPayrollImportPayload(row).overtime_hours, 0);
  assert.equal(buildPayrollImportPayload({ ...row, overtime_hours: 0 }, employee()).overtime_hours, 0);
});

test("calculates fractional OT hours and all benefits and deductions consistently", () => {
  const result = calculatePayroll(employee({ allowance: 20000, attendance_bonus: 50000, commission: 10000,
    late_penalty: 1000, leave_penalty: 2000, social_security: 3000, tax: 4000, other_deduction: 5000 }));
  assert.equal(result.overtimePay, 28774.5);
  assert.equal(result.grossIncome, 4098774.5);
  assert.equal(result.totalDeduction, 15000);
  assert.equal(result.netSalary, 4083774.5);
});

test("rounds money to two decimals without floating point artifacts", () => {
  const result = calculatePayroll(employee({ base_salary: 0.1, overtime_hours: 0.1, overtime_rate: 0.2, allowance: 0.2, other_deduction: 0.1 }));
  assert.equal(result.overtimePay, 0.02);
  assert.equal(result.grossIncome, 0.32);
  assert.equal(result.netSalary, 0.22);
});

test("preserves review and hold status calculations", () => {
  assert.equal(calculatePayroll(employee()).paymentStatus, "ready");
  assert.equal(calculatePayroll(employee({ late_penalty: 60000 })).paymentStatus, "reviewing");
  assert.equal(calculatePayroll(employee({ leave_penalty: 1 })).paymentStatus, "reviewing");
  assert.equal(calculatePayroll(employee({ is_active: false })).paymentStatus, "hold");
});
