"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_PRODUCTION_COLLARS, PRODUCTION_COLLARS_MIGRATION } from "@/lib/production-collars";
import type { InternalDocumentOption } from "@/lib/internal-document-options";

export function useProductionCollars() {
  const [options, setOptions] = useState<InternalDocumentOption[]>(DEFAULT_PRODUCTION_COLLARS);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void supabase.from("internal_production_collar_types").select("code,label,sort_order,is_active").order("sort_order").order("code").then(result => {
      if (!active) return;
      if (result.error) setError(["42P01", "PGRST205"].includes(result.error.code)
        ? `ກະລຸນາລັນ ${PRODUCTION_COLLARS_MIGRATION} ໃນ Supabase SQL Editor ກ່ອນ`
        : result.error.message);
      else setOptions((result.data ?? []) as InternalDocumentOption[]);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);
  return { options, error, loading };
}
