"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { calculatePayroll, formatKip, type PayrollEmployee } from "@/lib/payroll-demo";
import { buildPayrollImportPayload, parsePayrollCsv, payrollCsvHeaders, type PayrollCsvRow } from "@/lib/payroll-csv";

export function PayrollCsvImport({ employees, disabled, onImport }: {
  employees: PayrollEmployee[];
  disabled: boolean;
  onImport: (rows: PayrollCsvRow[]) => Promise<boolean>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PayrollCsvRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = disabled || reading || saving;
  const employeeByCode = new Map(employees.map((employee) => [employee.employee_code, employee]));
  const updateCount = rows.filter((row) => employeeByCode.has(row.employee_code)).length;
  const previews = rows.map((row) => calculatePayroll({
    id: row.employee_code, ...buildPayrollImportPayload(row, employeeByCode.get(row.employee_code)),
  }));

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setRows([]);
    setFileName(file.name);
    setError(null);
    setReading(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("ກະລຸນາເລືອກ CSV ຂະໜາດບໍ່ເກີນ 2 MB");
      setRows(parsePayrollCsv(await file.text()));
    } catch (error) {
      setError(error instanceof Error ? error.message : "ອ່ານ CSV ບໍ່ສຳເລັດ");
    } finally {
      setReading(false);
    }
  };

  const downloadTemplate = () => {
    const csv = `\uFEFF${[...payrollCsvHeaders, "ຊົ່ວໂມງ OT"].join(",")}\r\nEMP-001,ພະນັກງານຕົວຢ່າງ,3990000,19183,0,0,0\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "payroll-ot-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (await onImport(rows)) { setRows([]); setFileName(""); }
    } catch (error) {
      setError(error instanceof Error ? error.message : "ນຳເຂົ້າບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="no-print overflow-hidden rounded-[28px] border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><FileSpreadsheet size={22} /></div>
          <div>
            <h2 className="text-lg font-black text-slate-900">ນຳເຂົ້າເງິນເດືອນ ແລະ OT ຈາກ CSV</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">ເລືອກໄຟລ໌ OT M10.csv, ກວດຂໍ້ມູນ ແລະປ້ອນຊົ່ວໂມງ OT ກ່ອນບັນທຶກ</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadTemplate} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-50"><Download size={16} />ໄຟລ໌ຕົວຢ່າງ</button>
          <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event)} className="hidden" aria-label="ເລືອກໄຟລ໌ CSV" disabled={busy} />
          <button onClick={() => fileInput.current?.click()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"><Upload size={16} />{reading ? "ກຳລັງອ່ານ..." : "ເລືອກ CSV"}</button>
        </div>
      </div>
      {error && <div role="alert" className="mx-6 mb-5 rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{fileName}: {error}</div>}
      {rows.length > 0 && <>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <div className="min-w-0 text-sm"><p className="truncate font-black text-slate-800">{fileName}</p><p className="mt-1 text-slate-500">ເພີ່ມໃໝ່ {rows.length - updateCount} ຄົນ · ອັບເດດ {updateCount} ຄົນ ຕາມລະຫັດ</p></div>
          <button aria-label="ປິດຕົວຢ່າງ CSV" disabled={saving} onClick={() => { setRows([]); setFileName(""); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 disabled:opacity-50"><X size={18} /></button>
        </div>
        <div className="max-h-[440px] overflow-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr>
              {["ພະນັກງານ", "ເງິນເດືອນ", "OT / ຊົ່ວໂມງ", "ຊົ່ວໂມງ OT", "ເງິນ OT", "ເງິນເພີ່ມ", "ເງິນຫັກ", "ຮັບສຸດທິ"].map((label) => <th key={label} className="px-5 py-3 font-bold">{label}</th>)}
            </tr></thead>
            <tbody>{previews.map((employee, index) => <tr key={employee.employee_code} className="border-t border-slate-100">
              <td className="px-5 py-3"><div className="font-bold text-slate-900">{employee.full_name}</div><div className="mt-1 text-xs text-slate-500">{employee.employee_code} · {employeeByCode.has(employee.employee_code) ? "ອັບເດດ" : "ໃໝ່"}</div></td>
              <td className="px-5 py-3 text-slate-700">{formatKip(employee.base_salary)}</td>
              <td className="px-5 py-3 text-slate-700">{formatKip(employee.overtime_rate)}</td>
              <td className="px-5 py-3"><input type="number" min="0" max="99999999.99" step="0.01" aria-label={`ຊົ່ວໂມງ OT ${employee.full_name}`} value={employee.overtime_hours} disabled={saving} onChange={(event) => {
                const hours = Number(event.target.value);
                if (!Number.isFinite(hours) || hours < 0 || hours > 99999999.99) return;
                setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, overtime_hours: Math.round(hours * 100) / 100 } : row));
              }} className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" /></td>
              <td className="px-5 py-3 font-bold text-emerald-700">{formatKip(employee.overtimePay)}</td>
              <td className="px-5 py-3 text-slate-700">{formatKip(employee.allowance)}</td>
              <td className="px-5 py-3 text-rose-600">{formatKip(employee.other_deduction)}</td>
              <td className="px-5 py-3 font-black text-slate-900">{formatKip(employee.netSalary)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="flex flex-col gap-4 border-t border-slate-100 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="text-xs leading-6 text-slate-500">
            <p>ເງິນເພີ່ມ → ຄ່າຊ່ວຍເຫຼືອ · ເງິນຫັກ → ລາຍການຫັກອື່ນ</p>
            <p>ລາຍການອື່ນທີ່ບໍ່ມີໃນ CSV ໃຊ້ຄ່າເດີມ. ຍອດສຸດທິລວມລາຍການເດີມຂອງພະນັກງານ.</p>
            <p>ຖ້າ CSV ບໍ່ມີຊົ່ວໂມງ OT: ພະນັກງານເກົ່າໃຊ້ຄ່າເດີມ, ພະນັກງານໃໝ່ເລີ່ມທີ່ 0.</p>
          </div>
          <button onClick={() => void save()} disabled={busy} className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? "ກຳລັງບັນທຶກ..." : `ບັນທຶກ ${rows.length} ຄົນ`}</button>
        </div>
      </>}
    </section>
  );
}
