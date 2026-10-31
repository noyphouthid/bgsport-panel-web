import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayrollMonth, PayrollRun } from "@/lib/payroll-history";
import { fetchAllReportRows } from "@/lib/report-query";

export type PayrollExpenseRun = Pick<PayrollRun,
  "id" | "month_key" | "revision" | "payment_date" | "closed_by_name" | "entries"
> & { payroll_months: Pick<PayrollMonth, "status"> };

export function fetchPayrollExpenseRuns(client: Pick<SupabaseClient, "from">) {
  // Read every revision before selecting the latest one. Filtering by payment
  // date here could bring back a superseded run whose replacement moved dates.
  return fetchAllReportRows<PayrollExpenseRun>((from, to) => client
    .from("payroll_runs")
    .select("id,month_key,revision,payment_date,closed_by_name,entries,payroll_months!inner(status)")
    .eq("payroll_months.status", "closed")
    .order("month_key", { ascending: false })
    .order("revision", { ascending: false })
    .order("id")
    .range(from, to)
    .overrideTypes<PayrollExpenseRun[], { merge: false }>());
}

export function buildPayrollExpenseRows(runs: readonly PayrollExpenseRun[]) {
  const latestByMonth = new Map<string, PayrollExpenseRun>();
  for (const run of runs) {
    if (run.payroll_months.status !== "closed") continue;
    const previous = latestByMonth.get(run.month_key);
    if (!previous || run.revision > previous.revision) latestByMonth.set(run.month_key, run);
  }

  return [...latestByMonth.values()].flatMap((run) => run.entries.map((employee) => ({
    id: `payroll-${run.id}-${employee.id}`,
    entryType: "expense" as const,
    source: "payroll" as const,
    // payment_date is a SQL DATE. Local midnight keeps that calendar date when
    // the report formats/filters it, including outside the store's timezone.
    occurredAt: `${run.payment_date}T00:00:00`,
    category: "ຄ່າພະນັກງານ",
    title: `ເງິນເດືອນ ${employee.full_name}`,
    amount: Number(employee.netSalary),
    paymentMethod: "unknown" as const,
    referenceCode: employee.employee_code || null,
    note: `${run.month_key} • ${employee.department || "-"}`,
    orderCode: null,
    customerPhone: null,
    factoryBillCode: null,
    createdByName: run.closed_by_name || null,
    isManual: false,
  })));
}
