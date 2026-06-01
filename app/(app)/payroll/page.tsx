"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import {
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  Pencil,
  Printer,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserPlus,
  Wallet,
} from "lucide-react";
import bgSportLogo from "@/app/BGSPORTLOGO.png";
import { supabase } from "@/lib/supabase";
import {
  calculatePayroll,
  createEmployeeCode,
  formatKip,
  payrollMonthOptions,
  type PayrollBreakdown,
  type PayrollEmployee,
} from "@/lib/payroll-demo";

const inputClassName =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";

const sectionCardClassName = "rounded-[30px] border border-slate-200/70 bg-white shadow-[0_22px_60px_-34px_rgba(15,23,42,0.35)]";

const formatKipLine = (amount: number) => (amount > 0 ? formatKip(amount) : "-");

export default function PayrollPage() {
  const [selectedMonth, setSelectedMonth] = useState(payrollMonthOptions[0]?.value ?? "");
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [employeeCode, setEmployeeCode] = useState(createEmployeeCode(1));
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [workingDays, setWorkingDays] = useState(26);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [baseSalary, setBaseSalary] = useState(0);
  const [overtimeRate, setOvertimeRate] = useState(0);
  const [attendanceBonus, setAttendanceBonus] = useState(0);
  const [commission, setCommission] = useState(0);
  const [allowance, setAllowance] = useState(0);
  const [latePenalty, setLatePenalty] = useState(0);
  const [leavePenalty, setLeavePenalty] = useState(0);
  const [socialSecurity, setSocialSecurity] = useState(0);
  const [tax, setTax] = useState(0);
  const [otherDeduction, setOtherDeduction] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const employeeRows = useMemo(() => employees.map(calculatePayroll), [employees]);
  const selectedMonthMeta = useMemo(
    () => payrollMonthOptions.find((item) => item.value === selectedMonth) ?? payrollMonthOptions[0],
    [selectedMonth]
  );
  const selectedEmployee = useMemo(
    () => employeeRows.find((employee) => employee.id === selectedEmployeeId) ?? employeeRows[0] ?? null,
    [employeeRows, selectedEmployeeId]
  );

  const summary = useMemo(() => {
    return employeeRows.reduce(
      (acc, employee) => {
        acc.grossIncome += employee.grossIncome;
        acc.totalDeduction += employee.totalDeduction;
        acc.netSalary += employee.netSalary;
        return acc;
      },
      { grossIncome: 0, totalDeduction: 0, netSalary: 0 }
    );
  }, [employeeRows]);

  const formNetSalary = useMemo(() => {
    const overtimePay = overtimeHours * overtimeRate;
    const gross = baseSalary + overtimePay + attendanceBonus + commission + allowance;
    const deduction = latePenalty + leavePenalty + socialSecurity + tax + otherDeduction;
    return gross - deduction;
  }, [
    allowance,
    attendanceBonus,
    baseSalary,
    commission,
    latePenalty,
    leavePenalty,
    otherDeduction,
    overtimeHours,
    overtimeRate,
    socialSecurity,
    tax,
  ]);

  const paymentDateLabel = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  const previewRows = useMemo(() => {
    if (!selectedEmployee) return [];

    const incomeItems = [
      { label: "ເງິນເດືອນພື້ນຖານ", amount: selectedEmployee.base_salary },
      { label: "ເງິນຄ່າ OT", amount: selectedEmployee.overtimePay },
      { label: "ເບ້ຍຂະຫຍັນ", amount: selectedEmployee.attendance_bonus },
      { label: "ຄອມມິດຊັນ", amount: selectedEmployee.commission },
      { label: "ຄ່ານ້ຳມັນ", amount: selectedEmployee.allowance },
    ];

    const deductionItems = [
      { label: "ຫັກມາສາຍ", amount: selectedEmployee.late_penalty },
      { label: "ຫັກລາຂາດ", amount: selectedEmployee.leave_penalty },
      { label: "ປະກັນສັງຄົມ", amount: selectedEmployee.social_security },
      { label: "ພາສີ", amount: selectedEmployee.tax },
      { label: "ລາຍການຫັກອື່ນ", amount: selectedEmployee.other_deduction },
    ];

    const rowCount = Math.max(incomeItems.length, deductionItems.length);

    return Array.from({ length: rowCount }, (_, index) => ({
      income: incomeItems[index] ?? null,
      deduction: deductionItems[index] ?? null,
    }));
  }, [selectedEmployee]);

  const resetForm = (nextCodeIndex = employees.length + 1) => {
    setEditingId(null);
    setEmployeeCode(createEmployeeCode(nextCodeIndex));
    setFullName("");
    setDepartment("");
    setPosition("");
    setWorkingDays(26);
    setOvertimeHours(0);
    setBaseSalary(0);
    setOvertimeRate(0);
    setAttendanceBonus(0);
    setCommission(0);
    setAllowance(0);
    setLatePenalty(0);
    setLeavePenalty(0);
    setSocialSecurity(0);
    setTax(0);
    setOtherDeduction(0);
    setIsActive(true);
  };

  const loadEmployees = async () => {
    setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("payroll_employees")
      .select("*")
      .order("full_name", { ascending: true });

    if (error) {
      const tableMissing = error.message.includes("Could not find the table");
      setEmployees([]);
      setLoading(false);
      setErrorMessage(
        tableMissing
          ? "ຍັງບໍ່ພົບຕາຕະລາງ payroll_employees ກະລຸນາລັນ migration 20260331_create_payroll_employees.sql ກ່ອນ"
          : error.message
      );
      return;
    }

    const rows = (data ?? []) as PayrollEmployee[];
    setEmployees(rows);
    setSelectedEmployeeId((current) => {
      if (current && rows.some((row) => row.id === current)) return current;
      return rows[0]?.id ?? "";
    });
    if (!editingId) {
      resetForm(rows.length + 1);
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadEmployees();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fillForm = (employee: PayrollEmployee) => {
    setEditingId(employee.id);
    setSelectedEmployeeId(employee.id);
    setEmployeeCode(employee.employee_code);
    setFullName(employee.full_name);
    setDepartment(employee.department);
    setPosition(employee.position);
    setWorkingDays(Number(employee.working_days || 0));
    setOvertimeHours(Number(employee.overtime_hours || 0));
    setBaseSalary(Number(employee.base_salary || 0));
    setOvertimeRate(Number(employee.overtime_rate || 0));
    setAttendanceBonus(Number(employee.attendance_bonus || 0));
    setCommission(Number(employee.commission || 0));
    setAllowance(Number(employee.allowance || 0));
    setLatePenalty(Number(employee.late_penalty || 0));
    setLeavePenalty(Number(employee.leave_penalty || 0));
    setSocialSecurity(Number(employee.social_security || 0));
    setTax(Number(employee.tax || 0));
    setOtherDeduction(Number(employee.other_deduction || 0));
    setIsActive(employee.is_active);
  };

  const buildPayload = () => ({
    employee_code: employeeCode.trim(),
    full_name: fullName.trim(),
    department: department.trim(),
    position: position.trim(),
    working_days: Math.max(0, workingDays),
    overtime_hours: Math.max(0, overtimeHours),
    base_salary: Math.max(0, baseSalary),
    overtime_rate: Math.max(0, overtimeRate),
    attendance_bonus: Math.max(0, attendanceBonus),
    commission: Math.max(0, commission),
    allowance: Math.max(0, allowance),
    late_penalty: Math.max(0, latePenalty),
    leave_penalty: Math.max(0, leavePenalty),
    social_security: Math.max(0, socialSecurity),
    tax: Math.max(0, tax),
    other_deduction: Math.max(0, otherDeduction),
    is_active: isActive,
  });

  const saveEmployee = async () => {
    if (!employeeCode.trim()) {
      toast.error("ກະລຸນາປ້ອນລະຫັດພະນັກງານ");
      return;
    }
    if (!fullName.trim()) {
      toast.error("ກະລຸນາປ້ອນຊື່ພະນັກງານ");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    const payload = buildPayload();
    const { error } = editingId
      ? await supabase.from("payroll_employees").update(payload).eq("id", editingId)
      : await supabase.from("payroll_employees").insert(payload);

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      toast.error(`ບັນທຶກບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    toast.success(editingId ? "ແກ້ໄຂພະນັກງານແລ້ວ" : "ເພີ່ມພະນັກງານແລ້ວ");
    await loadEmployees();
    resetForm(employees.length + (editingId ? 1 : 2));
  };

  const deleteEmployee = async (employee: PayrollEmployee) => {
    const confirmed = window.confirm(`ຢືນຢັນລົບພະນັກງານ ${employee.full_name} ?`);
    if (!confirmed) return;

    setDeletingId(employee.id);
    const { error } = await supabase.from("payroll_employees").delete().eq("id", employee.id);
    setDeletingId(null);

    if (error) {
      toast.error(`ລົບບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    toast.success("ລົບພະນັກງານແລ້ວ");
    if (editingId === employee.id) {
      resetForm();
    }
    await loadEmployees();
  };

  const handlePrint = () => {
    if (!selectedEmployee) {
      toast.error("ເລືອກພະນັກງານກ່ອນປຣິ້ນ");
      return;
    }

    window.print();
  };

  const handleSelectEmployee = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
  };

  return (
    <div className="space-y-6">
      <style jsx global>{`
        @page {
          size: A5 portrait;
          margin: 8mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
          }

          body * {
            visibility: hidden;
          }

          .payroll-print-shell,
          .payroll-print-shell * {
            visibility: visible;
          }

          .payroll-print-shell {
            position: absolute;
            inset: 0;
            margin: 0 !important;
            width: 148mm !important;
            max-width: 148mm !important;
          }

          .payroll-a5-sheet {
            box-shadow: none !important;
            border: none !important;
            width: 148mm !important;
            min-height: 194mm !important;
            margin: 0 !important;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="no-print rounded-[34px] border border-emerald-100 bg-[linear-gradient(135deg,#f5fff8_0%,#ffffff_42%,#f8f5ef_100%)] p-6 shadow-[0_25px_80px_-45px_rgba(5,150,105,0.45)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/85 px-3 py-1 text-xs font-black tracking-[0.18em] text-emerald-700 uppercase">
              Payroll A5
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">ລະບົບໃບຈ່າຍເງິນເດືອນພະນັກງານ</h1>
            <p className="mt-3 text-sm leading-6 font-semibold text-slate-600">
              ຟອມເກົ່າຍັງຢູ່ຄົບ ແຕ່ຖືກຈັດໃໝ່ໃຫ້ໃຊ້ງານງ່າຍ ແລະ ມີ preview ໃບ payslip ສຳລັບພິມ A5 ທັນທີຕາມພະນັກງານທີ່ເລືອກ.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            >
              {payrollMonthOptions.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>

            <button
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              <Printer size={16} />
              ປຣິ້ນໃບ A5
            </button>

            <Link
              href="/payroll/monthly-close"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <FileSpreadsheet size={16} />
              ໄປໜ້າປິດຍອດ
            </Link>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="no-print rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="no-print grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="ເງິນສຸດທິທັງເດືອນ"
          value={formatKip(summary.netSalary)}
          icon={<Wallet size={20} />}
          iconClassName="bg-emerald-100 text-emerald-700"
        />
        <SummaryCard
          title="ລາຍຮັບລວມ"
          value={formatKip(summary.grossIncome)}
          icon={<CheckCircle2 size={20} />}
          iconClassName="bg-sky-100 text-sky-700"
        />
        <SummaryCard
          title="ລາຍການຫັກລວມ"
          value={formatKip(summary.totalDeduction)}
          icon={<ShieldAlert size={20} />}
          iconClassName="bg-rose-100 text-rose-700"
        />
        <SummaryCard
          title="ພະນັກງານທັງໝົດ"
          value={`${employeeRows.length} ຄົນ`}
          icon={<Building2 size={20} />}
          iconClassName="bg-amber-100 text-amber-700"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1.1fr_0.9fr]">
        <div className="no-print space-y-6">
          <div className={`${sectionCardClassName} overflow-hidden`}>
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">ຟອມບັນທຶກ payroll</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    ປ້ອນຂໍ້ມູນພະນັກງານຕາມຟອມເກົ່າ ແລ້ວລະບົບຈະສະແດງໃບ payslip A5 ໃຫ້ທັນທີ
                  </p>
                </div>
                {editingId ? (
                  <button
                    onClick={() => resetForm()}
                    className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                  >
                    ຍົກເລີກການແກ້ໄຂ
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-8 px-6 py-6">
              <section className="space-y-4">
                <SectionLabel>ຂໍ້ມູນພື້ນຖານພະນັກງານ</SectionLabel>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="ລະຫັດພະນັກງານ">
                    <input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} className={inputClassName} />
                  </Field>
                  <Field label="ຊື່ພະນັກງານ">
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClassName} />
                  </Field>
                  <Field label="ພະແນກ">
                    <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClassName} />
                  </Field>
                  <Field label="ຕຳແໜ່ງ">
                    <input value={position} onChange={(e) => setPosition(e.target.value)} className={inputClassName} />
                  </Field>
                  <Field label="ມື້ເຮັດວຽກ">
                    <input
                      type="number"
                      value={workingDays}
                      onChange={(e) => setWorkingDays(Number(e.target.value))}
                      className={inputClassName}
                    />
                  </Field>
                  <Field label="ຊົ່ວໂມງ OT">
                    <input
                      type="number"
                      value={overtimeHours}
                      onChange={(e) => setOvertimeHours(Number(e.target.value))}
                      className={inputClassName}
                    />
                  </Field>
                </div>
              </section>

              <section className="space-y-4">
                <SectionLabel>ລາຍຮັບ</SectionLabel>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="ເງິນເດືອນພື້ນຖານ">
                    <input
                      type="number"
                      value={baseSalary}
                      onChange={(e) => setBaseSalary(Number(e.target.value))}
                      className={inputClassName}
                    />
                  </Field>
                  <Field label="ອັດຕາ OT / ຊົ່ວໂມງ">
                    <input
                      type="number"
                      value={overtimeRate}
                      onChange={(e) => setOvertimeRate(Number(e.target.value))}
                      className={inputClassName}
                    />
                  </Field>
                  <Field label="ເບ້ຍຂະຫຍັນ">
                    <input
                      type="number"
                      value={attendanceBonus}
                      onChange={(e) => setAttendanceBonus(Number(e.target.value))}
                      className={inputClassName}
                    />
                  </Field>
                  <Field label="ຄອມມິດຊັນ">
                    <input type="number" value={commission} onChange={(e) => setCommission(Number(e.target.value))} className={inputClassName} />
                  </Field>
                  <Field label="ຄ່າຊ່ວຍເຫຼືອ">
                    <input type="number" value={allowance} onChange={(e) => setAllowance(Number(e.target.value))} className={inputClassName} />
                  </Field>
                </div>
              </section>

              <section className="space-y-4">
                <SectionLabel>ລາຍການຫັກ</SectionLabel>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="ຫັກມາສາຍ">
                    <input
                      type="number"
                      value={latePenalty}
                      onChange={(e) => setLatePenalty(Number(e.target.value))}
                      className={inputClassName}
                    />
                  </Field>
                  <Field label="ຫັກລາຂາດ">
                    <input
                      type="number"
                      value={leavePenalty}
                      onChange={(e) => setLeavePenalty(Number(e.target.value))}
                      className={inputClassName}
                    />
                  </Field>
                  <Field label="ປະກັນສັງຄົມ">
                    <input
                      type="number"
                      value={socialSecurity}
                      onChange={(e) => setSocialSecurity(Number(e.target.value))}
                      className={inputClassName}
                    />
                  </Field>
                  <Field label="ພາສີ">
                    <input type="number" value={tax} onChange={(e) => setTax(Number(e.target.value))} className={inputClassName} />
                  </Field>
                  <Field label="ລາຍການຫັກອື່ນ">
                    <input
                      type="number"
                      value={otherDeduction}
                      onChange={(e) => setOtherDeduction(Number(e.target.value))}
                      className={inputClassName}
                    />
                  </Field>
                </div>
              </section>

              <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <label className="flex items-center gap-2 text-sm font-black text-slate-700">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    ເປີດໃຊ້ພະນັກງານນີ້
                  </label>
                  <div className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-900">
                    ເງິນສຸດທິຈາກຟອມ: <span className="text-lg text-emerald-700">{formatKip(formNetSalary)}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={saveEmployee}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <UserPlus size={16} />
                    {saving ? "ກຳລັງບັນທຶກ..." : editingId ? "ບັນທຶກການແກ້ໄຂ" : "ເພີ່ມພະນັກງານ"}
                  </button>
                  <button
                    onClick={() => void loadEmployees()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                  >
                    <RefreshCw size={16} />
                    ໂຫຼດຂໍ້ມູນຄືນ
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className={`${sectionCardClassName} overflow-hidden`}>
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">ຕາຕະລາງ payroll ປະຈຳເດືອນ</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    {selectedMonthMeta.label} · ຄລິກແຖວເພື່ອເບິ່ງໃບ payslip ແລະປຣິ້ນ
                  </p>
                </div>
                <div className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black tracking-[0.16em] text-slate-600 uppercase">
                  {selectedMonthMeta.status}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-bold">ພະນັກງານ</th>
                    <th className="px-6 py-4 font-bold">ຕຳແໜ່ງ</th>
                    <th className="px-6 py-4 font-bold">ລາຍຮັບລວມ</th>
                    <th className="px-6 py-4 font-bold">ລາຍການຫັກ</th>
                    <th className="px-6 py-4 font-bold">ຮັບສຸດທິ</th>
                    <th className="px-6 py-4 font-bold">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && employeeRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-14 text-center text-sm font-bold text-slate-400">
                        ຍັງບໍ່ມີພະນັກງານໃນລະບົບ
                      </td>
                    </tr>
                  ) : null}

                  {employeeRows.map((employee) => {
                    const active = employee.id === selectedEmployee?.id;

                    return (
                      <tr
                        key={employee.id}
                        className={`border-t border-slate-100 transition ${active ? "bg-emerald-50/70" : "bg-white hover:bg-slate-50"}`}
                      >
                        <td
                          className="cursor-pointer px-6 py-4"
                          onClick={() => handleSelectEmployee(employee.id)}
                        >
                          <div className="font-black text-slate-900">{employee.full_name}</div>
                          <div className="text-xs font-semibold text-slate-500">{employee.employee_code}</div>
                        </td>
                        <td
                          className="cursor-pointer px-6 py-4 font-semibold text-slate-600"
                          onClick={() => handleSelectEmployee(employee.id)}
                        >
                          <div>{employee.position || "-"}</div>
                          <div className="text-xs text-slate-400">{employee.department || "-"}</div>
                        </td>
                        <td
                          className="cursor-pointer px-6 py-4 font-bold text-slate-700"
                          onClick={() => handleSelectEmployee(employee.id)}
                        >
                          {formatKip(employee.grossIncome)}
                        </td>
                        <td
                          className="cursor-pointer px-6 py-4 font-bold text-rose-600"
                          onClick={() => handleSelectEmployee(employee.id)}
                        >
                          {formatKip(employee.totalDeduction)}
                        </td>
                        <td
                          className="cursor-pointer px-6 py-4 font-black text-emerald-700"
                          onClick={() => handleSelectEmployee(employee.id)}
                        >
                          {formatKip(employee.netSalary)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => fillForm(employee)}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <Pencil size={12} />
                              ແກ້ໄຂ
                            </button>
                            <button
                              onClick={() => {
                                handleSelectEmployee(employee.id);
                                setTimeout(() => window.print(), 80);
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-50"
                            >
                              <Printer size={12} />
                              ປຣິ້ນ
                            </button>
                            <button
                              onClick={() => void deleteEmployee(employee)}
                              disabled={deletingId === employee.id}
                              className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                            >
                              <Trash2 size={12} />
                              {deletingId === employee.id ? "ກຳລັງລົບ..." : "ລົບ"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="payroll-print-shell space-y-4">
          <div className="no-print flex flex-col gap-3 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.35)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">Preview ໃບ payslip A5</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                ຮູບແບບພິມແມ່ນ A5 portrait ຕາມໂຄງສ້າງໃບບິນທີ່ສົ່ງມາ
              </p>
            </div>
            <button
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              <Printer size={16} />
              ພິມໃບນີ້
            </button>
          </div>

          {!selectedEmployee ? (
            <div className="no-print rounded-[28px] border border-dashed border-slate-300 bg-white/80 p-10 text-center text-sm font-bold text-slate-500">
              ເພີ່ມ ຫຼື ເລືອກພະນັກງານກ່ອນ ແລ້ວໃບ payslip ຈະສະແດງຢູ່ບ່ອນນີ້
            </div>
          ) : (
            <PayslipSheet
              selectedEmployee={selectedEmployee}
              selectedMonthLabel={selectedMonthMeta.label}
              selectedMonthValue={selectedMonth}
              paymentDateLabel={paymentDateLabel}
              previewRows={previewRows}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PayslipSheet({
  selectedEmployee,
  selectedMonthLabel,
  selectedMonthValue,
  paymentDateLabel,
  previewRows,
}: {
  selectedEmployee: PayrollBreakdown;
  selectedMonthLabel: string;
  selectedMonthValue: string;
  paymentDateLabel: string;
  previewRows: Array<{
    income: { label: string; amount: number } | null;
    deduction: { label: string; amount: number } | null;
  }>;
}) {
  const slipNumber = `${selectedMonthValue.replace("-", "")}-${selectedEmployee.employee_code}`;

  return (
    <div className="payroll-a5-sheet mx-auto w-full max-w-[148mm] border border-[#c8d5ea] bg-white p-[8mm] shadow-[0_26px_60px_-35px_rgba(15,23,42,0.55)]">
      <div className="flex min-h-[194mm] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-[#c8d5ea] pb-4">
          <div className="space-y-1">
            <Image src={bgSportLogo} alt="BG Sport" className="h-auto w-24" priority />
            <div className="text-[13px] font-semibold tracking-tight text-slate-700">ບີຈີ ສະປອດ</div>
          </div>

          <div className="flex-1 pt-1 text-center">
            <div className="text-[9px] font-black tracking-[0.36em] text-[#7186a7] uppercase">Payslip</div>
            <h3 className="mt-1 text-[19px] leading-[1.15] font-black tracking-tight text-slate-900">
              ບິນຈ່າຍເງິນເດືອນ
            </h3>
            <div className="mt-2 text-[12px] font-black text-[#62769b]">{selectedMonthLabel}</div>
          </div>

          <div className="min-w-[160px] border border-[#c8d5ea] px-4 py-3 text-right text-[10px] font-black leading-5 text-slate-700">
            <div>ເລກທີ: {slipNumber}</div>
            <div>ສະຖານະ: {selectedEmployee.is_active ? "Ready" : "Hold"}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-7 gap-y-2.5 border-b border-[#c8d5ea] py-4 text-[11px]">
          <InfoRow label="ຊື່-ນາມສະກຸນ" value={selectedEmployee.full_name} />
          <InfoRow label="ປະຈຳເດືອນ" value={selectedMonthLabel} />
          <InfoRow label="ພະແນກ" value={selectedEmployee.department || "-"} />
          <InfoRow label="ວັນຈ່າຍ" value={paymentDateLabel} />
          <InfoRow label="ຕຳແໜ່ງ" value={selectedEmployee.position || "-"} />
          <InfoRow label="ລະຫັດພະນັກງານ" value={selectedEmployee.employee_code} />
          <InfoRow label="ມື້ເຮັດວຽກ" value={`${selectedEmployee.working_days} ມື້`} />
          <InfoRow label="OT" value={`${selectedEmployee.overtime_hours} ຊົ່ວໂມງ`} />
        </div>

        <div className="mt-4 overflow-hidden border border-[#9ab0d0]">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#f7faff] text-center text-slate-800">
                <th className="border border-[#9ab0d0] px-2 py-2.5 font-black">ລາຍຮັບ</th>
                <th className="border border-[#9ab0d0] px-2 py-2.5 font-black">ຈຳນວນເງິນ</th>
                <th className="border border-[#9ab0d0] px-2 py-2.5 font-black">ລາຍການຫັກ</th>
                <th className="border border-[#9ab0d0] px-2 py-2.5 font-black">ຈຳນວນເງິນ</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, index) => (
                <tr key={`${selectedEmployee.id}-${index}`} className="align-top">
                  <td className="h-10 border border-[#c8d5ea] px-3 py-2.5 font-bold text-emerald-700">
                    {row.income?.label ?? ""}
                  </td>
                  <td className="border border-[#c8d5ea] px-3 py-2.5 text-right font-black text-slate-800">
                    {row.income ? formatKipLine(row.income.amount) : ""}
                  </td>
                  <td className="border border-[#c8d5ea] px-3 py-2.5 font-bold text-rose-600">
                    {row.deduction?.label ?? ""}
                  </td>
                  <td className="border border-[#c8d5ea] px-3 py-2.5 text-right font-black text-slate-800">
                    {row.deduction ? formatKipLine(row.deduction.amount) : ""}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#f9fbff]">
                <td className="border border-[#9ab0d0] px-3 py-3 text-center font-black text-slate-800">ລວມລາຍຮັບ</td>
                <td className="border border-[#9ab0d0] px-3 py-3 text-right font-black text-[12px] text-emerald-700">
                  {formatKip(selectedEmployee.grossIncome)}
                </td>
                <td className="border border-[#9ab0d0] px-3 py-3 text-center font-black text-slate-800">ລວມລາຍການຫັກ</td>
                <td className="border border-[#9ab0d0] px-3 py-3 text-right font-black text-[12px] text-rose-600">
                  {formatKip(selectedEmployee.totalDeduction)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-[1.15fr_0.85fr] gap-4">
          <div className="overflow-hidden border border-[#9ab0d0]">
            <div className="grid grid-cols-2">
              <div className="border-r border-[#9ab0d0] bg-[#f9fbff] px-4 py-3 text-center">
                <div className="text-[10px] font-black tracking-[0.24em] text-[#7186a7] uppercase">Total Income</div>
                <div className="mt-2 text-[19px] leading-none font-black text-emerald-700">
                  <div className="mb-1 text-[16px]">₭</div>
                  <div>{Number(selectedEmployee.netSalary || 0).toLocaleString("en-US")}</div>
                </div>
              </div>
              <div className="px-4 py-3 text-center">
                <div className="text-[10px] font-black tracking-[0.24em] text-[#7186a7] uppercase">Payslip Date</div>
                <div className="mt-3 text-[14px] font-black text-slate-900">{paymentDateLabel}</div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden border border-[#9ab0d0]">
            <div className="border-b border-[#c8d5ea] bg-[#f9fbff] px-4 py-3 text-center text-[10px] font-black tracking-[0.24em] text-[#7186a7] uppercase">
              Notes
            </div>
            <div className="text-[11px]">
              <div className="px-4 py-3 text-slate-800">ເງິນສຸດທິ: {formatKip(selectedEmployee.netSalary)}</div>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-7">
          <div className="grid grid-cols-2 gap-10 text-center">
            <div>
              <div className="pb-8 text-[11px] font-black text-slate-700">ພະນັກງານ</div>
              <div className="border-t border-slate-400 pt-2 text-[11px] font-black text-slate-700">ລາຍເຊັນ</div>
            </div>
            <div>
              <div className="pb-8 text-[11px] font-black text-slate-700">ຜູ້ຈ່າຍເງິນ</div>
              <div className="border-t border-slate-400 pt-2 text-[11px] font-black text-slate-700">ລາຍເຊັນ</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-start gap-2">
      <div className="text-[11px] font-black text-[#7186a7]">{label}:</div>
      <div className="text-[11px] font-black text-slate-900">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black tracking-[0.16em] text-slate-500 uppercase">{label}</span>
      {children}
    </label>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-sm font-black tracking-[0.18em] text-slate-500 uppercase">{children}</div>;
}

function SummaryCard({
  title,
  value,
  icon,
  iconClassName,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  iconClassName: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200/70 bg-white p-5 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.35)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-bold text-slate-500">{title}</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
        </div>
        <div className={`rounded-2xl p-3 ${iconClassName}`}>{icon}</div>
      </div>
    </div>
  );
}
