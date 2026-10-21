"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Plus, Save, Trash2, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { resizeImageFileToFit } from "@/lib/client-image";
import { buildSafeStorageFileName } from "@/lib/order-media";
import type { CatalogImage } from "@/lib/shirt-catalog";
import { STOREFRONT_POST_SECTIONS, STOREFRONT_POSTS_MIGRATION, STOREFRONT_COLLARS_MIGRATION, type StorefrontPost, type StorefrontPostKind } from "@/lib/storefront-posts";
import { CatalogDialog } from "./catalog-dialog";

const control = "w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5 text-sm text-[var(--theme-foreground)]";
const pageSize = 24;
const migrationError = (code: string, message: string, migration = STOREFRONT_POSTS_MIGRATION) => ["PGRST205", "PGRST204", "42P01", "42703"].includes(code)
  ? `ກະລຸນາລັນ ${migration} ໃນ Supabase SQL Editor ກ່ອນ` : message;
const fresh = (kind: StorefrontPostKind): StorefrontPost => ({id:"",kind,title_lo:"",title_en:"",description_lo:"",description_en:"",images:[],sort_order:0,is_published:false,collar_pricing:"standard",surcharge_lak:0});

export function StorefrontPostsManager({ kind }: { kind: StorefrontPostKind }) {
  const section = STOREFRONT_POST_SECTIONS[kind];
  const [rows, setRows] = useState<StorefrontPost[]>([]);
  const [draft, setDraft] = useState<StorefrontPost | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const busy = saving || uploading;
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setError("");
    const columns: string = kind === "collar" ? "id,kind,title_lo,title_en,description_lo,description_en,images,sort_order,is_published,collar_pricing,surcharge_lak" : "*";
    let request = supabase.from("storefront_posts").select(columns, {count:"exact"}).eq("kind",kind)
      .order("sort_order").order("created_at",{ascending:false}).order("id");
    if (status !== "all") request = request.eq("is_published",status === "published");
    if (query.trim()) {
      // Quote PostgREST values and escape SQL wildcards for literal title search.
      const pattern = `%${query.trim().replace(/[\\%_]/g, "\\$&")}%`;
      request = request.or(["title_lo","title_en"].map(column => `${column}.ilike.${JSON.stringify(pattern)}`).join(","));
    }
    const result = await request.range(page * pageSize,(page + 1) * pageSize - 1).returns<StorefrontPost[]>();
    if (id !== requestId.current) return;
    if (result.error) setError(migrationError(result.error.code,result.error.message,kind === "collar" ? STOREFRONT_COLLARS_MIGRATION : STOREFRONT_POSTS_MIGRATION));
    else {
      const count = result.count ?? result.data.length;
      if (page > 0 && count <= page * pageSize) { setPage(Math.max(0,Math.ceil(count/pageSize)-1)); return; }
      setRows(result.data); setTotal(count);
    }
    setLoading(false);
  },[kind,status,query,page]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 200);
    return () => { clearTimeout(timer); requestId.current++; };
  },[load]);
  useEffect(() => {
    let active = true;
    void supabase.rpc("can_manage_shirt_catalog",{p_edit:true}).then(result => {
      if (active) setCanEdit(result.data === true && !result.error);
    });
    return () => { active = false; };
  },[]);
  const patch = (fields: Partial<StorefrontPost>) => setDraft(current => current ? {...current,...fields} : null);

  async function save() {
    if (!draft || !canEdit || busy) return;
    if (!draft.title_lo.trim()) return toast.error("ກະລຸນາໃສ່ຫົວຂໍ້ (ລາວ)");
    if (draft.is_published && !draft.images.length) return toast.error("ເພີ່ມຮູບກ່ອນເຜີຍແຜ່");
    if (!Number.isInteger(draft.sort_order) || draft.sort_order < -2147483648 || draft.sort_order > 2147483647) return toast.error("ລຳດັບຕ້ອງເປັນຈຳນວນເຕັມທີ່ຖືກຕ້ອງ");
    if (kind === "collar" && draft.collar_pricing === "extra" && (!Number.isFinite(draft.surcharge_lak) || Number(draft.surcharge_lak) <= 0 || Number(draft.surcharge_lak) > 999999999999.99)) return toast.error("ກະລຸນາໃສ່ຄ່າບວກເພີ່ມທີ່ຫຼາຍກວ່າ 0");
    setSaving(true);
    const payload = {kind,title_lo:draft.title_lo.trim(),title_en:draft.title_en.trim(),description_lo:draft.description_lo.trim(),description_en:draft.description_en.trim(),images:draft.images,sort_order:draft.sort_order,is_published:draft.is_published,...(kind === "collar" ? {collar_pricing:draft.collar_pricing || "standard",surcharge_lak:draft.collar_pricing === "extra" ? Number(draft.surcharge_lak) : 0} : {})};
    const result = draft.id
      ? await supabase.from("storefront_posts").update(payload).eq("id",draft.id).eq("kind",kind).select("id").single()
      : await supabase.from("storefront_posts").insert(payload).select("id").single();
    setSaving(false);
    if (result.error) return toast.error(migrationError(result.error.code,result.error.message,kind === "collar" ? STOREFRONT_COLLARS_MIGRATION : STOREFRONT_POSTS_MIGRATION));
    toast.success(draft.is_published ? "ເຜີຍແຜ່ແລ້ວ" : "ບັນທຶກແບບຮ່າງແລ້ວ");
    setDraft(null); await load();
  }
  async function publish(row: StorefrontPost) {
    if (!canEdit || busy) return;
    if (!row.is_published && !row.images.length) return toast.error("ເພີ່ມຮູບກ່ອນເຜີຍແຜ່");
    setSaving(true);
    const result = await supabase.from("storefront_posts").update({is_published:!row.is_published}).eq("id",row.id).eq("kind",kind).select("id").single();
    setSaving(false);
    if (result.error) toast.error(result.error.message);
    else { toast.success(row.is_published ? "ຊ່ອນແລ້ວ" : "ເຜີຍແຜ່ແລ້ວ"); await load(); }
  }
  async function remove(row: StorefrontPost) {
    if (!canEdit || busy || !window.confirm(`ລົບ “${row.title_lo}”? ຮູບຕົ້ນສະບັບຈະຍັງຢູ່.`)) return;
    setSaving(true);
    const result = await supabase.from("storefront_posts").delete().eq("id",row.id).eq("kind",kind).select("id").single();
    setSaving(false);
    if (result.error) toast.error(result.error.message);
    else { toast.success("ລົບໂພສແລ້ວ"); await load(); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length || !draft || !canEdit || busy) return;
    if (draft.images.length + files.length > 12) return toast.error("ເພີ່ມໄດ້ສູງສຸດ 12 ຮູບຕໍ່ໂພສ");
    setUploading(true);
    const added: CatalogImage[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) throw new Error("ໃຊ້ JPG, PNG ຫຼື WebP ບໍ່ເກີນ 15 MB ຕໍ່ຮູບ");
        const resized = await resizeImageFileToFit(file,2024,2024);
        const path = `posts/${kind}/${buildSafeStorageFileName(resized.file.name,"post")}`;
        const result = await supabase.storage.from("shirt-catalog").upload(path,resized.file,{contentType:resized.mimeType,upsert:false});
        if (result.error) throw result.error;
        added.push({url:supabase.storage.from("shirt-catalog").getPublicUrl(path).data.publicUrl,bucket:"shirt-catalog",path,name:file.name});
      }
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "ອັບໂຫຼດບໍ່ສຳເລັດ"); }
    finally { setDraft(current => current ? {...current,images:[...current.images,...added]} : null); setUploading(false); }
  }
  function moveImage(index: number, direction: number) {
    if (!draft || busy) return;
    const images = [...draft.images];
    [images[index],images[index+direction]] = [images[index+direction],images[index]];
    patch({images});
  }

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-widest text-amber-600">BG SPORT STORE</p><h1 className="mt-1 text-2xl font-bold">{section.label}</h1><p className="mt-2 text-sm text-[var(--theme-muted)]">{section.description}</p></div><button disabled={!canEdit || loading || !!error || busy} onClick={() => setDraft(fresh(kind))} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2 font-bold text-black disabled:opacity-40"><Plus size={16}/>ເພີ່ມໂພສ</button></header>
    <nav aria-label="ຈັດການໜ້າຮ້ານ" className="flex flex-wrap gap-2"><Link href="/shirt-catalog" className="rounded-xl border px-4 py-2 text-sm">ແບບເສື້ອ</Link>{Object.entries(STOREFRONT_POST_SECTIONS).map(([key,value]) => <Link key={key} href={value.path} aria-current={kind === key ? "page" : undefined} className={`rounded-xl border px-4 py-2 text-sm ${kind === key ? "bg-amber-300 font-bold text-black" : ""}`}>{value.label}</Link>)}</nav>
    <div className="flex flex-wrap gap-3"><input aria-label="ຄົ້ນຫາໂພສ" placeholder="ຄົ້ນຫາຫົວຂໍ້ໂພສ…" maxLength={200} className={`${control} min-w-0 flex-1`} value={query} onChange={event => {setQuery(event.target.value);setPage(0);}}/><select aria-label="ສະຖານະໂພສ" className={`${control} w-auto`} value={status} onChange={event => {setStatus(event.target.value);setPage(0);}}><option value="all">ທັງໝົດ</option><option value="published">ເຜີຍແຜ່ແລ້ວ</option><option value="draft">ແບບຮ່າງ</option></select></div>
    {error && <div role="alert" className="rounded-xl border border-amber-400 p-4 text-sm">{error}<button className="ml-3 underline" onClick={() => void load()}>ລອງໃໝ່</button></div>}
    {loading ? <p role="status">ກຳລັງໂຫຼດ…</p> : !error && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map(row => <article key={row.id} className="overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
        {row.images[0] ? <img src={row.images[0].url} alt={row.title_lo} loading="lazy" className="aspect-[4/3] w-full bg-[var(--theme-surface-muted)] object-contain"/> : <div className="grid aspect-[4/3] place-items-center bg-[var(--theme-surface-muted)] text-sm">ຍັງບໍ່ມີຮູບ</div>}
        <div className="space-y-3 p-4"><span className={`inline-block rounded-lg px-2 py-1 text-xs ${row.is_published ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>{row.is_published ? "ເຜີຍແຜ່ແລ້ວ" : "ແບບຮ່າງ"}</span><h2 className="break-words font-bold">{row.title_lo}</h2>{kind === "collar" && <p className="font-bold text-amber-600">{row.collar_pricing === "extra" ? `+${Number(row.surcharge_lak || 0).toLocaleString()} ກີບ/ໂຕ` : "ຄໍທຳມະດາ · ບໍ່ບວກເພີ່ມ"}</p>}<p className="line-clamp-2 break-words text-sm text-[var(--theme-muted)]">{row.description_lo}</p><p className="text-xs text-[var(--theme-muted)]">{row.images.length} ຮູບ · ລຳດັບ {row.sort_order}</p><div className="flex gap-2"><button disabled={!canEdit || busy} onClick={() => setDraft(row)} className="flex-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-40">ແກ້ໄຂ</button><button disabled={!canEdit || busy} aria-label={row.is_published ? "ຊ່ອນໂພສ" : "ເຜີຍແຜ່ໂພສ"} onClick={() => void publish(row)} className="rounded-lg border p-2 disabled:opacity-40">{row.is_published ? <EyeOff size={18}/> : <Eye size={18}/>}</button><button disabled={!canEdit || busy} aria-label={`ລົບ ${row.title_lo}`} onClick={() => void remove(row)} className="rounded-lg border p-2 text-red-500 disabled:opacity-40"><Trash2 size={18}/></button></div></div>
      </article>)}</div>
      {!rows.length && <p className="rounded-xl border border-dashed p-8 text-center">{query || status !== "all" ? "ບໍ່ພົບໂພສທີ່ຄົ້ນຫາ" : "ຍັງບໍ່ມີໂພສ. ກົດເພີ່ມໂພສເພື່ອອັບໂຫຼດຮູບ."}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p role="status">{total} ໂພສ · ໜ້າ {page+1}/{Math.max(1,Math.ceil(total/pageSize))}</p><div className="flex gap-2"><button disabled={page === 0} className="rounded-lg border px-3 py-2 disabled:opacity-40" onClick={() => setPage(current => current-1)}>ໜ້າກ່ອນ</button><button disabled={(page+1)*pageSize >= total} className="rounded-lg border px-3 py-2 disabled:opacity-40" onClick={() => setPage(current => current+1)}>ໜ້າຖັດໄປ</button></div></div>
    </>}
    {draft && <CatalogDialog label={section.label} busy={busy} onClose={() => setDraft(null)}><section className="flex max-h-[95dvh] flex-col overflow-hidden rounded-2xl bg-[var(--theme-surface)] text-[var(--theme-foreground)]"><header className="flex items-center justify-between border-b p-4"><h2 className="font-bold">{draft.id ? "ແກ້ໄຂໂພສ" : "ເພີ່ມໂພສ"} · {section.label}</h2><button disabled={busy} aria-label="ປິດ" onClick={() => setDraft(null)}><X/></button></header>
      <div className="space-y-5 overflow-y-auto p-5"><fieldset disabled={!canEdit || busy} className="grid gap-4 md:grid-cols-2">
        {([['title_lo','ຫົວຂໍ້ (ລາວ) *'],['title_en','ຫົວຂໍ້ (English)']] as const).map(([key,label]) => <label key={key} className="space-y-1 text-sm">{label}<input aria-label={label} className={control} maxLength={200} value={draft[key]} onChange={event => patch({[key]:event.target.value})}/></label>)}
        {([['description_lo','ລາຍລະອຽດ (ລາວ)'],['description_en','ລາຍລະອຽດ (English)']] as const).map(([key,label]) => <label key={key} className="space-y-1 text-sm">{label}<textarea aria-label={label} className={control} rows={5} maxLength={5000} value={draft[key]} onChange={event => patch({[key]:event.target.value})}/></label>)}
        {kind === "collar" && <><label className="space-y-1 text-sm">ປະເພດລາຄາ<select aria-label="ປະເພດລາຄາ" className={control} value={draft.collar_pricing || "standard"} onChange={event => patch({collar_pricing:event.target.value as "standard" | "extra",surcharge_lak:event.target.value === "standard" ? 0 : null})}><option value="standard">ຄໍທຳມະດາ — ບໍ່ບວກເພີ່ມ</option><option value="extra">ຄໍບວກເພີ່ມເງິນ</option></select></label>{draft.collar_pricing === "extra" && <label className="space-y-1 text-sm">ຄ່າບວກເພີ່ມ (ກີບ/ໂຕ)<input aria-label="ຄ່າບວກເພີ່ມ (ກີບ/ໂຕ)" className={control} type="number" min="0.01" max="999999999999.99" step="0.01" value={draft.surcharge_lak ?? ""} onChange={event => patch({surcharge_lak:event.target.value === "" ? null : Number(event.target.value)})}/></label>}</>}
        <label className="space-y-1 text-sm">ລຳດັບ<input className={control} type="number" step="1" min={-2147483648} max={2147483647} value={draft.sort_order} onChange={event => patch({sort_order:Number(event.target.value)})}/><span className="text-xs text-[var(--theme-muted)]">ລຳດັບນ້ອຍສະແດງກ່ອນ</span></label>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">ຮູບພາບ ({draft.images.length}/12)</h3><label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${busy || !canEdit ? "pointer-events-none opacity-40" : ""}`}><Upload size={16}/>{uploading ? "ກຳລັງອັບໂຫຼດ…" : "ອັບໂຫຼດຮູບ"}<input aria-label="ອັບໂຫຼດຮູບ" disabled={busy || !canEdit} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={event => {void upload(event.target.files);event.target.value="";}}/></label></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{draft.images.map((image,index) => <div key={`${image.url}-${index}`} className="relative overflow-hidden rounded-xl border"><img src={image.url} alt={`ຮູບ ${index+1}`} className="aspect-square object-contain"/><button disabled={busy || !canEdit} aria-label={`ເອົາຮູບ ${index+1} ອອກ`} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white" onClick={() => patch({images:draft.images.filter((_,i) => i !== index)})}><X size={14}/></button>{index === 0 && <span className="absolute left-1 top-1 bg-amber-300 px-2 text-xs text-black">ຮູບຫຼັກ</span>}<div className="flex justify-between p-2"><button disabled={busy || !canEdit || index === 0} aria-label={`ເລື່ອນຮູບ ${index+1} ກ່ອນ`} onClick={() => moveImage(index,-1)}><ArrowLeft size={16}/></button><button disabled={busy || !canEdit || index === draft.images.length-1} aria-label={`ເລື່ອນຮູບ ${index+1} ຫຼັງ`} onClick={() => moveImage(index,1)}><ArrowRight size={16}/></button></div></div>)}</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy || !canEdit} checked={draft.is_published} onChange={event => patch({is_published:event.target.checked})}/>ເຜີຍແຜ່ໃຫ້ລູກຄ້າເຫັນ</label></div>
      <footer className="flex justify-end gap-3 border-t p-4"><button disabled={busy} className="rounded-xl border px-4 py-2" onClick={() => setDraft(null)}>ຍົກເລີກ</button><button disabled={!canEdit || busy} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-5 py-2 font-bold text-black disabled:opacity-40" onClick={() => void save()}><Save size={16}/>{saving ? "ກຳລັງບັນທຶກ…" : "ບັນທຶກ"}</button></footer>
    </section></CatalogDialog>}
  </div>;
}
