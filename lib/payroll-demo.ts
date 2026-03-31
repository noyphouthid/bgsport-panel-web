export type PayrollMonthOption = {
  value: string;
  label: string;
  status: "draft" | "reviewing" | "closed";
};

export type PayrollEmployee = {
  id: string;
  employee_code: string;
  full_name: string;
  department: string;
  position: string;
  working_days: number;
  overtime_hours: number;
  base_salary: number;
  overtime_rate: number;
  attendance_bonus: number;
  commission: number;
  allowance: number;
  late_penalty: number;
  leave_penalty: number;
  social_security: number;
  tax: number;
  other_deduction: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type PayrollBreakdown = PayrollEmployee & {
  overtimePay: number;
  grossIncome: number;
  totalDeduction: number;
  netSalary: number;
  paymentStatus: "ready" | "reviewing" | "hold";
};

export const payrollMonthOptions: PayrollMonthOption[] = [
  { value: "2026-03", label: "ເດືອນ 3 / 2026", status: "reviewing" },
  { value: "2026-02", label: "ເດືອນ 2 / 2026", status: "closed" },
  { value: "2026-01", label: "ເດືອນ 1 / 2026", status: "closed" },
];

export function createEmployeeCode(index: number) {
  return `EMP-${String(index).padStart(3, "0")}`;
}

export function calculatePayroll(employee: PayrollEmployee): PayrollBreakdown {
  const overtimePay = Number(employee.overtime_hours || 0) * Number(employee.overtime_rate || 0);
  const grossIncome =
    Number(employee.base_salary || 0) +
    overtimePay +
    Number(employee.attendance_bonus || 0) +
    Number(employee.commission || 0) +
    Number(employee.allowance || 0);
  const totalDeduction =
    Number(employee.late_penalty || 0) +
    Number(employee.leave_penalty || 0) +
    Number(employee.social_security || 0) +
    Number(employee.tax || 0) +
    Number(employee.other_deduction || 0);
  const netSalary = grossIncome - totalDeduction;

  let paymentStatus: PayrollBreakdown["paymentStatus"] = "ready";
  if (Number(employee.leave_penalty || 0) > 0 || Number(employee.late_penalty || 0) > 50000) {
    paymentStatus = "reviewing";
  }
  if (!employee.is_active) {
    paymentStatus = "hold";
  }

  return {
    ...employee,
    overtimePay,
    grossIncome,
    totalDeduction,
    netSalary,
    paymentStatus,
  };
}

export function formatKip(amount: number) {
  return `₭ ${Number(amount || 0).toLocaleString("en-US")}`;
}
