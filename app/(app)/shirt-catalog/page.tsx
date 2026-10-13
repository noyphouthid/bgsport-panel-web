"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Images, Plus, Save, Upload, X, Search, Eye, EyeOff, ExternalLink, Loader2, Trash2, ArrowLeft, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_STOREFRONT_CATEGORIES, type StorefrontCategory, LIBRARY_SELECT as librarySelect, type LibraryImage, isPublicImageUrl, type CatalogImage, type ShirtCatalogEntry } from "@/lib/shirt-catalog";
import { CatalogDialog } from "./_components/catalog-dialog";
import { CategoryManager } from "./_components/category-manager";
import { StorefrontManager } from "./_components/storefront-manager";
import { BatchPublisher } from "./_components/batch-publisher";
import { resizeImageFileToFit } from "@/lib/client-image";
import { buildSafeStorageFileName } from "@/lib/order-media";
import { buildDesignQueueOrderCode } from "@/lib/design-queue-media";


const sourceCode = (image: LibraryImage) => image.queue?.order_no ? buildDesignQueueOrderCode(image.queue) : "";
const sourceImage = (image: LibraryImage): CatalogImage => ({ url: image.file_url!, path: image.file_path, bucket: "order-media", mockup_id: image.id, queue_entry_id: image.queue_entry_id, order_code: sourceCode(image), name: image.file_name });
type Draft = Pick<ShirtCatalogEntry, "design_code" | "name_lo" | "name_en" | "description_lo" | "description_en" | "caption_lo" | "caption_en" | "slogan_lo" | "slogan_en" | "category" | "placement" | "images" | "is_published" | "is_featured"> & { id?: string; price: string };
const freshDraft = (category = "football"): Draft => ({ design_code: "", name_lo: "", name_en: "", description_lo: "", description_en: "", caption_lo: "", caption_en: "", slogan_lo: "", slogan_en: "", category, placement: "catalog", images: [], is_published: false, is_featured: false, price: "" });
const control = "w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5 text-sm text-[var(--theme-foreground)]";

export default function ShirtCatalogPage() {
  const [categories, setCategories] = useState<StorefrontCategory[]>(DEFAULT_STOREFRONT_CATEGORIES);
  const [tab, setTab] = useState("designs");
  const [batchOpen, setBatchOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [entries, setEntries] = useState<ShirtCatalogEntry[]>([]);
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [allEntriesLoaded, setAllEntriesLoaded] = useState(false);

  const loadCategories = useCallback(async () => {
    const result = await supabase.from("storefront_categories").select("id,lo,en,icon,sort_order").order("sort_order").order("lo").order("id");
    if (!result.error) {
      const rows = (result.data ?? []) as StorefrontCategory[];
      setCategories(rows);
      setSelectedCategories(current => current.filter(id => rows.some(row => row.id === id)));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [rows, permission] = await Promise.all([
      supabase.from("shirt_catalog_entries").select("*").order("created_at", { ascending: false }).range(0, 999),
      supabase.rpc("can_manage_shirt_catalog", { p_edit: true }),
    ]);
    if (rows.error) {
      setError(["PGRST205", "42P01", "PGRST202"].includes(rows.error.code)
        ? "ຕ້ອງເພີ່ມຕາຕະລາງໜ້າຮ້ານກ່ອນ: ນຳໄຟລ໌ 20261012_create_shirt_catalog.sql ໄປລັນໃນ Supabase SQL Editor."
        : rows.error.message);
    } else {
      setEntries((rows.data ?? []) as ShirtCatalogEntry[]);
      setSelectedEntries([]);
      setAllEntriesLoaded((rows.data?.length ?? 0) < 1000);
    }
    setCanEdit(permission.data === true && !permission.error);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); void loadCategories(); }, [load, loadCategories]);

  const loadLibrary = async (more = false) => {
    setLibraryLoading(true);
    const offset = more ? library.length : 0;
    const result = await supabase.from("design_queue_mockups")
      .select(librarySelect)
      .order("uploaded_at", { ascending: false }).order("id").range(offset, offset + 119).returns<LibraryImage[]>();
    if (result.error) toast.error(result.error.message);
    else {
      const rows = (result.data ?? []) as LibraryImage[];
      setLibrary(more ? [...library, ...rows] : rows);
      setLibraryHasMore(rows.length === 120);
    }
    setLibraryLoading(false);
  };

  useEffect(() => {
    if (!canEdit) return;
    const id = new URLSearchParams(window.location.search).get("mockup");
    if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return;
    let active = true;
    void supabase.from("design_queue_mockups").select(librarySelect).eq("id", id).returns<LibraryImage[]>().maybeSingle().then(({ data, error: sourceError }) => {
      if (!active) return;
      if (sourceError || !data?.file_url || !isPublicImageUrl(data.file_url)) { toast.error("ບໍ່ສາມາດເປີດຮູບນີ້ໄດ້"); return; }
      const code = sourceCode(data);
      if (!code) { toast.error("ບໍ່ພົບລະຫັດອໍເດີຂອງຮູບນີ້"); return; }
      setDraft({ ...freshDraft(categories[0]?.id), design_code: code, images: [sourceImage(data)] });
    });
    return () => { active = false; };
  }, [canEdit]);

  const visible = useMemo(() => entries.filter(row => {
    const match = `${row.design_code} ${row.name_lo} ${row.name_en}`.toLowerCase().includes(query.toLowerCase().trim());
    return match && (!selectedCategories.length || selectedCategories.includes(row.category)) && (status === "all" || row.is_published === (status === "published"));
  }), [entries, query, status, selectedCategories]);
  const patch = (value: Partial<Draft>) => setDraft(current => current ? { ...current, ...value } : current);
  const linkedOrderCode = draft?.images.find(image => image.mockup_id && image.order_code)?.order_code || "";

  const pickLibraryImage = (image: LibraryImage) => {
    if (!draft || !image.file_url) return;
    const code = sourceCode(image);
    if (!code) return toast.error("ບໍ່ພົບລະຫັດອໍເດີຂອງຮູບນີ້");
    if (linkedOrderCode && linkedOrderCode !== code) return toast.error("ໜຶ່ງແບບໃຊ້ຮູບຈາກລະຫັດອໍເດີດຽວກັນ. ເພີ່ມອໍເດີນີ້ເປັນແບບໃໝ່.");
    patch({ design_code: code, images: [...draft.images, sourceImage(image)] });
  };

  const editEntry = async (row: ShirtCatalogEntry) => {
    const sourceIds = [...new Set(row.images.map(image => image.mockup_id).filter((id): id is string => !!id))];
    let images = row.images;
    if (sourceIds.length) {
      const result = await supabase.from("design_queue_mockups").select(librarySelect).in("id", sourceIds).returns<LibraryImage[]>();
      if (result.error) return toast.error(result.error.message);
      const byId = new Map((result.data ?? []).map(image => [image.id, image]));
      images = row.images.map(image => image.mockup_id && byId.has(image.mockup_id) ? { ...image, ...sourceImage(byId.get(image.mockup_id)!) } : image);
    }
    const codes = [...new Set(images.filter(image => image.mockup_id).map(image => image.order_code).filter(Boolean))];
    if (codes.length > 1) return toast.error("ແບບນີ້ມີຮູບຈາກຫຼາຍອໍເດີ. ກະລຸນາແຍກເປັນແບບຕາມລະຫັດອໍເດີ.");
    const { price_lak, ...fields } = row;
    setDraft({ ...freshDraft(), ...fields, images, design_code: codes[0] || row.design_code, price: price_lak == null ? "" : String(price_lak) });
    setLibraryOpen(false);
  };

  const save = async () => {
    if (!draft || !canEdit || saving || uploading) return;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,59}$/.test(draft.design_code.trim())) return toast.error("ລະຫັດໃຊ້ A–Z, 0–9, - ຫຼື _ ຄວາມຍາວ 2–60 ຕົວ");
    if (!categories.some(category => category.id === draft.category)) return toast.error("ກະລຸນາເລືອກປະເພດງານທີ່ມີຢູ່");
    if (!draft.name_lo.trim()) return toast.error("ກະລຸນາໃສ່ຊື່ແບບ");
    if (draft.is_published && !draft.images.length) return toast.error("ເພີ່ມຮູບກ່ອນເຜີຍແຜ່");
    const price = draft.price.trim() ? Number(draft.price) : null;
    if (price !== null && (!Number.isFinite(price) || price <= 0)) return toast.error("ລາຄາຕ້ອງຫຼາຍກວ່າ 0");
    setSaving(true);
    const { id, price: ignoredPrice, ...fields } = draft;
    void ignoredPrice;
    const payload = { ...fields, design_code: (linkedOrderCode || fields.design_code).trim().toUpperCase(), name_lo: fields.name_lo.trim(), price_lak: price };
    const result = id ? await supabase.from("shirt_catalog_entries").update(payload).eq("id", id).select("id").single()
      : await supabase.from("shirt_catalog_entries").insert(payload).select("id").single();
    setSaving(false);
    if (result.error) { toast.error(result.error.code === "23505" ? "ລະຫັດແບບນີ້ມີແລ້ວ" : result.error.code === "PGRST204" ? "ກະລຸນາຕິດຕັ້ງ 20261013_storefront_management.sql ກ່ອນ" : result.error.message); return; }
    toast.success(draft.is_published ? "ເຜີຍແຜ່ແລ້ວ" : "ບັນທຶກແບບຮ່າງແລ້ວ");
    setDraft(null); setLibraryOpen(false); await load();
  };

  const upload = async (files: FileList | null) => {
    if (!files || !draft || !canEdit || uploading) return;
    if (draft.images.length + files.length > 12) return toast.error("ເພີ່ມໄດ້ສູງສຸດ 12 ຮູບ");
    setUploading(true);
    const added: CatalogImage[] = [];
    try {
      for (const source of Array.from(files)) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(source.type) || source.size > 15 * 1024 * 1024) throw new Error("ໃຊ້ JPG, PNG ຫຼື WebP ບໍ່ເກີນ 15 MB");
        const resized = await resizeImageFileToFit(source, 2024, 2024);
        const path = `designs/${buildSafeStorageFileName(resized.file.name, "catalog")}`;
        const result = await supabase.storage.from("shirt-catalog").upload(path, resized.file, { contentType: resized.mimeType, upsert: false });
        if (result.error) throw result.error;
        added.push({ url: supabase.storage.from("shirt-catalog").getPublicUrl(path).data.publicUrl, path, bucket: "shirt-catalog", name: source.name });
      }
    } catch (uploadError) { toast.error(uploadError instanceof Error ? uploadError.message : "ອັບໂຫຼດບໍ່ສຳເລັດ"); }
    finally {
      setDraft(current => current ? { ...current, images: [...current.images, ...added] } : current);
      setUploading(false);
    }
  };

  const togglePublished = async (row: ShirtCatalogEntry) => {
    if (!canEdit || saving) return;
    if (!row.is_published && !row.images.length) return toast.error("ເພີ່ມຮູບກ່ອນເຜີຍແຜ່");
    setSaving(true);
    const result = await supabase.from("shirt_catalog_entries").update({ is_published: !row.is_published }).eq("id", row.id).select("id").single();
    setSaving(false);
    if (result.error) toast.error(result.error.message);
    else { toast.success(row.is_published ? "ຊ່ອນແບບແລ້ວ" : "ເຜີຍແຜ່ແລ້ວ"); await load(); }
  };

  const deleteEntries = async (ids: string[]) => {
    if (!canEdit || saving || !ids.length) return;
    if (!window.confirm(`ລົບ ${ids.length} ແບບອອກຈາກໜ້າຮ້ານ? ຮູບຕົ້ນສະບັບໃນຄັງຍັງຢູ່.`)) return;
    setSaving(true);
    const result = await supabase.from("shirt_catalog_entries").delete().in("id", ids).select("id");
    setSaving(false);
    if (result.error) toast.error(result.error.message);
    else if (result.data.length !== ids.length) { toast.error("ບາງແບບບໍ່ສາມາດລົບໄດ້"); await load(); }
    else { toast.success("ລົບແບບແລ້ວ"); await load(); }
  };
  const bulkStatus = async (published: boolean) => {
    if (!canEdit || saving || !selectedEntries.length) return;
    if (published && entries.some(row => selectedEntries.includes(row.id) && !row.images.length)) return toast.error("ເພີ່ມຮູບກ່ອນເຜີຍແຜ່");
    setSaving(true);
    const result = await supabase.from("shirt_catalog_entries").update({ is_published: published }).in("id", selectedEntries).select("id");
    setSaving(false);
    if (result.error) toast.error(result.error.message);
    else { toast.success(published ? "ເຜີຍແຜ່ແລ້ວ" : "ຊ່ອນແບບແລ້ວ"); await load(); }
  };
  const moveImage = (index: number, direction: number) => {
    if (!draft) return;
    const images = [...draft.images];
    [images[index], images[index + direction]] = [images[index + direction], images[index]];
    patch({ images });
  };

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold tracking-widest text-amber-600">BG SPORT STORE</p><h1 className="mt-1 text-2xl font-bold">ເຜີຍແຜ່ແບບເສື້ອ</h1><p className="mt-2 text-sm text-[var(--theme-muted)]">ເລືອກຮູບຈາກຄັງ ແລະ ຈັດການແບບທີ່ສະແດງໃຫ້ລູກຄ້າເຫັນ</p></div>
      <div className="flex gap-2"><Link href="/design-queue/assets" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm"><Images size={16}/>ຄັງຮູບ</Link><button hidden={tab !== "designs"} disabled={!canEdit || !!error || loading || !categories.length} onClick={() => { setDraft(freshDraft(categories[0]?.id)); setLibraryOpen(false); }} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2 text-sm font-bold text-black disabled:opacity-40"><Plus size={16}/>ເພີ່ມແບບ</button></div>
    </header>
    <nav className="flex flex-wrap gap-2" aria-label="ຈັດການໜ້າຮ້ານ">{[["designs", "ແບບເສື້ອ"], ["content", "ຂໍ້ຄວາມຮ້ານ"], ["promotions", "ສະໄລດ໌ໂປຣໂມຊັນ"], ["categories", "ປະເພດງານ"]].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)} className={`rounded-xl border px-4 py-2 text-sm ${tab === key ? "bg-amber-300 font-bold text-black" : ""}`}>{label}</button>)}</nav>
    {tab === "categories" && <CategoryManager canEdit={canEdit} onChanged={loadCategories} />}
    {tab !== "designs" && tab !== "categories" && <StorefrontManager key={tab} section={tab} canEdit={canEdit} />}
    {tab === "designs" && <>
    {error && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{error}<button className="ml-4 underline" onClick={() => void load()}>ລອງໃໝ່</button></div>}
    <div className="flex flex-wrap items-center gap-3"><div className="relative min-w-60 flex-1"><Search size={16} className="absolute left-3 top-3 text-gray-400"/><input aria-label="ຄົ້ນຫາແບບ" value={query} onChange={e => setQuery(e.target.value)} placeholder="ຄົ້ນຫາລະຫັດ ຫຼື ຊື່ແບບ" className={`${control} pl-10`}/></div><select aria-label="ສະຖານະ" value={status} onChange={e => setStatus(e.target.value)} className={`${control} w-auto`}><option value="all">ທັງໝົດ</option><option value="published">ເຜີຍແຜ່ແລ້ວ</option><option value="draft">ແບບຮ່າງ</option></select><span className="text-sm">{visible.length} ແບບ</span></div>
    <div className="flex flex-wrap gap-3">{categories.map(category => <label key={category.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={selectedCategories.includes(category.id)} onChange={e => setSelectedCategories(current => e.target.checked ? [...current, category.id] : current.filter(id => id !== category.id))}/>{category.lo}</label>)}<button disabled={!canEdit || !!error || saving || !categories.length} className="ml-auto rounded-xl bg-amber-300 px-4 py-2 text-sm font-bold text-black disabled:opacity-40" onClick={() => setBatchOpen(true)}>ເລືອກຈາກຄັງເປັນກຸ່ມ</button></div>
    {canEdit && visible.length > 0 && <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm"><label className="flex gap-2"><input type="checkbox" disabled={saving} checked={visible.every(row => selectedEntries.includes(row.id))} onChange={e => setSelectedEntries(e.target.checked ? [...new Set([...selectedEntries, ...visible.map(row => row.id)])] : selectedEntries.filter(id => !visible.some(row => row.id === id)))}/>ເລືອກທັງໝົດ</label><span>{selectedEntries.length} ແບບ</span><button disabled={!selectedEntries.length || saving} onClick={() => void bulkStatus(true)} className="rounded-lg border px-3 py-2">ເຜີຍແຜ່ທີ່ເລືອກ</button><button disabled={!selectedEntries.length || saving} onClick={() => void bulkStatus(false)} className="rounded-lg border px-3 py-2">ຊ່ອນທີ່ເລືອກ</button><button disabled={!selectedEntries.length || saving} onClick={() => void deleteEntries(selectedEntries)} className="rounded-lg border px-3 py-2 text-red-500">ລົບທີ່ເລືອກ</button></div>}
    {loading ? <p className="flex items-center gap-2 py-8"><Loader2 className="animate-spin" size={18}/>ກຳລັງໂຫຼດ…</p> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{visible.map(row => <article key={row.id} className="overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <div className="relative aspect-[4/3] bg-[var(--theme-surface-muted)]">{row.images[0] ? <img src={row.images[0].url} alt={row.name_lo} className="h-full w-full object-contain"/> : <div className="grid h-full place-items-center"><Images className="text-gray-400"/></div>}<label className="absolute right-3 top-3 rounded-lg bg-white p-2 text-black"><input type="checkbox" aria-label={`ເລືອກ ${row.design_code}`} disabled={!canEdit || saving} checked={selectedEntries.includes(row.id)} onChange={e => setSelectedEntries(current => e.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))}/></label><span className={`absolute left-3 top-3 rounded-lg px-2 py-1 text-xs font-bold ${row.is_published ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{row.is_published ? "ເຜີຍແຜ່" : "ແບບຮ່າງ"}</span></div>
      <div className="space-y-2 p-4"><p className="text-xs font-bold text-amber-600">{row.design_code}</p><h2 className="font-bold">{row.name_lo}</h2><p className="text-xs text-[var(--theme-muted)]">{categories.find(c => c.id === row.category)?.lo} · {row.placement === "both" ? "Catalog + Store" : row.placement}</p>{row.placement !== "catalog" && <p className="text-sm">{row.price_lak ? `${Number(row.price_lak).toLocaleString()} ກີບ` : "ສອບຖາມລາຄາ"}</p>}<div className="flex gap-2 pt-2"><button disabled={!canEdit || saving} onClick={() => void editEntry(row)} className="flex-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-40">ແກ້ໄຂ</button><button disabled={!canEdit || saving} aria-label={row.is_published ? "ຊ່ອນແບບ" : "ເຜີຍແຜ່ແບບ"} onClick={() => void togglePublished(row)} className="rounded-lg border p-2 disabled:opacity-40">{row.is_published ? <EyeOff size={18}/> : <Eye size={18}/>}</button><button disabled={!canEdit || saving} aria-label={`ລົບ ${row.design_code}`} onClick={() => void deleteEntries([row.id])} className="rounded-lg border p-2 text-red-500 disabled:opacity-40"><Trash2 size={18}/></button></div></div>
    </article>)}</div>}
    {!loading && !error && visible.length === 0 && <div className="rounded-2xl border border-dashed p-12 text-center"><Images className="mx-auto mb-3 text-amber-500"/><p>{entries.length ? "ບໍ່ພົບແບບທີ່ຄົ້ນຫາ" : "ເພີ່ມແບບເສື້ອທຳອິດຈາກຄັງຮູບຂອງຮ້ານ"}</p></div>}
    {!loading && !allEntriesLoaded && <button className="rounded-xl border px-4 py-2" onClick={async () => { const result = await supabase.from("shirt_catalog_entries").select("*").order("created_at", { ascending: false }).range(entries.length, entries.length + 999); if (result.error) toast.error(result.error.message); else { setEntries(current => [...current, ...(result.data ?? []) as ShirtCatalogEntry[]]); setAllEntriesLoaded((result.data?.length ?? 0) < 1000); } }}>ໂຫຼດແບບເພີ່ມ</button>}
    {batchOpen && <BatchPublisher categories={categories} entries={entries} onClose={() => setBatchOpen(false)} onSaved={async () => { setBatchOpen(false); await load(); }} />}
    </>}
    {draft && <CatalogDialog label="ຈັດການແບບເສື້ອ" busy={saving || uploading} onClose={() => setDraft(null)}><section className="flex max-h-[95dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-[var(--theme-surface)] text-[var(--theme-foreground)] shadow-xl">
      <header className="flex items-center justify-between border-b border-[var(--theme-border)] p-4"><h2 className="font-bold">{draft.id ? "ແກ້ໄຂແບບ" : "ເພີ່ມແບບເສື້ອ"}</h2><button disabled={saving || uploading} aria-label="ປິດ" onClick={() => setDraft(null)}><X/></button></header>
      <div className="space-y-5 overflow-y-auto p-5"><fieldset disabled={saving || uploading} className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">ລະຫັດແບບ *<input aria-label="ລະຫັດແບບ" maxLength={60} readOnly={!!linkedOrderCode} className={`${control} read-only:bg-[var(--theme-surface-muted)]`} value={linkedOrderCode || draft.design_code} onChange={e => patch({ design_code: e.target.value })} placeholder="ພິມລະຫັດສຳລັບຮູບທີ່ອັບໂຫຼດເອງ"/><span className="block text-xs text-[var(--theme-muted)]">{linkedOrderCode ? "ດຶງຈາກລະຫັດອໍເດີໃນຄັງຮູບອັດຕະໂນມັດ" : "ຮູບທີ່ອັບໂຫຼດເອງ ສາມາດກຳນົດລະຫັດໄດ້"}</span></label>
        <label className="space-y-1 text-sm">ໝວດໝູ່<select aria-label="ໝວດໝູ່" className={control} value={draft.category} onChange={e => patch({ category: e.target.value as Draft["category"] })}>{!categories.some(c => c.id === draft.category) && <option value={draft.category} disabled>ກະລຸນາເລືອກປະເພດ</option>}{categories.map(c => <option key={c.id} value={c.id}>{c.lo} / {c.en}</option>)}</select></label>
        <label className="space-y-1 text-sm">ຊື່ແບບ (ລາວ) *<input maxLength={200} className={control} value={draft.name_lo} onChange={e => patch({ name_lo: e.target.value })}/></label>
        <label className="space-y-1 text-sm">ຊື່ແບບ (English)<input maxLength={200} className={control} value={draft.name_en} onChange={e => patch({ name_en: e.target.value })}/></label>
        <label className="space-y-1 text-sm">ລາຍລະອຽດ (ລາວ)<textarea rows={3} maxLength={5000} className={control} value={draft.description_lo} onChange={e => patch({ description_lo: e.target.value })}/></label>
        <label className="space-y-1 text-sm">ລາຍລະອຽດ (English)<textarea rows={3} maxLength={5000} className={control} value={draft.description_en} onChange={e => patch({ description_en: e.target.value })}/></label>
        <label className="space-y-1 text-sm">ໜ້າທີ່ສະແດງ<select className={control} value={draft.placement} onChange={e => patch({ placement: e.target.value as Draft["placement"] })}><option value="catalog">Catalog</option><option value="store">Store</option><option value="both">Catalog + Store</option></select></label>
        {draft.placement !== "catalog" && <label className="space-y-1 text-sm">ລາຄາ Store (ກີບ)<input className={control} type="number" min="0.01" step="0.01" value={draft.price} onChange={e => patch({ price: e.target.value })} placeholder="ວ່າງ = ສອບຖາມລາຄາ"/><span className="text-xs text-[var(--theme-muted)]">ລາຄາຈະສະແດງສະເພາະໜ້າ Store</span></label>}
        {([['caption_lo', 'ແຄັບຊັນ (ລາວ)', 1000], ['caption_en', 'ແຄັບຊັນ (English)', 1000], ['slogan_lo', 'ຄຳຂວັນ (ລາວ)', 200], ['slogan_en', 'ຄຳຂວັນ (English)', 200]] as const).map(([key, label, max]) => <label key={key} className="space-y-1 text-sm">{label}<input className={control} maxLength={max} value={draft[key]} onChange={e => patch({ [key]: e.target.value })}/></label>)}
      </fieldset>
      <div><div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="mr-auto font-bold">ຮູບເສື້ອ ({draft.images.length}/12)</h3><button disabled={uploading || saving} onClick={() => { setLibraryOpen(!libraryOpen); if (!library.length) void loadLibrary(); }} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Images size={16}/>ເລືອກຈາກຄັງ</button><label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${uploading ? "pointer-events-none opacity-50" : ""}`}><Upload size={16}/>{uploading ? "ກຳລັງອັບໂຫຼດ…" : "ອັບໂຫຼດຮູບ"}<input disabled={uploading || saving} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => { void upload(e.target.files); e.target.value = ""; }}/></label></div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{draft.images.map((image, index) => <div key={`${image.url}-${index}`} className="relative overflow-hidden rounded-xl border"><img src={image.url} alt={`ຮູບ ${index + 1}`} className="aspect-square w-full object-contain"/><button disabled={uploading || saving} aria-label="ເອົາຮູບອອກຈາກແບບ" className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white" onClick={() => patch({ images: draft.images.filter((_, i) => i !== index) })}><X size={14}/></button>{index === 0 && <span className="absolute bottom-0 left-0 bg-amber-300 px-2 text-[10px] text-black">ຮູບຫຼັກ</span>}<div className="flex justify-between bg-[var(--theme-surface)] p-1"><button disabled={index === 0 || saving || uploading} aria-label="ເລື່ອນຮູບກ່ອນ" onClick={() => moveImage(index, -1)}><ArrowLeft size={14}/></button><button disabled={index === draft.images.length - 1 || saving || uploading} aria-label="ເລື່ອນຮູບຫຼັງ" onClick={() => moveImage(index, 1)}><ArrowRight size={14}/></button></div></div>)}</div>
      {libraryOpen && <div className="mt-4 rounded-xl border p-3"><input className={control} placeholder="ຄົ້ນຫາລະຫັດອໍເດີ ຫຼື ຊື່ໄຟລ໌ໃນຮູບທີ່ໂຫຼດແລ້ວ" aria-label="ຄົ້ນຫາຮູບ" value={libraryQuery} onChange={e => setLibraryQuery(e.target.value)}/><div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-auto sm:grid-cols-5">{library.filter(image => image.file_url && isPublicImageUrl(image.file_url) && `${sourceCode(image)} ${image.file_name}`.toLowerCase().includes(libraryQuery.toLowerCase())).map(image => { const selected = draft.images.some(i => i.mockup_id === image.id); return <button key={image.id} disabled={selected || draft.images.length >= 12 || uploading || saving} className={`overflow-hidden rounded-lg border text-left disabled:opacity-40 ${selected ? "ring-2 ring-amber-400" : ""}`} onClick={() => pickLibraryImage(image)}><img src={image.file_url!} alt={image.file_name} loading="lazy" className="aspect-square w-full object-contain"/><span className="block truncate px-1 pt-1 text-xs font-bold">{sourceCode(image)}</span><span className="block truncate p-1 text-[10px]">{image.file_name}</span></button>; })}</div>{libraryLoading && <p className="p-3 text-sm">ກຳລັງໂຫຼດ…</p>}{libraryHasMore && <button disabled={libraryLoading} className="mt-3 rounded-lg border px-3 py-2 text-sm" onClick={() => void loadLibrary(true)}>ໂຫຼດຮູບເພີ່ມ</button>}</div>}
      </div><div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={saving || uploading} checked={draft.is_published} onChange={e => patch({ is_published: e.target.checked })}/>ເຜີຍແຜ່ໃຫ້ລູກຄ້າເຫັນ</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={saving || uploading} checked={draft.is_featured} onChange={e => patch({ is_featured: e.target.checked })}/>ແບບແນະນຳ</label></div>
      </div><footer className="flex justify-end gap-2 border-t border-[var(--theme-border)] p-4"><button disabled={saving || uploading} className="rounded-xl border px-4 py-2 text-sm" onClick={() => setDraft(null)}>ຍົກເລີກ</button><button disabled={saving || uploading || !canEdit} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-5 py-2 font-bold text-black disabled:opacity-40"><Save size={16}/>{saving ? "ກຳລັງບັນທຶກ…" : "ບັນທຶກ"}</button></footer>
    </section></CatalogDialog>}
    <p className="flex items-center gap-2 text-xs text-[var(--theme-muted)]"><ExternalLink size={12}/>ໜ້າຮ້ານຈະອ່ານສະເພາະແບບທີ່ເຜີຍແຜ່</p>
  </div>;
}
