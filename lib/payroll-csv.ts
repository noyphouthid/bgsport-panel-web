import type { PayrollEmployee } from "@/lib/payroll-demo";

export const payrollCsvHeaders = [
  "ລະຫັດ", "ຊື່ພະນັກງານ", "ເງິນເດືອນ (₭)", "OT/ຊົ່ວໂມງ (₭)",
  "ເງິນເພີ່ມ (₭)", "ເງິນຫັກ (₭)",
] as const;

export type PayrollCsvRow = Pick<PayrollEmployee,
  "employee_code" | "full_name" | "base_salary" | "overtime_rate" | "allowance" | "other_deduction"
> & { overtime_hours?: number };

// Keep quoted commas, escaped quotes and embedded line breaks intact.
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else cell += char;
    } else if (char === "," || char === "\n" || char === "\r") {
      row.push(cell.trim());
      cell = "";
      closedQuote = false;
      if (char !== ",") {
        rows.push(row);
        row = [];
        if (char === "\r" && input[index + 1] === "\n") index += 1;
      }
    } else if (char === '"') {
      if (cell.trim() || closedQuote) throw new Error("CSV: ເຄື່ອງໝາຍຄຳເວົ້າບໍ່ຖືກຕ້ອງ");
      cell = "";
      quoted = true;
    } else {
      if (closedQuote && char.trim()) throw new Error("CSV: ຂໍ້ມູນຫຼັງເຄື່ອງໝາຍຄຳເວົ້າບໍ່ຖືກຕ້ອງ");
      cell += char;
    }
  }
  if (quoted) throw new Error("CSV: ເຄື່ອງໝາຍຄຳເວົ້າບໍ່ຄົບ");
  if (cell || row.length) rows.push([...row, cell.trim()]);
  return rows;
}

export function parsePayrollCsv(text: string): PayrollCsvRow[] {
  const rows = readCsv(text);
  const headerIndex = rows.findIndex((row) => row.some(Boolean));
  const headers = rows[headerIndex] ?? [];
  if (new Set(headers).size !== headers.length) throw new Error("CSV: ຫົວຖັນຊ້ຳກັນ");
  const missing = payrollCsvHeaders.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`CSV: ຂາດຖັນ ${missing.join(", ")}`);
  const codes = new Set<string>();
  const output: PayrollCsvRow[] = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some(Boolean)) continue;
    const fail = (message: string): never => { throw new Error(`CSV ແຖວ ${index + 1}: ${message}`); };
    if (row.length !== headers.length) fail("ຈຳນວນຖັນບໍ່ກົງກັບຫົວຕາຕະລາງ");
    const get = (header: string) => row[headers.indexOf(header)] ?? "";
    const employee_code = get(payrollCsvHeaders[0]);
    const full_name = get(payrollCsvHeaders[1]);
    if (!employee_code || !full_name) fail("ຕ້ອງມີລະຫັດ ແລະຊື່ພະນັກງານ");
    if (codes.has(employee_code)) fail(`ລະຫັດ ${employee_code} ຊ້ຳກັນ`);
    codes.add(employee_code);
    const number = (header: string, maximum = 999999999999.99) => {
      const value = get(header);
      if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) {
        fail(`${header}: ຕ້ອງເປັນຕົວເລກບໍ່ຕິດລົບ ແລະທົດສະນິຍົມບໍ່ເກີນ 2 ຕຳແໜ່ງ`);
      }
      const amount = Number(value.replaceAll(",", ""));
      if (!Number.isFinite(amount) || amount > maximum) fail(`${header}: ຈຳນວນສູງເກີນກຳນົດ`);
      return amount;
    };
    output.push({
      employee_code, full_name,
      base_salary: number(payrollCsvHeaders[2]),
      overtime_rate: number(payrollCsvHeaders[3]),
      allowance: number(payrollCsvHeaders[4]),
      other_deduction: number(payrollCsvHeaders[5]),
      ...(headers.includes("ຊົ່ວໂມງ OT") ? { overtime_hours: number("ຊົ່ວໂມງ OT", 99999999.99) } : {}),
    });
  }
  if (!output.length) throw new Error("CSV: ບໍ່ມີຂໍ້ມູນພະນັກງານ");
  return output;
}

export function buildPayrollImportPayload(row: PayrollCsvRow, existing?: PayrollEmployee) {
  // Preserve fields absent from the CSV, including existing OT hours.
  return {
    employee_code: row.employee_code,
    full_name: row.full_name,
    department: existing?.department ?? "",
    position: existing?.position ?? "",
    working_days: existing?.working_days ?? 26,
    overtime_hours: row.overtime_hours ?? existing?.overtime_hours ?? 0,
    base_salary: row.base_salary,
    overtime_rate: row.overtime_rate,
    allowance: row.allowance,
    other_deduction: row.other_deduction,
    attendance_bonus: existing?.attendance_bonus ?? 0,
    commission: existing?.commission ?? 0,
    late_penalty: existing?.late_penalty ?? 0,
    leave_penalty: existing?.leave_penalty ?? 0,
    social_security: existing?.social_security ?? 0,
    tax: existing?.tax ?? 0,
    is_active: existing?.is_active ?? true,
  };
}
