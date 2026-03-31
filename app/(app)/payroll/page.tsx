"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import {
  Calculator,
  CheckCircle2,
  FileSpreadsheet,
  Pencil,
  ShieldAlert,
  Trash2,
  UserPlus,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  calculatePayroll,
  createEmployeeCode,
  formatKip,
  payrollMonthOptions,
  type PayrollEmployee,
} from "@/lib/payroll-demo";

const inputClassName =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400";

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
  const selectedEmployee = employeeRows.find((employee) => employee.id === selectedEmployeeId) ?? employeeRows[0];

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ລະບົບເງິນເດືອນພະນັກງານ</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            ສ່ວນນີ້ແມ່ນສຳລັບ `ເງິນເດືອນພະນັກງານ` ເທົ່ານັ້ນ ບໍ່ແມ່ນຫນ້າປິດຍອດຂາຍ-ກຳໄລ
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

          <Link
            href="/payroll/monthly-close"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800"
          >
            <FileSpreadsheet size={16} />
            ໄປໜ້າປິດຍອດເງິນເດືອນ
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="ຍອດເງິນສຸດທິ"
          value={formatKip(summary.netSalary)}
          icon={<Calculator size={20} />}
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
          value={String(employeeRows.length)}
          icon={<FileSpreadsheet size={20} />}
          iconClassName="bg-amber-100 text-amber-700"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">ເພີ່ມ / ແກ້ໄຂພະນັກງານ</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">ປ້ອນຊື່ ແລະ ຕົວເລກພື້ນຖານໄດ້ທີ່ນີ້</p>
            </div>
            {editingId ? (
              <button
                onClick={() => resetForm()}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                ຍົກເລີກແກ້ໄຂ
              </button>
            ) : null}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
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
              <input type="number" value={workingDays} onChange={(e) => setWorkingDays(Number(e.target.value))} className={inputClassName} />
            </Field>
            <Field label="ຊົ່ວໂມງ OT">
              <input type="number" value={overtimeHours} onChange={(e) => setOvertimeHours(Number(e.target.value))} className={inputClassName} />
            </Field>
            <Field label="ເງິນເດືອນພື້ນຖານ">
              <input type="number" value={baseSalary} onChange={(e) => setBaseSalary(Number(e.target.value))} className={inputClassName} />
            </Field>
            <Field label="ອັດຕາ OT / ຊົ່ວໂມງ">
              <input type="number" value={overtimeRate} onChange={(e) => setOvertimeRate(Number(e.target.value))} className={inputClassName} />
            </Field>
            <Field label="ເບ້ຍຂະຫຍັນ">
              <input type="number" value={attendanceBonus} onChange={(e) => setAttendanceBonus(Number(e.target.value))} className={inputClassName} />
            </Field>
            <Field label="ຄອມມິດຊັນ">
              <input type="number" value={commission} onChange={(e) => setCommission(Number(e.target.value))} className={inputClassName} />
            </Field>
            <Field label="ຄ່າຊ່ວຍເຫຼືອ">
              <input type="number" value={allowance} onChange={(e) => setAllowance(Number(e.target.value))} className={inputClassName} />
            </Field>
            <Field label="ຫັກມາສາຍ">
              <input type="number" value={latePenalty} onChange={(e) => setLatePenalty(Number(e.target.value))} className={inputClassName} />
            </Field>
            <Field label="ຫັກລາຂາດ">
              <input type="number" value={leavePenalty} onChange={(e) => setLeavePenalty(Number(e.target.value))} className={inputClassName} />
            </Field>
            <Field label="ປະກັນສັງຄົມ">
              <input type="number" value={socialSecurity} onChange={(e) => setSocialSecurity(Number(e.target.value))} className={inputClassName} />
            </Field>
            <Field label="ພາສີ">
              <input type="number" value={tax} onChange={(e) => setTax(Number(e.target.value))} className={inputClassName} />
            </Field>
            <Field label="ລາຍການຫັກອື່ນ">
              <input type="number" value={otherDeduction} onChange={(e) => setOtherDeduction(Number(e.target.value))} className={inputClassName} />
            </Field>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <label className="flex items-center gap-2 text-sm font-black text-slate-700">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              ເປີດໃຊ້ພະນັກງານນີ້
            </label>
            <div className="text-sm font-black text-slate-900">ເງິນສຸດທິ: {formatKip(formNetSalary)}</div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={saveEmployee}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white hover:bg-green-700 disabled:opacity-60"
            >
              <UserPlus size={16} />
              {saving ? "ກຳລັງບັນທຶກ..." : editingId ? "ບັນທຶກການແກ້ໄຂ" : "ເພີ່ມພະນັກງານ"}
            </button>
            <button
              onClick={() => void loadEmployees()}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              ໂຫຼດລາຍຊື່ຄືນ
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">ວິທີເພີ່ມ ແລະ ລົບ</h2>
          <div className="mt-4 space-y-3 text-sm font-semibold text-slate-600">
            <div className="rounded-2xl bg-slate-50 p-4">ເພີ່ມ: ປ້ອນຟອມດ້ານຊ້າຍ ແລ້ວກົດ &quot;ເພີ່ມພະນັກງານ&quot;</div>
            <div className="rounded-2xl bg-slate-50 p-4">ແກ້ໄຂ: ກົດປຸ່ມ &quot;ແກ້ໄຂ&quot; ໃນຕາຕະລາງລາຍຊື່</div>
            <div className="rounded-2xl bg-slate-50 p-4">ລົບ: ກົດປຸ່ມ &quot;ລົບ&quot; ແລ້ວຢືນຢັນ</div>
            <div className="rounded-2xl bg-blue-50 p-4 text-blue-700">
              ຖ້າໂຫຼດບໍ່ຂຶ້ນ ໃຫ້ລັນ migration `20260331_create_payroll_employees.sql`
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">ລາຍຊື່ຄຳນວນເງິນເດືອນ</h2>
              <p className="text-sm font-medium text-slate-500">{selectedMonthMeta.label}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold">ພະນັກງານ</th>
                  <th className="px-5 py-3 font-bold">ພະແນກ</th>
                  <th className="px-5 py-3 font-bold">ລາຍຮັບລວມ</th>
                  <th className="px-5 py-3 font-bold">ລາຍການຫັກ</th>
                  <th className="px-5 py-3 font-bold">ຮັບສຸດທິ</th>
                  <th className="px-5 py-3 font-bold">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {!loading && employeeRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-sm font-bold text-slate-400">
                      ຍັງບໍ່ມີພະນັກງານໃນລະບົບ
                    </td>
                  </tr>
                ) : null}
                {employeeRows.map((employee) => {
                  const active = employee.id === selectedEmployee?.id;

                  return (
                    <tr
                      key={employee.id}
                      className={`cursor-pointer border-t border-slate-100 transition hover:bg-slate-50 ${active ? "bg-blue-50/60" : "bg-white"}`}
                      onClick={() => setSelectedEmployeeId(employee.id)}
                    >
                      <td className="px-5 py-4">
                        <div className="font-black text-slate-900">{employee.full_name}</div>
                        <div className="text-xs font-semibold text-slate-500">{employee.employee_code}</div>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        <div>{employee.department}</div>
                        <div className="text-xs text-slate-400">{employee.position}</div>
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-700">{formatKip(employee.grossIncome)}</td>
                      <td className="px-5 py-4 font-bold text-rose-600">{formatKip(employee.totalDeduction)}</td>
                      <td className="px-5 py-4 font-black text-emerald-700">{formatKip(employee.netSalary)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              fillForm(employee);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                          >
                            <Pencil size={12} />
                            ແກ້ໄຂ
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteEmployee(employee);
                            }}
                            disabled={deletingId === employee.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:opacity-60"
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

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">ໃບຄຳນວນພະນັກງານ</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">ເບິ່ງລາຍຮັບ ແລະ ລາຍການຫັກຂອງພະນັກງານແຕ່ລະຄົນ</p>

            {!selectedEmployee ? (
              <div className="mt-5 rounded-2xl bg-slate-50 p-6 text-sm font-bold text-slate-500">
                ເພີ່ມພະນັກງານກ່ອນ ແລ້ວລາຍລະອຽດຈະສະແດງຢູ່ບ່ອນນີ້
              </div>
            ) : (
              <>
                <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                  <div className="text-lg font-black text-slate-900">{selectedEmployee.full_name}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">
                    {selectedEmployee.department} · {selectedEmployee.position}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-white p-3">
                      <div className="font-bold text-slate-500">ມື້ເຮັດວຽກ</div>
                      <div className="mt-1 text-lg font-black text-slate-900">{selectedEmployee.working_days} ມື້</div>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <div className="font-bold text-slate-500">OT</div>
                      <div className="mt-1 text-lg font-black text-slate-900">{selectedEmployee.overtime_hours} ຊົ່ວໂມງ</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3">
                    <span className="font-bold text-slate-600">ເງິນເດືອນພື້ນຖານ</span>
                    <span className="font-black text-emerald-700">{formatKip(selectedEmployee.base_salary)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3">
                    <span className="font-bold text-slate-600">ຄ່າ OT</span>
                    <span className="font-black text-emerald-700">{formatKip(selectedEmployee.overtimePay)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3">
                    <span className="font-bold text-slate-600">ເບ້ຍຂະຫຍັນ + ເພີ່ມພິເສດ</span>
                    <span className="font-black text-emerald-700">
                      {formatKip(selectedEmployee.attendance_bonus + selectedEmployee.allowance)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3">
                    <span className="font-bold text-slate-600">ຄອມມິດຊັນ</span>
                    <span className="font-black text-emerald-700">{formatKip(selectedEmployee.commission)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-rose-50 px-4 py-3">
                    <span className="font-bold text-slate-600">ຫັກມາສາຍ + ລາຂາດ</span>
                    <span className="font-black text-rose-700">
                      {formatKip(selectedEmployee.late_penalty + selectedEmployee.leave_penalty)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-rose-50 px-4 py-3">
                    <span className="font-bold text-slate-600">ປະກັນສັງຄົມ + ພາສີ</span>
                    <span className="font-black text-rose-700">
                      {formatKip(selectedEmployee.social_security + selectedEmployee.tax)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-3 text-white">
                    <span className="font-bold">ເງິນສຸດທິທີ່ຈ່າຍ</span>
                    <span className="text-lg font-black">{formatKip(selectedEmployee.netSalary)}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">ສູດການຄຳນວນ</h2>
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
              ລາຍຮັບລວມ = ເງິນເດືອນພື້ນຖານ + OT + ເບ້ຍຂະຫຍັນ + ຄອມມິດຊັນ + ຄ່າຊ່ວຍເຫຼືອ
            </div>
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
              ລາຍການຫັກ = ມາສາຍ + ລາຂາດ + ປະກັນສັງຄົມ + ພາສີ + ລາຍການຫັກອື່ນ
            </div>
            <div className="mt-3 rounded-2xl bg-blue-50 p-4 text-sm font-black text-blue-700">
              ເງິນສຸດທິ = ລາຍຮັບລວມ - ລາຍການຫັກ
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
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
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-slate-500">{title}</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
        </div>
        <div className={`rounded-2xl p-3 ${iconClassName}`}>{icon}</div>
      </div>
    </div>
  );
}
