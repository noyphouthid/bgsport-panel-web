"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { Download, FileDown, HandCoins, Printer, RefreshCw, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  calculatePayroll,
  formatKip,
  payrollMonthOptions,
  type PayrollBreakdown,
  type PayrollEmployee,
} from "@/lib/payroll-demo";
import { exportReportDocumentAsPdf, openReportPrintWindow } from "../_lib";

type PayrollStatusFilter = "all" | PayrollBreakdown["paymentStatus"];

function matchesSearch(employee: PayrollBreakdown, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    employee.employee_code,
    employee.full_name,
    employee.department,
    employee.position,
  ]
    .map((value) => String(value || "").toLowerCase())
    .some((value) => value.includes(normalizedQuery));
}

function paymentStatusLabel(status: PayrollBreakdown["paymentStatus"]) {
  if (status === "ready") return "ພ້ອມຈ່າຍ";
  if (status === "reviewing") return "ລໍຖ້າກວດ";
  return "ພັກໄວ້";
}

function paymentStatusClassName(status: PayrollBreakdown["paymentStatus"]) {
  if (status === "ready") return "bg-emerald-100 text-emerald-700";
  if (status === "reviewing") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

export default function PayrollReportPage() {
  const [selectedMonth, setSelectedMonth] = useState(payrollMonthOptions[0]?.value ?? "");
  const [statusFilter, setStatusFilter] = useState<PayrollStatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [rows, setRows] = useState<PayrollEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const selectedMonthMeta = useMemo(
    () => payrollMonthOptions.find((item) => item.value === selectedMonth) ?? payrollMonthOptions[0],
    [selectedMonth]
  );

  const employeeRows = useMemo(() => rows.map(calculatePayroll), [rows]);
  const departmentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          employeeRows
            .map((employee) => String(employee.department || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [employeeRows]
  );

  const load = async () => {
    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("payroll_employees")
      .select("*")
      .order("full_name", { ascending: true });

    if (error) {
      const tableMissing = error.message.includes("Could not find the table");
      setRows([]);
      setErr(
        tableMissing
          ? "ຍັງບໍ່ພົບຕາຕະລາງ payroll_employees ກະລຸນາລັນ migration 20260331_create_payroll_employees.sql ກ່ອນ"
          : error.message
      );
      setLoading(false);
      return;
    }

    setRows((data ?? []) as PayrollEmployee[]);
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const filteredRows = useMemo(() => {
    return employeeRows.filter((employee) => {
      if (statusFilter !== "all" && employee.paymentStatus !== statusFilter) return false;
      if (departmentFilter !== "all" && employee.department !== departmentFilter) return false;
      if (!matchesSearch(employee, searchTerm)) return false;
      return true;
    });
  }, [employeeRows, statusFilter, departmentFilter, searchTerm]);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, employee) => {
        acc.employeeCount += 1;
        acc.grossIncome += employee.grossIncome;
        acc.totalDeduction += employee.totalDeduction;
        acc.netSalary += employee.netSalary;
        if (employee.paymentStatus === "ready") acc.readyCount += 1;
        if (employee.paymentStatus === "reviewing") acc.reviewingCount += 1;
        if (employee.paymentStatus === "hold") acc.holdCount += 1;
        return acc;
      },
      {
        employeeCount: 0,
        grossIncome: 0,
        totalDeduction: 0,
        netSalary: 0,
        readyCount: 0,
        reviewingCount: 0,
        holdCount: 0,
      }
    );
  }, [filteredRows]);

  const periodLabel = selectedMonthMeta?.label ?? selectedMonth;
  const reportTitle = "ລາຍງານເງິນເດືອນພະນັກງານ";
  const reportSubtitle = `ປະຈຳເດືອນ: ${periodLabel} | ພະແນກ: ${
    departmentFilter === "all" ? "ທັງໝົດ" : departmentFilter
  } | ສະຖານະ: ${
    statusFilter === "all" ? "ທັງໝົດ" : paymentStatusLabel(statusFilter)
  } | ຄົ້ນຫາ: ${searchTerm || "-"}`;

  const reportHeaders = [
    "ລະຫັດ",
    "ພະນັກງານ",
    "ພະແນກ",
    "ຕຳແໜ່ງ",
    "ລາຍຮັບລວມ",
    "ລາຍການຫັກ",
    "ເງິນສຸດທິ",
    "ສະຖານະ",
  ];

  const reportRows = filteredRows.map((employee) => [
    employee.employee_code,
    employee.full_name,
    employee.department || "-",
    employee.position || "-",
    String(employee.grossIncome.toLocaleString()),
    String(employee.totalDeduction.toLocaleString()),
    String(employee.netSalary.toLocaleString()),
    paymentStatusLabel(employee.paymentStatus),
  ]);

  const exportExcel = () => {
    const output = filteredRows.map((employee) => ({
      month: periodLabel,
      employee_code: employee.employee_code,
      full_name: employee.full_name,
      department: employee.department,
      position: employee.position,
      working_days: employee.working_days,
      overtime_hours: employee.overtime_hours,
      base_salary: employee.base_salary,
      overtime_pay: employee.overtimePay,
      attendance_bonus: employee.attendance_bonus,
      commission: employee.commission,
      allowance: employee.allowance,
      gross_income: employee.grossIncome,
      late_penalty: employee.late_penalty,
      leave_penalty: employee.leave_penalty,
      social_security: employee.social_security,
      tax: employee.tax,
      other_deduction: employee.other_deduction,
      total_deduction: employee.totalDeduction,
      net_salary: employee.netSalary,
      payment_status: paymentStatusLabel(employee.paymentStatus),
      active_status: employee.is_active ? "active" : "inactive",
    }));

    const ws = XLSX.utils.json_to_sheet(output);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "payroll_report");
    XLSX.writeFile(wb, `payroll-report-${selectedMonth}.xlsx`);
  };

  const handlePrint = () => {
    openReportPrintWindow({
      title: reportTitle,
      subtitle: reportSubtitle,
      summary: [
        { label: "ພະນັກງານ", value: summary.employeeCount.toLocaleString() },
        { label: "ລາຍຮັບລວມ", value: summary.grossIncome.toLocaleString() },
        { label: "ລາຍການຫັກ", value: summary.totalDeduction.toLocaleString() },
        { label: "ເງິນສຸດທິ", value: summary.netSalary.toLocaleString() },
      ],
      headers: reportHeaders,
      rows: reportRows,
    });
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportReportDocumentAsPdf(
        {
          title: reportTitle,
          subtitle: reportSubtitle,
          summary: [
            { label: "ພະນັກງານ", value: summary.employeeCount.toLocaleString() },
            { label: "ລາຍຮັບລວມ", value: summary.grossIncome.toLocaleString() },
            { label: "ລາຍການຫັກ", value: summary.totalDeduction.toLocaleString() },
            { label: "ເງິນສຸດທິ", value: summary.netSalary.toLocaleString() },
          ],
          headers: reportHeaders,
          rows: reportRows,
        },
        `payroll-report-${selectedMonth}.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ລາຍງານເງິນເດືອນພະນັກງານ</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            ສະຫຼຸບ payroll ລາຍເດືອນ, ພິມລາຍງານ, export Excel ແລະ PDF ໄດ້
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/payroll"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Wallet size={16} />
            ໄປໜ້າ payroll
          </Link>
          <button
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            ໂຫຼດຄືນ
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Printer size={16} />
            ພິມລາຍງານ
          </button>
          <button
            onClick={() => void handleExportPdf()}
            disabled={exportingPdf}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            <FileDown size={16} />
            {exportingPdf ? "ກຳລັງສ້າງ PDF..." : "Export PDF"}
          </button>
          <button
            onClick={exportExcel}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700"
          >
            <Download size={16} />
            Export Excel
          </button>
        </div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">{err}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
          >
            {payrollMonthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
          >
            <option value="all">ພະແນກທັງໝົດ</option>
            {departmentOptions.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PayrollStatusFilter)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
          >
            <option value="all">ສະຖານະທັງໝົດ</option>
            <option value="ready">ພ້ອມຈ່າຍ</option>
            <option value="reviewing">ລໍຖ້າກວດ</option>
            <option value="hold">ພັກໄວ້</option>
          </select>

          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ຄົ້ນຫາລະຫັດ, ຊື່, ພະແນກ..."
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="ພະນັກງານ" value={`${summary.employeeCount} ຄົນ`} icon={<HandCoins size={18} />} iconBg="bg-sky-100 text-sky-700" />
        <SummaryCard title="ລາຍຮັບລວມ" value={formatKip(summary.grossIncome)} icon={<Wallet size={18} />} iconBg="bg-emerald-100 text-emerald-700" />
        <SummaryCard title="ລາຍການຫັກ" value={formatKip(summary.totalDeduction)} icon={<FileDown size={18} />} iconBg="bg-rose-100 text-rose-700" />
        <SummaryCard title="ເງິນສຸດທິ" value={formatKip(summary.netSalary)} icon={<Download size={18} />} iconBg="bg-amber-100 text-amber-700" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatusCard title="ພ້ອມຈ່າຍ" value={summary.readyCount} className="border-emerald-200 bg-emerald-50 text-emerald-700" />
        <StatusCard title="ລໍຖ້າກວດ" value={summary.reviewingCount} className="border-amber-200 bg-amber-50 text-amber-700" />
        <StatusCard title="ພັກໄວ້" value={summary.holdCount} className="border-rose-200 bg-rose-50 text-rose-700" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">ຕາຕະລາງລາຍງານ payroll</h2>
            <p className="text-sm font-medium text-slate-500">{periodLabel}</p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
            {loading ? "Loading..." : `${filteredRows.length} ລາຍການ`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-bold">ພະນັກງານ</th>
                <th className="px-5 py-3 font-bold">ພະແນກ / ຕຳແໜ່ງ</th>
                <th className="px-5 py-3 font-bold">ມື້ / OT</th>
                <th className="px-5 py-3 font-bold">ລາຍຮັບລວມ</th>
                <th className="px-5 py-3 font-bold">ລາຍການຫັກ</th>
                <th className="px-5 py-3 font-bold">ຮັບສຸດທິ</th>
                <th className="px-5 py-3 font-bold">ສະຖານະ</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm font-bold text-slate-400">
                    ບໍ່ພົບຂໍ້ມູນ payroll ຕາມເງື່ອນໄຂທີ່ເລືອກ
                  </td>
                </tr>
              ) : null}

              {filteredRows.map((employee) => (
                <tr key={employee.id} className="border-t border-slate-100">
                  <td className="px-5 py-4">
                    <div className="font-black text-slate-900">{employee.full_name}</div>
                    <div className="text-xs font-semibold text-slate-500">{employee.employee_code}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-700">{employee.department || "-"}</div>
                    <div className="text-xs text-slate-500">{employee.position || "-"}</div>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-700">
                    <div>{employee.working_days} ມື້</div>
                    <div className="text-xs text-slate-500">{employee.overtime_hours} ຊົ່ວໂມງ</div>
                  </td>
                  <td className="px-5 py-4 font-bold text-slate-700">{formatKip(employee.grossIncome)}</td>
                  <td className="px-5 py-4 font-bold text-rose-600">{formatKip(employee.totalDeduction)}</td>
                  <td className="px-5 py-4 font-black text-emerald-700">{formatKip(employee.netSalary)}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${paymentStatusClassName(employee.paymentStatus)}`}>
                      {paymentStatusLabel(employee.paymentStatus)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  iconBg,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  iconBg: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-bold text-slate-500">{title}</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
        </div>
        <div className={`rounded-2xl p-3 ${iconBg}`}>{icon}</div>
      </div>
    </div>
  );
}

function StatusCard({ title, value, className }: { title: string; value: number; className: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${className}`}>
      <div className="text-sm font-bold">{title}</div>
      <div className="mt-2 text-2xl font-black">{value.toLocaleString()} ຄົນ</div>
    </div>
  );
}
