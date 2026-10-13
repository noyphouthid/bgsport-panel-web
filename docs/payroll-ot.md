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

OT pay = total hours × the supplied hourly rate. For example, 1 hour 30 minutes is entered as `1.5`. Net salary = base salary + OT + attendance bonus + commission + allowance − all deductions. Money is rounded to two decimal places using the shared calculation function, also used by payroll reports and the income/expense report.

The payroll table supports search, Excel export, editing, and A5 payslips with the OT formula. The payroll report's Excel/PDF/print exports also include the hourly rate, hours, and OT amount.

Storage uses the existing `payroll_employees` table; no new migration is required. The month selector labels the payslip/export. Records remain the current employee payroll settings rather than independent monthly records, matching the existing storage model. Importing updates those settings; it does not record a payment or close a payroll period.

Validation (Node.js 22.6+ with TypeScript stripping):

```sh
node --experimental-strip-types --test tests/payroll.test.mjs
npm run build
```

The tests cover the supplied CSV format, optional hours, preservation of existing fields, invalid input, fractional OT, rounding, and payment review status. Live Supabase writes are not exercised by these tests.
