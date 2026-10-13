"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Tags } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { SHIRT_CATEGORIES, type StorefrontCategory } from "@/lib/shirt-catalog";
import { CatalogDialog } from "./catalog-dialog";

const control = "w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5 text-sm";
type CategoryDraft = StorefrontCategory & { editing?: boolean };

export function CategoryManager({ canEdit, onChanged }: { canEdit: boolean; onChanged: () => Promise<void> }) {
  const [categories, setCategories] = useState<StorefrontCategory[]>([]);
  const [draft, setDraft] = useState<CategoryDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const result = await supabase.from("storefront_categories").select("id,lo,en,icon,sort_order").order("sort_order").order("lo").order("id");
    if (result.error) setError(["42P01", "PGRST205"].includes(result.error.code) ? "ກະລຸນາລັນ 20261014_create_storefront_categories.sql ໃນ Supabase SQL Editor ກ່ອນ" : result.error.message);
    else setCategories((result.data ?? []) as StorefrontCategory[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const patch = (fields: Partial<CategoryDraft>) => setDraft(current => current ? { ...current, ...fields } : null);
  async function save() {
    if (!draft || !canEdit || saving) return;
    const id = draft.id.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{0,59}$/.test(id) || id === "all") return toast.error("ລະຫັດໃຊ້ a–z, 0–9 ແລະ - ບໍ່ເກີນ 60 ຕົວ; ບໍ່ໃຊ້ all");
    if (!draft.lo.trim()) return toast.error("ກະລຸນາໃສ່ຊື່ປະເພດງານ");
    if (!Number.isInteger(draft.sort_order) || draft.sort_order < -2147483648 || draft.sort_order > 2147483647) return toast.error("ລຳດັບຕ້ອງເປັນຈຳນວນເຕັມທີ່ຖືກຕ້ອງ");
    setSaving(true);
    const fields = { lo: draft.lo.trim(), en: draft.en.trim(), icon: draft.icon, sort_order: draft.sort_order };
    const result = draft.editing ? await supabase.from("storefront_categories").update(fields).eq("id", draft.id).select("id").single()
      : await supabase.from("storefront_categories").insert({ id, ...fields }).select("id").single();
    if (result.error) { setSaving(false); toast.error(result.error.code === "23505" ? "ລະຫັດປະເພດນີ້ມີແລ້ວ" : result.error.message); return; }
    toast.success("ບັນທຶກປະເພດງານແລ້ວ"); await load(); await onChanged(); setDraft(null); setSaving(false);
  }
  async function remove(category: StorefrontCategory) {
    if (!canEdit || saving || !window.confirm(`ລົບປະເພດງານ “${category.lo}”?`)) return;
    setSaving(true);
    const result = await supabase.from("storefront_categories").delete().eq("id", category.id).select("id").single();
    if (result.error) toast.error(result.error.code === "23503" ? "ປະເພດນີ້ມີແບບເສື້ອໃຊ້ຢູ່. ປ່ຽນປະເພດຂອງແບບເຫຼົ່ານັ້ນກ່ອນລົບ." : result.error.message);
    else { toast.success("ລົບປະເພດງານແລ້ວ"); await load(); await onChanged(); }
    setSaving(false);
  }
  return <section className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-bold"><Tags size={20}/>ຈັດການປະເພດງານ</h2><p className="mt-1 text-sm text-[var(--theme-muted)]">ເພີ່ມປະເພດງານຂອງຮ້ານ ແລະ ຈັດລຳດັບທີ່ສະແດງໃນເວັບ. ລຳດັບນ້ອຍສະແດງກ່ອນ.</p></div><button disabled={!canEdit || loading || saving || !!error} onClick={() => setDraft({ id: "", lo: "", en: "", icon: "teamwear", sort_order: categories.length ? Math.min(2147483647, Math.max(...categories.map(c => c.sort_order)) + 10) : 10 })} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2 font-bold text-black disabled:opacity-40"><Plus size={16}/>ເພີ່ມປະເພດງານ</button></header>
    {error && <div role="alert" className="rounded-xl border border-amber-300 p-4 text-sm">{error}<button className="ml-4 underline" onClick={() => void load()}>ລອງໃໝ່</button></div>}
    {loading ? <p>ກຳລັງໂຫຼດ…</p> : <div className="space-y-3">{categories.map(category => <article key={category.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4"><div><h3 className="font-bold">{category.lo}</h3><p className="text-sm text-[var(--theme-muted)]">{category.en || category.lo}</p><p className="mt-1 text-xs text-[var(--theme-muted)]">{category.id} · ລຳດັບ {category.sort_order}</p></div><div className="flex gap-2"><button disabled={!canEdit || saving} aria-label={`ແກ້ໄຂປະເພດ ${category.id}`} onClick={() => setDraft({ ...category, editing: true })} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-40"><Pencil size={16}/>ແກ້ໄຂ</button><button disabled={!canEdit || saving} aria-label={`ລົບປະເພດ ${category.id}`} onClick={() => void remove(category)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-red-500 disabled:opacity-40"><Trash2 size={16}/>ລົບ</button></div></article>)}</div>}
    {!loading && !error && !categories.length && <p className="rounded-xl border border-dashed p-8 text-center">ຍັງບໍ່ມີປະເພດງານ. ເພີ່ມປະເພດທຳອິດເພື່ອໃຊ້ກັບແບບເສື້ອ.</p>}
    {draft && <CatalogDialog label="ຈັດການປະເພດງານ" busy={saving} onClose={() => setDraft(null)} width="max-w-xl"><section className="flex max-h-[95dvh] flex-col overflow-hidden rounded-2xl bg-[var(--theme-surface)] text-[var(--theme-foreground)]"><header className="flex justify-between border-b p-4"><h2 className="font-bold">{draft.editing ? "ແກ້ໄຂປະເພດງານ" : "ເພີ່ມປະເພດງານ"}</h2><button disabled={saving} aria-label="ປິດ" onClick={() => setDraft(null)}>✕</button></header><fieldset disabled={saving} className="grid gap-4 overflow-auto p-5"><label className="space-y-1 text-sm">ລະຫັດປະເພດ *<input aria-label="ລະຫັດປະເພດ" className={`${control} read-only:opacity-60`} maxLength={60} readOnly={draft.editing} value={draft.id} onChange={e => patch({ id: e.target.value.toLowerCase() })} placeholder="running, cycling, school"/><span className="block text-xs text-[var(--theme-muted)]">ລະຫັດໃຊ້ໃນລິ້ງປະເພດ ແລະ ການຈັດກຸ່ມແບບເສື້ອ</span></label><label className="space-y-1 text-sm">ຊື່ປະເພດ (ລາວ) *<input className={control} maxLength={200} value={draft.lo} onChange={e => patch({ lo: e.target.value })}/></label><label className="space-y-1 text-sm">ຊື່ປະເພດ (English)<input className={control} maxLength={200} value={draft.en} onChange={e => patch({ en: e.target.value })}/></label><label className="space-y-1 text-sm">ໄອຄອນ<select className={control} value={draft.icon} onChange={e => patch({ icon: e.target.value })}>{SHIRT_CATEGORIES.map(icon => <option key={icon.id} value={icon.id}>{icon.lo}</option>)}</select></label><label className="space-y-1 text-sm">ລຳດັບປະເພດ<input className={control} type="number" step="1" min={-2147483648} max={2147483647} value={draft.sort_order} onChange={e => patch({ sort_order: Number(e.target.value) })}/></label></fieldset><footer className="flex justify-end gap-3 border-t p-4"><button disabled={saving} className="rounded-xl border px-4 py-2" onClick={() => setDraft(null)}>ຍົກເລີກ</button><button disabled={saving || !canEdit} className="rounded-xl bg-amber-300 px-5 py-2 font-bold text-black disabled:opacity-40" onClick={() => void save()}>{saving ? "ກຳລັງບັນທຶກ…" : "ບັນທຶກປະເພດ"}</button></footer></section></CatalogDialog>}
  </section>;
}
