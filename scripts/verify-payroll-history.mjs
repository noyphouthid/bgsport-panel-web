// Isolated PostgreSQL checks. No production credentials or connections.
// node scripts/verify-payroll-history.mjs /path/to/@electric-sql/pglite/dist/index.js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.argv[2] || "@electric-sql/pglite");
const db = new PGlite();
let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  create function auth.jwt() returns jsonb language sql stable as
    'select coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb';
  grant usage on schema auth to anon, authenticated;
  create table public.users(id uuid primary key default gen_random_uuid(), auth_user_id uuid, full_name text,
    email text, role text, is_active boolean, permission_settings jsonb default '{}');
`);
await db.exec(await readFile(new URL("../supabase/migrations/20260331_create_payroll_employees.sql", import.meta.url), "utf8"));
const migration = await readFile(new URL("../supabase/migrations/20261015_create_payroll_month_history.sql", import.meta.url), "utf8");
await db.exec(migration);
await db.exec(migration);
checks += 1;
const manager = "00000000-0000-4000-8000-000000000001";
const accountant = "00000000-0000-4000-8000-000000000002";
const staff = "00000000-0000-4000-8000-000000000003";
await db.query("insert into public.users(auth_user_id,full_name,email,role,is_active) values ($1,'Manager','manager@test.invalid','manager',true),($2,'Accountant','accountant@test.invalid','accountant',true),($3,'Staff','staff@test.invalid','staff',true)", [manager, accountant, staff]);
const employee = {
  id: "11111111-1111-4111-8111-111111111111", employee_code: "PT01", full_name: "Employee One", department: "Production", position: "Staff",
  working_days: 26, overtime_hours: 1.5, base_salary: 3990000, overtime_rate: 19183,
  attendance_bonus: 50000, commission: 10000, allowance: 20000,
  late_penalty: 1000, leave_penalty: 2000, social_security: 3000, tax: 4000, other_deduction: 5000, is_active: true,
};
async function as(role, subject, sql, params = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [subject || ""]);
  await db.exec(`set role ${role}`);
  return db.query(sql, params);
}
const manage = (sql, params = []) => as("authenticated", manager, sql, params);
const save = (month, rows) => manage("select public.save_payroll_month_employees($1,$2::jsonb)", [month, JSON.stringify(rows)]);
const month = async (key) => (await manage("select * from public.payroll_months where month_key=$1", [key])).rows[0];
async function close(key, date = `${key}-28`, expected) {
  return manage("select public.close_payroll_month($1,$2::date,$3::jsonb) as id", [key, date, JSON.stringify(expected ?? (await month(key)).draft_employees)]);
}
async function denied(role, subject, sql, params = []) {
  await assert.rejects(as(role, subject, sql, params)); checks += 1;
}

await save("2026-10", [employee, { ...employee, id: "22222222-2222-4222-8222-222222222222", employee_code: "INACTIVE", full_name: "Inactive Employee", is_active: false }]);
check((await month("2026-10")).status, "draft", "Draft persists in the database");
await close("2026-10", "2026-11-02");
const first = (await manage("select * from public.payroll_runs where month_key='2026-10'")).rows[0];
check(first.employee_count, 1, "Close includes active employees only");
check(first.payment_date.toISOString().slice(0, 10), "2026-11-02", "Payment date is separate from the salary month");
check(first.closed_by_name, "Manager", "Closing actor is derived from authentication");
check(first.entries[0].overtimePay, 28774.5, "SQL calculates fractional OT");
check(first.entries[0].netSalary, 4083774.5, "SQL snapshot includes all income and deductions");
check(first.entries[0].paymentStatus, "reviewing", "Review status is frozen");
check(Number(first.net_salary), 4083774.5, "Run total matches its employee entries");
check((await month("2026-10")).status, "closed", "Closed status survives a new read");
await denied("authenticated", manager, "select public.close_payroll_month('2026-10','2026-11-02',$1::jsonb)", [JSON.stringify((await month("2026-10")).draft_employees)]);
await assert.rejects(save("2026-10", [{ ...employee, base_salary: 999 }])); checks += 1;
await denied("authenticated", manager, "select public.remove_payroll_month_employee('2026-10',$1)", [employee.id]);

await save("2026-11", [{ ...employee, base_salary: 5000000, overtime_hours: 10 }]);
check((await month("2026-10")).draft_employees.find((row) => row.id === employee.id).base_salary, 3990000, "Another month cannot alter October's draft");
await close("2026-11");
const november = (await manage("select * from public.payroll_runs where month_key='2026-11'")).rows[0];
check(november.entries[0].netSalary, 5256830, "November records its own salary and OT");
check((await manage("select entries from public.payroll_runs where id=$1", [first.id])).rows[0].entries, first.entries, "October snapshot stays unchanged after template updates");

await manage("select public.reopen_payroll_month('2026-10')");
check((await month("2026-10")).status, "draft", "Reopening is persisted");
check((await manage("select count(*)::int as count from public.payroll_runs where month_key='2026-10'")).rows[0].count, 1, "Reopening keeps the previous run");
await save("2026-10", [{ ...employee, base_salary: 4000000 }]);
await close("2026-10");
const revisions = (await manage("select * from public.payroll_runs where month_key='2026-10' order by revision")).rows;
check(revisions.map((run) => run.revision), [1, 2], "Reclosing creates a second immutable revision");
check(revisions[0].entries, first.entries, "First revision remains byte-for-byte equivalent");
check(revisions[1].entries[0].base_salary, 4000000, "Second revision captures corrected pay");
await save("2026-12", [{ ...employee, base_salary: 6000000 }]);
await manage("select public.remove_payroll_month_employee('2026-12',$1)", [employee.id]);
check((await manage("select entries from public.payroll_runs where id=$1", [first.id])).rows[0].entries, first.entries, "Deleting an employee preserves past names, rates and totals");

// A failed import is atomic, including employee template writes.
await assert.rejects(save("2027-01", [employee, { ...employee, id: "33333333-3333-4333-8333-333333333333", employee_code: "INVALID", base_salary: -1 }])); checks += 1;
check(await month("2027-01"), undefined, "Invalid batch rolls back month creation");
check((await manage("select count(*)::int as count from public.payroll_employees where id=$1", [employee.id])).rows[0].count, 0, "Invalid batch rolls back earlier rows");
await denied("authenticated", manager, "select public.save_payroll_month_employees('2027-13',$1)", [JSON.stringify([employee])]);
await save("2027-02", [employee]);
await denied("authenticated", manager, "select public.close_payroll_month('2027-02','2027-02-28','[]')");
check((await month("2027-02")).status, "draft", "Stale preview cannot close newer data");
await manage("select public.remove_payroll_month_employee('2027-02',$1)", [employee.id]);
await denied("authenticated", manager, "select public.close_payroll_month('2027-02','2027-02-28',$1)", [JSON.stringify((await month("2027-02")).draft_employees)]);

await denied("anon", null, "select * from public.payroll_runs");
check((await as("authenticated", staff, "select * from public.payroll_runs")).rows.length, 0, "Nonfinancial staff cannot read salary history");
await denied("authenticated", staff, "select public.reopen_payroll_month('2026-10')");
await denied("authenticated", manager, "update public.payroll_runs set entries='[]'");
await denied("authenticated", manager, "delete from public.payroll_runs");
await denied("authenticated", manager, "update public.payroll_months set status='draft'");
check((await as("authenticated", accountant, "select * from public.payroll_runs where month_key='2026-10'")).rows.length, 2, "Accountant can read payroll history");
await as("postgres", null, "update public.users set permission_settings='{\"access\":{\"/payroll\":\"deny\"}}' where auth_user_id=$1", [manager]);
await denied("authenticated", manager, "select public.reopen_payroll_month('2026-10')");
await as("postgres", null, "update public.users set is_active=false where auth_user_id=$1", [accountant]);
check((await as("authenticated", accountant, "select * from public.payroll_runs")).rows.length, 0, "Inactive account cannot read payroll history");
console.log(`Payroll PostgreSQL verification passed: ${checks} checks`);
await db.close();
