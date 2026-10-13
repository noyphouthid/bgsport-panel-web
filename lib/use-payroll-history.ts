"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadPayrollHistory, payrollHistoryError, type PayrollHistory } from "@/lib/payroll-history";
import { payrollMonthOptions } from "@/lib/payroll-demo";

export function usePayrollMonth() {
  const [month, setMonth] = useState(payrollMonthOptions[0]?.value ?? "");
  useEffect(() => {
    const timer = setTimeout(() => {
      const requested = new URL(window.location.href).searchParams.get("month");
      if (requested && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(requested)) setMonth(requested);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const selectMonth = (value: string) => {
    setMonth(value);
    const url = new URL(window.location.href);
    url.searchParams.set("month", value);
    window.history.replaceState(window.history.state, "", url);
  };
  return [month, selectMonth] as const;
}

export function usePayrollHistory(monthKey: string, runId?: string, includeTemplates = false) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ key: string; data: PayrollHistory | null; error: string | null } | null>(null);
  const key = `${monthKey}:${runId ?? "latest"}:${version}:${includeTemplates}`;
  useEffect(() => {
    let active = true;
    void loadPayrollHistory(supabase, monthKey, runId, includeTemplates).then(
      (data) => { if (active) setState({ key, data, error: null }); },
      (error) => { if (active) setState({ key, data: null, error: payrollHistoryError(error) }); },
    );
    return () => { active = false; };
  }, [key, monthKey, runId, includeTemplates]);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);
  const current = state?.key === key ? state : null;
  return { data: current?.data ?? null, loading: !current, error: current?.error ?? null, refresh,
    // Retain option metadata while a different month is loading.
    periods: state?.data?.periods ?? [] };
}
