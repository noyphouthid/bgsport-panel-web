"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import { CatalogDialog } from "./catalog-dialog";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { LIBRARY_SELECT, STOREFRONT_FIELDS, isPublicImageUrl, type LibraryImage, type StorefrontContent, type StorefrontPromotion } from "@/lib/shirt-catalog";
import { resizeImageFileToFit } from "@/lib/client-image";
import { buildSafeStorageFileName } from "@/lib/order-media";
const control = "w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5 text-sm";
const fresh = (): StorefrontPromotion => ({ name_lo: "", name_en: "", caption_lo: "", caption_en: "", slogan_lo: "", slogan_en: "", images: [], link_url: "", sort_order: 0, is_published: false });
export function StorefrontManager({ section, canEdit }: { section: string; canEdit: boolean }) {
  const [content, setContent] = useState<StorefrontContent>({});
  const [promotions, setPromotions] = useState<StorefrontPromotion[]>([]);
  const [draft, setDraft] = useState<StorefrontPromotion | null>(null);
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const result = section === "content" ? await supabase.from("storefront_settings").select("content").eq("id", true).single() : await supabase.from("storefront_promotions").select("*").order("sort_order").order("created_at");
    if (result.error) setError(["42P01", "PGRST205"].includes(result.error.code) ? "ກະລຸນາຕິດຕັ້ງ 20261013_storefront_management.sql ກ່ອນ" : result.error.message);
    else if (section === "content") setContent((result.data as { content: StorefrontContent }).content);
    else setPromotions(result.data as StorefrontPromotion[]);
    setLoading(false);
  }, [section]);
  useEffect(() => { void load(); }, [load]);
  const patch = (value: Partial<StorefrontPromotion>) => setDraft(current => current ? { ...current, ...value } : null);
  async function loadLibrary(more = false) {
    setLibraryLoading(true);
    const offset = more ? library.length : 0;
    const result = await supabase.from("design_queue_mockups").select(LIBRARY_SELECT).order("uploaded_at", { ascending: false }).order("id").range(offset, offset + 119).returns<LibraryImage[]>();
    if (result.error) toast.error(result.error.message);
    else { setLibrary(current => more ? [...current, ...(result.data ?? [])] : result.data ?? []); setHasMore(result.data?.length === 120); }
    setLibraryLoading(false);
  }
  async function saveContent() {
    if (!canEdit || saving) return;
    setSaving(true);
    const result = await supabase.from("storefront_settings").update({ content }).eq("id", true).select("id").single();
    setSaving(false);
    if (result.error) toast.error(result.error.message); else toast.success("ບັນທຶກຂໍ້ຄວາມຮ້ານແລ້ວ");
  }
  async function savePromotion() {
    if (!draft || !canEdit || saving || uploading) return;
    if (!draft.name_lo.trim() || draft.images.length !== 1) return toast.error("ກະລຸນາໃສ່ຊື່ ແລະ ຮູບໂປຣໂມຊັນ");
    if (draft.link_url && !/^\/(?!\/)/.test(draft.link_url) && !isPublicImageUrl(draft.link_url)) return toast.error("ລິ້ງຕ້ອງເປັນ /catalog/ ຫຼື HTTPS");
    if (!Number.isInteger(draft.sort_order)) return toast.error("ລຳດັບຕ້ອງເປັນຈຳນວນເຕັມ");
    setSaving(true);
    const { id, ...fields } = draft;
    // Limit payload to editable fields when editing a row returned with timestamps.
    const payload = { name_lo: fields.name_lo.trim(), name_en: fields.name_en, caption_lo: fields.caption_lo, caption_en: fields.caption_en, slogan_lo: fields.slogan_lo, slogan_en: fields.slogan_en, images: fields.images, link_url: fields.link_url, sort_order: fields.sort_order, is_published: fields.is_published };
    const result = id ? await supabase.from("storefront_promotions").update(payload).eq("id", id).select("id").single() : await supabase.from("storefront_promotions").insert(payload).select("id").single();
    setSaving(false);
    if (result.error) toast.error(result.error.message); else { toast.success("ບັນທຶກໂປຣໂມຊັນແລ້ວ"); setDraft(null); await load(); }
  }
  async function remove(row: StorefrontPromotion) {
    if (!canEdit || saving || !window.confirm(`ລົບໂປຣໂມຊັນ ${row.name_lo}?`)) return;
    setSaving(true);
    const result = await supabase.from("storefront_promotions").delete().eq("id", row.id!).select("id").single();
    setSaving(false);
    if (result.error) toast.error(result.error.message); else { toast.success("ລົບແລ້ວ"); await load(); }
  }
  async function upload(file?: File) {
    if (!file || !canEdit || !draft || uploading) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) return toast.error("ໃຊ້ JPG, PNG ຫຼື WebP ບໍ່ເກີນ 15 MB");
    setUploading(true);
    try {
      const resized = await resizeImageFileToFit(file, 2024, 2024);
      const path = `promotions/${buildSafeStorageFileName(resized.file.name, "promotion")}`;
      const result = await supabase.storage.from("shirt-catalog").upload(path, resized.file, { contentType: resized.mimeType });
      if (result.error) throw result.error;
      patch({ images: [{ url: supabase.storage.from("shirt-catalog").getPublicUrl(path).data.publicUrl, bucket: "shirt-catalog", path, name: file.name }] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "ອັບໂຫຼດບໍ່ສຳເລັດ"); }
    finally { setUploading(false); }
  }
  if (loading) return <p>ກຳລັງໂຫຼດ…</p>;
  if (error) return <div role="alert" className="rounded-xl border p-4">{error}<button className="ml-4 underline" onClick={() => void load()}>ລອງໃໝ່</button></div>;
  if (section === "content") return <section className="space-y-5 rounded-2xl border p-5"><h2 className="text-lg font-bold">ປັບແຕ່ງຂໍ້ຄວາມໜ້າຮ້ານ</h2><p className="text-sm text-[var(--theme-muted)]">ຂໍ້ຄວາມວ່າງຈະໃຊ້ຂໍ້ຄວາມເລີ່ມຕົ້ນ</p><fieldset disabled={!canEdit || saving} className="space-y-5">{STOREFRONT_FIELDS.map(field => <div key={field.key} className="grid gap-3 md:grid-cols-2">{(["lo", "en"] as const).map(language => <label key={language} className="space-y-1 text-sm">{field.label} ({language === "lo" ? "ລາວ" : "English"})<textarea rows={field.key.includes("Body") ? 3 : 2} maxLength={5000} className={control} placeholder={language === "lo" ? field.defaultLo : field.defaultEn} value={content[field.key]?.[language] ?? ""} onChange={e => setContent(current => ({ ...current, [field.key]: { ...current[field.key], [language]: e.target.value } }))}/></label>)}</div>)}</fieldset><button disabled={!canEdit || saving} onClick={() => void saveContent()} className="rounded-xl bg-amber-300 px-5 py-2 font-bold text-black disabled:opacity-40">{saving ? "ກຳລັງບັນທຶກ…" : "ບັນທຶກຂໍ້ຄວາມ"}</button></section>;
  return <section className="space-y-5"><header className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-bold">ສະໄລດ໌ໂປຣໂມຊັນໜ້າຫຼັກ</h2><p className="text-sm text-[var(--theme-muted)]">ຮູບໂປຣໂມຊັນເລື່ອນທຸກ 6 ວິນາທີ. ລຳດັບນ້ອຍສະແດງກ່ອນ.</p></div><button disabled={!canEdit || saving} className="rounded-xl bg-amber-300 px-4 py-2 font-bold text-black disabled:opacity-40" onClick={() => { setDraft(fresh()); setPickerOpen(false); }}>ເພີ່ມໂປຣໂມຊັນ</button></header><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{promotions.map(row => <article key={row.id} className="overflow-hidden rounded-2xl border"><img src={row.images[0]?.url} alt={row.name_lo} className="aspect-[4/3] bg-[var(--theme-surface-muted)] object-contain"/><div className="space-y-2 p-4"><h3 className="font-bold">{row.name_lo}</h3><p className="text-sm">{row.caption_lo}</p><p className="text-xs">{row.is_published ? "ເຜີຍແຜ່" : "ແບບຮ່າງ"} · ລຳດັບ {row.sort_order}</p><div className="flex gap-2"><button disabled={!canEdit || saving} onClick={() => { setDraft(row); setPickerOpen(false); }} className="rounded-lg border px-3 py-2">ແກ້ໄຂ</button><button disabled={!canEdit || saving} onClick={() => void remove(row)} className="rounded-lg border px-3 py-2 text-red-500">ລົບ</button></div></div></article>)}</div>{!promotions.length && <p className="rounded-xl border border-dashed p-8 text-center">ເພີ່ມຮູບໂປຣໂມຊັນທຳອິດ</p>}
    {draft && <CatalogDialog label="ຈັດການໂປຣໂມຊັນ" busy={saving || uploading} onClose={() => setDraft(null)} width="max-w-3xl"><section className="flex max-h-[95dvh] w-full max-w-3xl flex-col rounded-2xl bg-[var(--theme-surface)] text-[var(--theme-foreground)]"><header className="flex justify-between border-b p-4"><h2 className="font-bold">{draft.id ? "ແກ້ໄຂໂປຣໂມຊັນ" : "ເພີ່ມໂປຣໂມຊັນ"}</h2><button disabled={saving || uploading} onClick={() => setDraft(null)} aria-label="ປິດ">✕</button></header><div className="space-y-4 overflow-auto p-5"><fieldset disabled={saving || uploading} className="grid gap-3 sm:grid-cols-2">{([['name_lo','ຊື່ (ລາວ) *',200],['name_en','ຊື່ (English)',200],['caption_lo','ແຄັບຊັນ (ລາວ)',1000],['caption_en','ແຄັບຊັນ (English)',1000],['slogan_lo','ຄຳຂວັນ (ລາວ)',200],['slogan_en','ຄຳຂວັນ (English)',200]] as const).map(([key,label,max]) => <label key={key} className="space-y-1 text-sm">{label}<input maxLength={max} className={control} value={draft[key]} onChange={e => patch({ [key]: e.target.value })}/></label>)}<label className="space-y-1 text-sm">ລິ້ງເມື່ອກົດຮູບ<input className={control} placeholder="/catalog/" value={draft.link_url} onChange={e => patch({ link_url: e.target.value })}/></label><label className="space-y-1 text-sm">ລຳດັບ<input type="number" step="1" className={control} value={draft.sort_order} onChange={e => patch({ sort_order: Number(e.target.value) })}/></label></fieldset>{draft.images[0] && <img src={draft.images[0].url} alt={draft.name_lo} className="max-h-64 object-contain"/>}<div className="flex gap-3"><label className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${uploading || saving ? "pointer-events-none opacity-50" : ""}`}>{uploading ? "ກຳລັງອັບໂຫຼດ…" : "ອັບໂຫຼດຮູບໂປຣໂມຊັນ"}<input disabled={saving || uploading} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }}/></label><button disabled={saving || uploading} className="rounded-lg border px-3 py-2 text-sm" onClick={() => { setPickerOpen(!pickerOpen); if (!library.length) void loadLibrary(); }}>ເລືອກຈາກຄັງ</button></div>{pickerOpen && <div className="space-y-3 rounded-xl border p-3"><input aria-label="ຄົ້ນຫາຮູບໂປຣໂມຊັນ" className={control} placeholder="ຄົ້ນຫາຊື່ໄຟລ໌ໃນຮູບທີ່ໂຫຼດແລ້ວ" value={query} onChange={e => setQuery(e.target.value)}/><div className="grid max-h-64 grid-cols-3 gap-2 overflow-auto sm:grid-cols-5">{library.filter(row => row.file_url && isPublicImageUrl(row.file_url) && row.file_name.toLowerCase().includes(query.toLowerCase())).map(row => <button key={row.id} disabled={saving || uploading} onClick={() => { patch({ images: [{ url: row.file_url!, bucket: "order-media", path: row.file_path, mockup_id: row.id }] }); setPickerOpen(false); }} className="overflow-hidden rounded-lg border"><img src={row.file_url!} alt={row.file_name} className="aspect-square object-contain"/><span className="block truncate text-xs">{row.file_name}</span></button>)}</div>{libraryLoading && <p>ກຳລັງໂຫຼດ…</p>}{hasMore && <button disabled={libraryLoading} onClick={() => void loadLibrary(true)} className="rounded-lg border px-3 py-2">ໂຫຼດຮູບເພີ່ມ</button>}</div>}<label className="flex gap-2 text-sm"><input type="checkbox" disabled={saving || uploading} checked={draft.is_published} onChange={e => patch({ is_published: e.target.checked })}/>ເຜີຍແຜ່ໃນສະໄລດ໌ໜ້າຫຼັກ</label></div><footer className="flex justify-end gap-3 border-t p-4"><button disabled={saving || uploading} onClick={() => setDraft(null)} className="rounded-xl border px-4 py-2">ຍົກເລີກ</button><button disabled={saving || uploading || !canEdit} onClick={() => void savePromotion()} className="rounded-xl bg-amber-300 px-5 py-2 font-bold text-black disabled:opacity-40">{saving ? "ກຳລັງບັນທຶກ…" : "ບັນທຶກ"}</button></footer></section></CatalogDialog>}
  </section>;
}
