"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ORDER_TYPES, normalizeOrderType } from "@/lib/order-code";

export type OrderCodeTypeRow = {
  id: string;
  code: string;
  label: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

function buildFallbackRows() {
  return ORDER_TYPES.map((code, index) => ({
    id: `fallback-${code}`,
    code,
    label: null,
    sort_order: index + 1,
    is_active: true,
    is_system: true,
    created_at: "",
    updated_at: "",
  })) satisfies OrderCodeTypeRow[];
}

export function mergeOrderTypeOptions(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const normalized = normalizeOrderType(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

export async function fetchOrderCodeTypes(activeOnly = false) {
  let query = supabase
    .from("order_code_types")
    .select("id,code,label,sort_order,is_active,is_system,created_at,updated_at")
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    if (error.message.includes("Could not find the table")) {
      return activeOnly ? buildFallbackRows().filter((row) => row.is_active) : buildFallbackRows();
    }
    throw error;
  }

  const rows = ((data ?? []) as OrderCodeTypeRow[]).map((row) => ({
    ...row,
    code: normalizeOrderType(row.code),
  }));

  if (rows.length === 0) {
    return activeOnly ? buildFallbackRows().filter((row) => row.is_active) : buildFallbackRows();
  }

  return rows;
}

export async function fetchOrderTypeOptions(activeOnly = true) {
  const rows = await fetchOrderCodeTypes(activeOnly);
  return mergeOrderTypeOptions(rows.map((row) => row.code));
}

export function useOrderTypeOptions(activeOnly = true) {
  const [options, setOptions] = useState<string[]>([...ORDER_TYPES]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const nextOptions = await fetchOrderTypeOptions(activeOnly);
        if (!mounted) return;
        setOptions(nextOptions);
        setError(null);
      } catch (error) {
        if (!mounted) return;
        setOptions(mergeOrderTypeOptions([...ORDER_TYPES]));
        setError(error instanceof Error ? error.message : "load_failed");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [activeOnly]);

  return { options, loading, error };
}
