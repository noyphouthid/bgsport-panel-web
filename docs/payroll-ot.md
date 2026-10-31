# Payroll and OT

Open `/payroll`, select **ເລືອກ CSV**, and choose `OT M10.csv`. Review the rows, enter the total OT hours, and select **ບັນທຶກ** to save. The original file contains three employees and hourly rates, with no OT hours; the importer ignores its trailing empty rows.

The importer accepts UTF-8 CSV with these headers, in any order:

| CSV header | Payroll field |
| --- | --- |
| ລະຫັດ | Employee code; matches existing employees |
| ຊື່ພະນັກງານ | Full name |
| ເງິນເດືອນ (₭) | Base salary |
| OT/ຊົ່ວໂມງ (₭) | Hourly OT rate |
| ເງິນເພີ່ມ (₭) | Allowance |
| ເງິນຫັກ (₭) | Other deduction |
| ຊົ່ວໂມງ OT (optional) | Total OT hours |

Quoted amounts such as `"3,990,000"` are supported. Numbers must be nonnegative with at most two decimal places. Duplicate codes, missing columns, invalid numbers, and malformed rows stop the import before saving. A sample CSV is available through **ໄຟລ໌ຕົວຢ່າງ**.

Existing employees retain their ID, department, position, working days, active status, and benefits/deductions absent from the CSV. If hours are absent, existing hours are retained and new employees start at zero. Editing hours in the preview overrides that value; entering zero explicitly resets it. The displayed net amount includes existing benefits and deductions.

OT pay = total hours × the supplied hourly rate. For example, 1 hour 30 minutes is entered as `1.5`. Net salary = base salary + OT + attendance bonus + commission + allowance − all deductions. Draft calculations round money to two decimal places. Closing a month stores the employee inputs and calculated totals for historical reports.

The payroll table supports search, Excel export, editing, and A5 payslips with the OT formula. The payroll report's Excel/PDF/print exports also include the hourly rate, hours, and OT amount.

Monthly drafts and immutable closing revisions use `payroll_months` and `payroll_runs` from migration `20261015_create_payroll_month_history.sql`; `payroll_employees` supplies templates for new months. Importing updates the selected month's draft and employee templates. It does not record a payment or close a payroll period.

The income/expense report uses the latest closing revision of each currently closed month. Each employee expense uses the stored net salary and recorded payment date, even when the salary month differs from the payment month. Date ranges can include payments from multiple salary months. Changes to employee templates, deactivation, or deletion cannot change these historical expenses. Reopening a month temporarily excludes its payroll expenses until it is closed again; reclosing replaces the previous revision in the income/expense report without counting both. Manually entered staff expenses remain separate entries and are added to automatic payroll expenses.

Validation (Node.js 22.6+ with TypeScript stripping):

```sh
node --experimental-strip-types --test tests/payroll.test.mjs
node --experimental-strip-types --test tests/payroll-expenses.test.mjs tests/report-query.test.mjs
npm run build
```

The tests cover the supplied CSV format, optional hours, preservation of existing fields, invalid input, fractional OT, rounding, payment review status, and payroll expense history, revisions, payment dates and pagination. Live Supabase writes are not exercised by these tests.

With a local server running, `node scripts/verify-browser-payroll-expenses.mjs /path/to/playwright/test.mjs` checks summary totals, custom date ranges, Excel export, revisions, reopening, and query errors using mocked backend responses in Vientiane and Los Angeles timezones. Set `TEST_BASE_URL` to use a port other than 3000.
