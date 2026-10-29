"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Save, Settings2, X } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { INTERNAL_OPTION_TABLES, internalOptionsError, type InternalDocumentOption, type InternalOptionKind } from "@/lib/internal-document-options";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import { PRODUCTION_COLLARS_MIGRATION } from "@/lib/production-collars";
import { useRef } from "react";

const control = "mt-1 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5 text-sm disabled:opacity-50";
export function InternalOptionManager({ kind }: { kind: InternalOptionKind }) {
  const isCollar = kind === "collars";
  const isProductionCollar = kind === "production-collars";
  const title = isCollar ? "ລາຍການຄໍເສື້ອບວກເພີ່ມ" : isProductionCollar ? "ເພີ່ມຄໍເສື້ອ" : "ປະເພດງານ";
  const migration = isProductionCollar ? PRODUCTION_COLLARS_MIGRATION : undefined;
  const table = INTERNAL_OPTION_TABLES[kind];
  const [rows, setRows] = useState<InternalDocumentOption[]>([]);
  const [draft, setDraft] = useState<(InternalDocumentOption & { editing?: boolean }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState("");
  const pageRef = useRef<HTMLDivElement | null>(null);
  const { markClean } = useUnsavedChangesGuard({ scopeRef: pageRef, enabled: !!draft });
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [result, permission] = await Promise.all([
      supabase.from(table).select(isCollar ? "code,label,unit_price,sort_order,is_active" : "code,label,sort_order,is_active").order("sort_order").order("code").returns<InternalDocumentOption[]>(),
      supabase.rpc("can_manage_internal_document_options", { p_kind: kind }),
    ]);
    if (result.error || permission.error) setError(internalOptionsError((result.error || permission.error)!, migration));
    else setRows(result.data || []);
    setCanEdit(!permission.error && permission.data === true);
    setLoading(false);
  }, [table, isCollar, kind, migration]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  const patch = (fields: Partial<InternalDocumentOption>) => setDraft(current => current ? { ...current, ...fields } : null);
  async function save() {
    if (!draft || saving || !canEdit) return;
    if (!/^[a-z][a-z0-9_-]{0,59}$/.test(draft.code)) return toast.error("ລະຫັດໃຊ້ a–z, 0–9, _ ແລະ - ບໍ່ເກີນ 60 ຕົວ");
    if (!draft.label.trim()) return toast.error("ກະລຸນາປ້ອນຊື່ລາຍການ");
    if (!Number.isInteger(draft.sort_order) || Math.abs(draft.sort_order) > 2147483647) return toast.error("ລຳດັບຕ້ອງເປັນຈຳນວນເຕັມທີ່ຖືກຕ້ອງ");
    if (isCollar && (!Number.isFinite(draft.unit_price) || Number(draft.unit_price) < 0 || Number(draft.unit_price) > 999999999999.99 || Math.abs(Number(draft.unit_price) * 100 - Math.round(Number(draft.unit_price) * 100)) > 0.001)) return toast.error("ກະລຸນາປ້ອນລາຄາຄໍເສື້ອໃຫ້ຖືກຕ້ອງ");
    setSaving(true);
    const fields = { label: draft.label.trim(), sort_order: draft.sort_order, is_active: draft.is_active, ...(isCollar ? { unit_price: draft.code === "none" ? 0 : draft.unit_price } : {}) };
    const result = draft.editing
      ? await supabase.from(table).update(fields).eq("code", draft.code).select("code").single()
      : await supabase.from(table).insert({ code: draft.code, ...fields }).select("code").single();
    setSaving(false);
    if (result.error) return toast.error(result.error.code === "23505" ? "ລະຫັດນີ້ມີແລ້ວ" : internalOptionsError(result.error, migration));
    markClean(); setDraft(null); toast.success("ບັນທຶກລາຍການແລ້ວ"); await load();
  }
  return <div ref={pageRef} className="space-y-5 text-[var(--theme-foreground)]">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><Settings2 size={24}/>{title}</h1><p className="mt-2 text-sm text-[var(--theme-muted)]">{isProductionCollar ? "ຈັດການຄໍເສື້ອຂອງແຕ່ລະແບບ mockup ໃນໃບມັດຈຳສັ່ງຜະລິດ" : "ຕັ້ງຄ່າສຳລັບໃບປະເມີນລາຄາ ແລະ ໃບມັດຈຳສັ່ງຜະລິດ"}</p></div><button disabled={!canEdit || loading || !!error || saving || !!draft} onClick={() => setDraft({ code: "", label: "", unit_price: 0, sort_order: 100, is_active: true })} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Plus size={16}/>{isCollar || isProductionCollar ? "ເພີ່ມຄໍເສື້ອ" : "ເພີ່ມປະເພດງານ"}</button></header>
    <nav aria-label="ຕັ້ງຄ່າເອກະສານ" className="flex flex-wrap gap-2">{[["collars", "ລາຍການຄໍເສື້ອບວກເພີ່ມ"], ["production-collars", "ເພີ່ມຄໍເສື້ອ"], ["work-categories", "ປະເພດງານ"]].map(([key, label]) => <Link key={key} href={`/settings/${key}`} aria-current={kind === key ? "page" : undefined} className={`rounded-xl border px-4 py-2 text-sm ${kind === key ? "bg-blue-600 font-bold text-white" : ""}`}>{label}</Link>)}</nav>
    {error && <div role="alert" className="rounded-xl border border-rose-300 p-4 text-sm text-rose-600">{error}<button className="ml-3 underline" onClick={() => void load()}>ລອງໃໝ່</button></div>}
    {draft && <section aria-label={draft.editing ? "ແກ້ໄຂລາຍການ" : "ເພີ່ມລາຍການ"} className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5"><h2 className="mb-4 font-bold">{draft.editing ? "ແກ້ໄຂລາຍການ" : "ເພີ່ມລາຍການ"}</h2><fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">ລະຫັດ<input aria-label="ລະຫັດ" value={draft.code} readOnly={draft.editing} maxLength={60} onChange={event => patch({ code: event.target.value.toLowerCase().trim() })} className={`${control} read-only:opacity-50`} placeholder={isCollar ? "zip_collar" : isProductionCollar ? "split_neck" : "cycling"}/></label><label className="text-sm font-bold">ຊື່ລາຍການ<input aria-label="ຊື່ລາຍການ" maxLength={200} value={draft.label} onChange={event => patch({ label: event.target.value })} className={control}/></label>{isCollar && <label className="text-sm font-bold">ຄ່າບວກຄໍ (ກີບ/ໂຕ)<input aria-label="ຄ່າບວກຄໍ (ກີບ/ໂຕ)" type="number" min="0" max="999999999999.99" step="0.01" disabled={draft.code === "none"} value={draft.unit_price ?? 0} onChange={event => patch({ unit_price: Number(event.target.value) })} className={control}/></label>}<label className="text-sm font-bold">ລຳດັບ<input aria-label="ລຳດັບ" type="number" step="1" min="-2147483647" max="2147483647" value={draft.sort_order} onChange={event => patch({ sort_order: Number(event.target.value) })} className={control}/></label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.is_active} disabled={(isCollar && draft.code === "none") || (isProductionCollar && draft.code === "crew")} onChange={event => patch({ is_active: event.target.checked })}/>ເປີດໃຊ້ງານ</label></fieldset><footer className="mt-5 flex flex-wrap justify-end gap-2"><button disabled={saving} onClick={() => { markClean(); setDraft(null); }} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm"><X size={16}/>ຍົກເລີກ</button><button disabled={saving || !canEdit} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><Save size={16}/>{saving ? "ກຳລັງບັນທຶກ…" : "ບັນທຶກ"}</button></footer></section>}
    {loading ? <p role="status">ກຳລັງໂຫຼດ…</p> : !error && <div className="space-y-3">{rows.map(row => <article key={row.code} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4"><div><h2 className="font-bold">{row.label}</h2><p className="mt-1 text-xs text-[var(--theme-muted)]">{row.code} · ລຳດັບ {row.sort_order} · {row.is_active ? "ເປີດໃຊ້ງານ" : "ປິດໃຊ້ງານ"}</p>{isCollar && <p className="mt-2 font-bold text-blue-600">+{Number(row.unit_price).toLocaleString()} ກີບ/ໂຕ</p>}</div><button disabled={!canEdit || saving || !!draft} aria-label={`ແກ້ໄຂ ${row.code}`} onClick={() => setDraft({ ...row, editing: true })} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm disabled:opacity-40"><Pencil size={16}/>ແກ້ໄຂ</button></article>)}{!rows.length && <p className="rounded-xl border border-dashed p-8 text-center">ຍັງບໍ່ມີລາຍການ</p>}</div>}
  </div>;
}
