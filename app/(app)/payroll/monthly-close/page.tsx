"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CalendarRange, Lock, Unlock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { calculatePayroll, formatKip, payrollMonthOptions, type PayrollEmployee } from "@/lib/payroll-demo";

const closeSteps = [
  "ກວດເວລາເຮັດວຽກ ແລະ ຂໍ້ມູນຂາດ-ລາ",
  "ກວດຄ່າ OT, ເບ້ຍຂະຫຍັນ ແລະ ຄອມມິດຊັນ",
  "ກວດລາຍການຫັກ ແລະ ລາຍການຄ້າງອະນຸມັດ",
  "ອອກໃບສະຫຼຸບ ແລະ ລັອກເດືອນ",
];

export default function PayrollMonthlyClosePage() {
  const [selectedMonth, setSelectedMonth] = useState(payrollMonthOptions[0]?.value ?? "");
  const [locked, setLocked] = useState(false);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setErrorMessage(null);
        const { data, error } = await supabase
          .from("payroll_employees")
          .select("*")
          .eq("is_active", true)
          .order("full_name", { ascending: true });

        if (error) {
          setEmployees([]);
          setLoading(false);
          setErrorMessage(error.message);
          return;
        }

        setEmployees((data ?? []) as PayrollEmployee[]);
        setLoading(false);
      })();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const employeeRows = useMemo(() => employees.map(calculatePayroll), [employees]);
  const selectedMonthMeta = useMemo(
    () => payrollMonthOptions.find((item) => item.value === selectedMonth) ?? payrollMonthOptions[0],
    [selectedMonth]
  );

  const summary = useMemo(() => {
    const netSalary = employeeRows.reduce((sum, employee) => sum + employee.netSalary, 0);
    const totalDeduction = employeeRows.reduce((sum, employee) => sum + employee.totalDeduction, 0);
    return { employeeCount: employeeRows.length, netSalary, totalDeduction };
  }, [employeeRows]);

  const handleCloseMonth = () => {
    if (employeeRows.length === 0) {
      toast.error("ຍັງບໍ່ມີພະນັກງານໃນລະບົບ");
      return;
    }
    setLocked(true);
    toast.success(`ປິດຍອດ ${selectedMonthMeta.label} ສຳເລັດແລ້ວ`);
  };

  const handleReopen = () => {
    setLocked(false);
    toast("ເປີດເດືອນນີ້ໃຫ້ແກ້ໄຂໄດ້ອີກຄັ້ງ");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ປິດຍອດເງິນເດືອນພະນັກງານ</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            ສ່ວນນີ້ແມ່ນສຳລັບ `ປິດຍອດເງິນເດືອນ` ຂອງພະນັກງານ ບໍ່ແມ່ນປິດຍອດຂາຍ-ກຳໄລ
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-400"
          >
            {payrollMonthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>

          {locked ? (
            <button
              onClick={handleReopen}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <Unlock size={16} />
              ເປີດເດືອນນີ້ອີກຄັ້ງ
            </button>
          ) : (
            <button
              onClick={handleCloseMonth}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800"
            >
              <Lock size={16} />
              ຢືນຢັນປິດຍອດ
            </button>
          )}
        </div>
      </div>

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
            {locked || selectedMonthMeta.status === "closed" ? "ປິດຍອດແລ້ວ" : "ຍັງບໍ່ປິດຍອດ"}
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
              <h2 className="text-lg font-black text-slate-900">ລາຍການກ່ອນປິດເດືອນ</h2>
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
