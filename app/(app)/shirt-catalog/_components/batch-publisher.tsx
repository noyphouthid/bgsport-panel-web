"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import { CatalogDialog } from "./catalog-dialog";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { type StorefrontCategory, LIBRARY_SELECT, isPublicImageUrl, type LibraryImage, type ShirtCatalogEntry, type CatalogImage, type ShirtCategory } from "@/lib/shirt-catalog";
import { buildDesignQueueOrderCode } from "@/lib/design-queue-media";
const control = "w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm";
const codeOf = (image: LibraryImage) => image.queue?.order_no ? buildDesignQueueOrderCode(image.queue) : "";
type Group = { design_code: string; name_lo: string; name_en: string; category: ShirtCategory; placement: ShirtCatalogEntry["placement"]; images: CatalogImage[] };
export function BatchPublisher({ categories, entries, onClose, onSaved }: { categories: StorefrontCategory[]; entries: ShirtCatalogEntry[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [category, setCategory] = useState<ShirtCategory>(categories[0]?.id ?? "");
  const [placement, setPlacement] = useState<ShirtCatalogEntry["placement"]>("catalog");
  async function load(offset = 0) {
    setLoading(true);
    const result = await supabase.from("design_queue_mockups").select(LIBRARY_SELECT).order("uploaded_at", { ascending: false }).order("id").range(offset, offset + 119).returns<LibraryImage[]>();
    if (result.error) toast.error(result.error.message);
    else { setLibrary(current => offset ? [...current, ...(result.data ?? [])] : result.data ?? []); setHasMore(result.data?.length === 120); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => library.filter(row => row.file_url && isPublicImageUrl(row.file_url) && codeOf(row) && `${codeOf(row)} ${row.file_name}`.toLowerCase().includes(query.trim().toLowerCase())), [library, query]);
  async function prepare() {
    setLoading(true);
    try {
      const grouped = new Map<string, LibraryImage[]>();
      for (const row of library.filter(row => selected.includes(row.id))) {
        const code = codeOf(row); grouped.set(code, [...(grouped.get(code) ?? []), row]);
      }
      if (!grouped.size || grouped.size > 100) throw new Error("ເລືອກ 1–100 ແບບຕໍ່ຄັ້ງ");
      // Fetch selected codes even when the management list is paginated.
      const existing = await supabase.from("shirt_catalog_entries").select("*").in("design_code", [...grouped.keys()]);
      if (existing.error) throw existing.error;
      const byCode = new Map([...entries, ...(existing.data ?? []) as ShirtCatalogEntry[]].map(row => [row.design_code, row]));
      const prepared = [...grouped].map(([code, media]): Group => {
        const old = byCode.get(code);
        const images = [...(old?.images ?? [])];
        for (const item of media) if (!images.some(image => image.mockup_id === item.id || image.url === item.file_url)) images.push({ url: item.file_url!, path: item.file_path, bucket: "order-media", mockup_id: item.id, queue_entry_id: item.queue_entry_id, order_code: code, name: item.file_name });
        if (images.length > 12) throw new Error(`${code}: ເພີ່ມໄດ້ສູງສຸດ 12 ຮູບຕໍ່ແບບ`);
        return { design_code: code, name_lo: old?.name_lo || code, name_en: old?.name_en || "", category: old?.category || category, placement: old?.placement || placement, images };
      });
      setGroups(prepared);
    } catch (error) { toast.error(error instanceof Error ? error.message : "ບໍ່ສາມາດຈັດກຸ່ມໄດ້"); }
    finally { setLoading(false); }
  }
  async function publish() {
    if (!groups || saving) return;
    if (groups.some(group => !categories.some(category => category.id === group.category))) return toast.error("ກະລຸນາເລືອກປະເພດງານທີ່ມີຢູ່");
    if (groups.some(group => !group.name_lo.trim())) return toast.error("ກະລຸນາໃສ່ຊື່ແຕ່ລະແບບ");
    setSaving(true);
    const result = await supabase.rpc("publish_shirt_catalog_batch", { p_entries: groups });
    setSaving(false);
    if (result.error) toast.error(result.error.code === "PGRST202" ? "ກະລຸນາຕິດຕັ້ງ 20261013_storefront_management.sql ກ່ອນ" : result.error.message);
    else { toast.success(`ເຜີຍແຜ່ ${groups.length} ແບບແລ້ວ`); await onSaved(); }
  }
  return <CatalogDialog label="ເຜີຍແຜ່ເປັນກຸ່ມ" busy={saving || loading} onClose={onClose} width="max-w-5xl"><section className="flex max-h-[95dvh] w-full max-w-5xl flex-col rounded-2xl bg-[var(--theme-surface)] text-[var(--theme-foreground)]"><header className="flex justify-between border-b p-4"><h2 className="font-bold">ເລືອກຮູບເຜີຍແຜ່ເປັນກຸ່ມ</h2><button disabled={saving || loading} onClick={onClose} aria-label="ປິດ">✕</button></header><div className="space-y-4 overflow-auto p-5">
    {!groups ? <><input aria-label="ຄົ້ນຫາຮູບເປັນກຸ່ມ" className={control} placeholder="ຄົ້ນຫາລະຫັດ ຫຼື ຊື່ໄຟລ໌ໃນຮູບທີ່ໂຫຼດແລ້ວ" value={query} onChange={e => setQuery(e.target.value)}/><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={!!visible.length && visible.every(row => selected.includes(row.id))} onChange={e => setSelected(current => e.target.checked ? [...new Set([...current, ...visible.map(row => row.id)])] : current.filter(id => !visible.some(row => row.id === id)))}/>ເລືອກຮູບທີ່ສະແດງທັງໝົດ</label><span>{selected.length} ຮູບ</span><label>ປະເພດເລີ່ມຕົ້ນ<select className={control} value={category} onChange={e => setCategory(e.target.value as ShirtCategory)}>{categories.map(c => <option key={c.id} value={c.id}>{c.lo}</option>)}</select></label><label>ໜ້າທີ່ສະແດງ<select className={control} value={placement} onChange={e => setPlacement(e.target.value as Group["placement"])}><option value="catalog">Catalog</option><option value="store">Store</option><option value="both">Catalog + Store</option></select></label></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{visible.map(row => <label key={row.id} className={`relative cursor-pointer overflow-hidden rounded-xl border ${selected.includes(row.id) ? "ring-2 ring-amber-400" : ""}`}><input type="checkbox" className="absolute left-2 top-2" aria-label={`ເລືອກຮູບ ${row.file_name}`} checked={selected.includes(row.id)} onChange={e => setSelected(current => e.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))}/><img src={row.file_url!} alt={row.file_name} loading="lazy" className="aspect-square w-full object-contain"/><strong className="block px-2 text-xs">{codeOf(row)}</strong><span className="block truncate px-2 pb-2 text-xs">{row.file_name}</span></label>)}</div>{loading && <p>ກຳລັງໂຫຼດ…</p>}{!loading && !visible.length && <p>ບໍ່ພົບຮູບ</p>}{hasMore && <button disabled={loading} className="rounded-xl border px-4 py-2" onClick={() => void load(library.length)}>ໂຫຼດຮູບເພີ່ມ</button>}</> : <><p className="text-sm">{groups.length} ແບບ · ຮູບລະຫັດດຽວກັນຈັດເປັນກຸ່ມ. ລາຍການທີ່ມີແລ້ວຈະເພີ່ມຮູບເຂົ້າແບບເດີມ.</p>{groups.map((group, index) => <div key={group.design_code} className="grid items-start gap-3 rounded-xl border p-3 sm:grid-cols-[100px_1fr_170px]"><img src={group.images[0]?.url} alt={group.design_code} className="aspect-square object-contain"/><div className="space-y-2"><strong>{group.design_code} · {group.images.length} ຮູບ</strong><input aria-label={`ຊື່ ${group.design_code}`} maxLength={200} className={control} value={group.name_lo} disabled={saving} onChange={e => setGroups(current => current!.map((g, i) => i === index ? { ...g, name_lo: e.target.value } : g))}/><input aria-label={`English ${group.design_code}`} maxLength={200} className={control} placeholder="ຊື່ English" value={group.name_en} disabled={saving} onChange={e => setGroups(current => current!.map((g, i) => i === index ? { ...g, name_en: e.target.value } : g))}/></div><div className="space-y-2"><select aria-label={`ປະເພດ ${group.design_code}`} className={control} value={group.category} disabled={saving} onChange={e => setGroups(current => current!.map((g, i) => i === index ? { ...g, category: e.target.value as ShirtCategory } : g))}>{categories.map(c => <option key={c.id} value={c.id}>{c.lo}</option>)}</select><select aria-label={`ໜ້າ ${group.design_code}`} className={control} value={group.placement} disabled={saving} onChange={e => setGroups(current => current!.map((g, i) => i === index ? { ...g, placement: e.target.value as Group["placement"] } : g))}><option value="catalog">Catalog</option><option value="store">Store</option><option value="both">Catalog + Store</option></select></div></div>)}</>}
  </div><footer className="flex justify-end gap-3 border-t p-4"><button disabled={saving || loading} onClick={() => groups ? setGroups(null) : onClose()} className="rounded-xl border px-4 py-2">{groups ? "ກັບໄປເລືອກຮູບ" : "ຍົກເລີກ"}</button><button disabled={saving || loading || (!groups && !selected.length)} onClick={() => void (groups ? publish() : prepare())} className="rounded-xl bg-amber-300 px-4 py-2 font-bold text-black disabled:opacity-40">{saving ? "ກຳລັງເຜີຍແຜ່…" : groups ? `ເຜີຍແຜ່ ${groups.length} ແບບ` : "ຕໍ່ໄປ: ຈັດກຸ່ມແລະປະເພດ"}</button></footer></section></CatalogDialog>;
}
