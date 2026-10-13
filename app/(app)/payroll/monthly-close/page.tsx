"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CalendarRange, Lock, Unlock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { calculatePayroll, formatKip, payrollMonthOptions } from "@/lib/payroll-demo";

import { payrollHistoryError, payrollHistoryMonthOptions, payrollRunRows, payrollToday } from "@/lib/payroll-history";
import { usePayrollHistory, usePayrollMonth } from "@/lib/use-payroll-history";

const closeSteps = [
  "ກວດເວລາເຮັດວຽກ ແລະ ຂໍ້ມູນຂາດ-ລາ",
  "ກວດຄ່າ OT, ເບ້ຍຂະຫຍັນ ແລະ ຄອມມິດຊັນ",
  "ກວດລາຍການຫັກ ແລະ ລາຍການຄ້າງອະນຸມັດ",
  "ອອກໃບສະຫຼຸບ ແລະ ລັອກເດືອນ",
];

export default function PayrollMonthlyClosePage() {
  const [selectedMonth, setSelectedMonth] = usePayrollMonth();
  const history = usePayrollHistory(selectedMonth, undefined, true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(payrollToday);
  const locked = history.data?.period?.status === "closed";
  const loading = history.loading;
  const errorMessage = history.error || actionError;
  const monthOptions = payrollHistoryMonthOptions(payrollMonthOptions, history.periods, selectedMonth);
  const selectedMonthMeta = monthOptions.find((month) => month.value === selectedMonth) ?? payrollMonthOptions[0];

  const draftEmployees = history.data?.period?.draft_employees ?? history.data?.templates ?? [];
  const employeeRows = useMemo(() => !history.data ? [] : locked ? payrollRunRows(history.data.run)
    : draftEmployees.filter((employee) => employee.is_active).map(calculatePayroll), [history.data, locked, draftEmployees]);
  const summary = useMemo(() => employeeRows.reduce((acc, employee) => ({
    employeeCount: acc.employeeCount + 1, netSalary: acc.netSalary + employee.netSalary,
    totalDeduction: acc.totalDeduction + employee.totalDeduction,
  }), { employeeCount: 0, netSalary: 0, totalDeduction: 0 }), [employeeRows]);

  const handleCloseMonth = async () => {
    if (loading || saving || history.error || !history.data) return;
    if (!employeeRows.length) { toast.error("ຍັງບໍ່ມີພະນັກງານທີ່ເປີດໃຊ້"); return; }
    if (!paymentDate) { toast.error("ກະລຸນາເລືອກວັນຈ່າຍ"); return; }
    if (!window.confirm(`ປິດຍອດ ${selectedMonthMeta.label} ຈຳນວນ ${employeeRows.length} ຄົນ, ຮັບສຸດທິ ${formatKip(summary.netSalary)}? ລະບົບຈະເກັບສຳເນົາໄວ້ໃນລາຍງານ.`)) return;
    setSaving(true);
    setActionError(null);
    try {
      const { error } = await supabase.rpc("close_payroll_month", { p_month_key: selectedMonth, p_payment_date: paymentDate, p_expected_employees: draftEmployees });
      if (error) throw error;
      toast.success(`ບັນທຶກປິດຍອດ ${selectedMonthMeta.label} ແລ້ວ`);
      history.refresh();
    } catch (error) { setActionError(payrollHistoryError(error)); }
    finally { setSaving(false); }
  };
  const handleReopen = async () => {
    if (loading || saving || !locked) return;
    if (!window.confirm(`ເປີດ ${selectedMonthMeta.label} ເພື່ອແກ້ໄຂ? ສຳເນົາເກົ່າຈະຍັງຢູ່; ປິດຍອດຄັ້ງຕໍ່ໄປຈະສ້າງສຳເນົາໃໝ່.`)) return;
    setSaving(true);
    setActionError(null);
    try {
      const { error } = await supabase.rpc("reopen_payroll_month", { p_month_key: selectedMonth });
      if (error) throw error;
      toast.success("ເປີດເດືອນນີ້ອີກຄັ້ງແລ້ວ");
      history.refresh();
    } catch (error) { setActionError(payrollHistoryError(error)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ປິດຍອດເງິນເດືອນພະນັກງານ</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            ບັນທຶກວັນຈ່າຍ ແລະເກັບສຳເນົາເງິນເດືອນຂອງເດືອນນີ້ໄວ້ສຳລັບລາຍງານຍ້ອນຫຼັງ
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={selectedMonth}
            onChange={(event) => { setSelectedMonth(event.target.value); setActionError(null); }}
            disabled={saving}
            aria-label="ເດືອນເງິນເດືອນ"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-400"
          >
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>

          {locked ? (
            <button
              onClick={() => void handleReopen()}
              disabled={loading || saving || Boolean(history.error)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <Unlock size={16} />
              ເປີດເດືອນນີ້ອີກຄັ້ງ
            </button>
          ) : (
            <button
              onClick={() => void handleCloseMonth()}
              disabled={loading || saving || Boolean(history.error) || employeeRows.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800"
            >
              <Lock size={16} />
              {saving ? "ກຳລັງບັນທຶກ..." : "ຢືນຢັນປິດຍອດ"}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-sm font-bold text-slate-700">ວັນຈ່າຍ <input type="date" value={locked ? history.data?.run?.payment_date ?? "" : paymentDate} onChange={(event) => setPaymentDate(event.target.value)} disabled={locked || saving || loading} className="ml-3 rounded-xl border border-slate-200 px-3 py-2" /></label>
        <div className="flex gap-4 text-sm font-bold"><Link href={`/payroll?month=${selectedMonth}`} className="text-slate-700 hover:underline">ແກ້ໄຂເງິນເດືອນ</Link><Link href={`/reports/payroll?month=${selectedMonth}`} className="text-emerald-700 hover:underline">ເບິ່ງປະຫວັດລາຍເດືອນ</Link><button onClick={() => { setActionError(null); history.refresh(); }} disabled={saving} className="text-slate-600">ໂຫຼດຄືນ</button></div>
      </div>
      {history.data?.run && <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">ສຳເນົາ {history.data.run.revision} · ວັນຈ່າຍ {history.data.run.payment_date} · ປິດຍອດໂດຍ {history.data.run.closed_by_name}{!locked ? " · ເປີດແກ້ໄຂຢູ່; ສຳເນົາເກົ່າຍັງຢູ່ໃນລາຍງານ" : ""}</p>}

      {errorMessage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-500">ເງິນສຸດທິທັງເດືອນ</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{formatKip(summary.netSalary)}</div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-500">ລາຍການຫັກລວມ</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{formatKip(summary.totalDeduction)}</div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-500">ພະນັກງານທັງໝົດ</div>
          <div className="mt-2 text-2xl font-black text-emerald-700">{summary.employeeCount} ຄົນ</div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-500">ສະຖານະເດືອນ</div>
          <div className="mt-2 text-lg font-black text-slate-900">
            {loading ? "ກຳລັງໂຫຼດ..." : locked ? "ປິດຍອດແລ້ວ" : "ຍັງບໍ່ປິດຍອດ"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-100 p-3 text-blue-700">
                <CalendarRange size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">ແຜນງານກ່ອນປິດຍອດ</h2>
                <p className="text-sm font-medium text-slate-500">ເຮັດຄົບຕາມລາຍການນີ້ກ່ອນຢືນຢັນປິດເດືອນ</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {closeSteps.map((step, index) => (
                <div key={step} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">
                    {index + 1}
                  </div>
                  <div className="text-sm font-semibold text-slate-600">{step}</div>
                </div>
              ))}
            </div>
          </div>

        </div>

        <div className="rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">{locked ? "ລາຍການທີ່ປິດຍອດແລ້ວ" : "ລາຍການກ່ອນປິດເດືອນ"}</h2>
              <p className="text-sm font-medium text-slate-500">ກວດຄວາມພ້ອມຂອງພະນັກງານແຕ່ລະຄົນ</p>
            </div>
            <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
              {selectedMonthMeta.label}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold">ພະນັກງານ</th>
                  <th className="px-5 py-3 font-bold">ພະແນກ</th>
                  <th className="px-5 py-3 font-bold">ເງິນສຸດທິ</th>
                </tr>
              </thead>
              <tbody>
                {!loading && employeeRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-12 text-center text-sm font-bold text-slate-400">
                      ຍັງບໍ່ມີພະນັກງານທີ່ເປີດໃຊ້
                    </td>
                  </tr>
                ) : null}
                {employeeRows.map((employee) => (
                  <tr key={employee.id} className="border-t border-slate-100">
                    <td className="px-5 py-4">
                      <div className="font-black text-slate-900">{employee.full_name}</div>
                      <div className="text-xs font-semibold text-slate-500">{employee.employee_code}</div>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-600">{employee.department}</td>
                    <td className="px-5 py-4 font-black text-slate-900">{formatKip(employee.netSalary)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
