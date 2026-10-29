"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_INTERNAL_COLLARS, DEFAULT_INTERNAL_WORK_CATEGORIES, internalOptionsError, type InternalDocumentOption } from "@/lib/internal-document-options";

export function useInternalDocumentOptions(enabled = true) {
  const [collars, setCollars] = useState<InternalDocumentOption[]>(DEFAULT_INTERNAL_COLLARS);
  const [workCategories, setWorkCategories] = useState<InternalDocumentOption[]>(DEFAULT_INTERNAL_WORK_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const results = await Promise.all([
      supabase.from("internal_collar_types").select("code,label,unit_price,sort_order,is_active").order("sort_order").order("code"),
      supabase.from("internal_work_categories").select("code,label,sort_order,is_active").order("sort_order").order("code"),
    ]);
    const failure = results.find(result => result.error)?.error;
    if (failure) setError(internalOptionsError(failure));
    else {
      setError("");
      setCollars((results[0].data ?? []) as InternalDocumentOption[]);
      setWorkCategories((results[1].data ?? []) as InternalDocumentOption[]);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const timer = setTimeout(() => { if (active) void load(); }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [load, enabled]);
  return { collars, workCategories, loading, error, reload: load };
}
