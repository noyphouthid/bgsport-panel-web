import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayrollBreakdown, PayrollEmployee, PayrollMonthOption } from "@/lib/payroll-demo";

export type PayrollMonth = {
  month_key: string;
  status: "draft" | "closed";
  draft_employees: PayrollEmployee[];
  reopened_at: string | null;
  reopened_by_name: string | null;
  updated_at: string;
};
export type PayrollMonthMeta = Pick<PayrollMonth, "month_key" | "status">;
export type PayrollRun = {
  id: string;
  month_key: string;
  revision: number;
  payment_date: string;
  closed_at: string;
  closed_by_name: string;
  employee_count: number;
  gross_income: number;
  total_deduction: number;
  net_salary: number;
  entries: PayrollBreakdown[];
};
export type PayrollRunMeta = Omit<PayrollRun, "entries">;
export type PayrollHistory = {
  periods: PayrollMonthMeta[];
  period: PayrollMonth | null;
  runs: PayrollRunMeta[];
  run: PayrollRun | null;
  templates: PayrollEmployee[];
};

export const payrollHistoryMigration = "20261015_create_payroll_month_history.sql";

export function payrollToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Vientiane", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function payrollHistoryError(error: { message?: string; code?: string } | unknown) {
  const message = error instanceof Error ? error.message : (error as { message?: string })?.message ?? "ໂຫຼດຂໍ້ມູນເງິນເດືອນບໍ່ສຳເລັດ";
  if (/could not find|does not exist|schema cache/i.test(message)) {
    return `ກະລຸນາລັນ migration ${payrollHistoryMigration} ໃນ Supabase ກ່ອນໃຊ້ປະຫວັດເງິນເດືອນ`;
  }
  return message;
}

export function payrollHistoryMonthOptions(base: PayrollMonthOption[], periods: PayrollMonthMeta[], selectedMonth?: string): PayrollMonthOption[] {
  const months = new Map(base.map((month) => [month.value, { ...month, status: "draft" as PayrollMonthOption["status"] }]));
  if (selectedMonth && !months.has(selectedMonth)) {
    const [year, month] = selectedMonth.split("-");
    months.set(selectedMonth, { value: selectedMonth, label: `ເດືອນ ${Number(month)} / ${year}`, status: "draft" });
  }
  for (const period of periods) {
    const [year, month] = period.month_key.split("-");
    months.set(period.month_key, { value: period.month_key, label: `ເດືອນ ${Number(month)} / ${year}`, status: period.status });
  }
  return Array.from(months.values()).sort((a, b) => b.value.localeCompare(a.value));
}

// Reports use stored totals, even after templates change or an employee is deleted.
export function payrollRunRows(run: PayrollRun | null): PayrollBreakdown[] {
  return run?.entries ?? [];
}

export async function loadPayrollHistory(client: Pick<SupabaseClient, "from">, monthKey: string, runId?: string, includeTemplates = false): Promise<PayrollHistory> {
  const [periodsResult, periodResult, runsResult] = await Promise.all([
    client.from("payroll_months").select("month_key,status").order("month_key", { ascending: false }),
    client.from("payroll_months").select("*").eq("month_key", monthKey).maybeSingle(),
    client.from("payroll_runs").select("id,month_key,revision,payment_date,closed_at,closed_by_name,employee_count,gross_income,total_deduction,net_salary")
      .eq("month_key", monthKey).order("revision", { ascending: false }),
  ]);
  for (const result of [periodsResult, periodResult, runsResult]) if (result.error) throw result.error;
  const runs = (runsResult.data ?? []) as PayrollRunMeta[];
  const selectedRun = (runId && runs.find((run) => run.id === runId)) || runs[0];
  let run: PayrollRun | null = null;
  if (selectedRun) {
    const result = await client.from("payroll_runs").select("*").eq("month_key", monthKey).eq("id", selectedRun.id).single();
    if (result.error) throw result.error;
    run = result.data as PayrollRun;
  }
  let templates: PayrollEmployee[] = [];
  if (includeTemplates && !periodResult.data) {
    const result = await client.from("payroll_employees").select("*").order("full_name").order("employee_code");
    if (result.error) throw result.error;
    templates = (result.data ?? []) as PayrollEmployee[];
  }
  return { periods: (periodsResult.data ?? []) as PayrollMonthMeta[], period: periodResult.data as PayrollMonth | null, runs, run, templates };
}
