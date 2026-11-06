"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, QrCode, Save, Store, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import bgSportLogo from "@/app/BGSPORTLOGO.png";
import { supabase } from "@/lib/supabase";
import { DEFAULT_SHOP_SETTINGS, fetchShopSettings, SHOP_BRANDING_BUCKET, SHOP_IMAGE_MAX_BYTES, SHOP_IMAGE_TYPES, shopSettingsError, withShopImageUrls, type ShopSettings, type ShopSettingsRow } from "@/lib/shop-settings";
import { rememberShopSettings } from "@/lib/use-shop-settings";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import { SettingsTabs } from "../_components/settings-tabs";

type ImageKind = "logo" | "qr";
// `file` is a new image waiting for save; `removed` clears the saved image on save.
type ImageDraft = { file: File | null; previewUrl: string | null; removed: boolean };
const EMPTY_IMAGE_DRAFT: ImageDraft = { file: null, previewUrl: null, removed: false };
const EMPTY_IMAGE_DRAFTS: Record<ImageKind, ImageDraft> = { logo: EMPTY_IMAGE_DRAFT, qr: EMPTY_IMAGE_DRAFT };

const control = "mt-1.5 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5 text-sm font-normal disabled:opacity-50";
const card = "rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5";

function ImageField({ title, hint, emptyLabel, icon: Icon, src, canRemove, disabled, square, onPick, onRemove }: {
  title: string;
  hint: string;
  emptyLabel: string;
  icon: typeof QrCode;
  src: string | null;
  canRemove: boolean;
  disabled: boolean;
  square: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <div className="text-sm font-bold">{title}</div>
      <div className="mt-2 flex h-44 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[var(--theme-border)] bg-white p-3">
        {src
          ? <img src={src} alt={title} className={`max-h-full max-w-full object-contain ${square ? "aspect-square h-full" : ""}`} />
          : <div className="px-3 text-center text-xs text-slate-500"><Icon size={28} className="mx-auto mb-2 text-slate-400" />{emptyLabel}</div>}
      </div>
      <p className="mt-2 text-xs text-[var(--theme-muted)]">{hint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-blue-500 ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}>
          <ImagePlus size={16} />ເລືອກຮູບ
          <input
            type="file"
            aria-label={`ເລືອກຮູບ ${title}`}
            accept={SHOP_IMAGE_TYPES.join(",")}
            disabled={disabled}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onPick(file);
            }}
          />
        </label>
        {canRemove && (
          <button type="button" aria-label={`ລົບຮູບ ${title}`} disabled={disabled} onClick={onRemove} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-rose-600 disabled:opacity-40">
            <Trash2 size={16} />ລົບ
          </button>
        )}
      </div>
    </div>
  );
}

export default function ShopSettingsPage() {
  const [saved, setSaved] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS);
  const [form, setForm] = useState({ shop_name: "", phone: "", address: "" });
  const [images, setImages] = useState(EMPTY_IMAGE_DRAFTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState("");
  const pageRef = useRef<HTMLDivElement | null>(null);
  const { isDirty, setDirty, markClean } = useUnsavedChangesGuard({ scopeRef: pageRef });

  const previewUrlsRef = useRef<string[]>([]);
  useEffect(() => () => previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [settings, permission] = await Promise.all([fetchShopSettings(), supabase.rpc("can_manage_shop_settings")]);
    const failure = settings.error || permission.error;
    if (failure) setError(shopSettingsError(failure));
    else if (!settings.data) setError("ບໍ່ພົບຂໍ້ມູນຮ້ານ");
    else {
      setSaved(settings.data);
      setForm({ shop_name: settings.data.shop_name, phone: settings.data.phone, address: settings.data.address });
    }
    setCanEdit(!permission.error && permission.data === true);
    setLoading(false);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function pickImage(kind: ImageKind, file: File) {
    if (!SHOP_IMAGE_TYPES.includes(file.type)) return void toast.error("ຮອງຮັບສະເພາະໄຟລ໌ JPG, PNG ແລະ WEBP");
    if (file.size > SHOP_IMAGE_MAX_BYTES) return void toast.error("ຮູບຕ້ອງບໍ່ເກີນ 5 MB");
    const previewUrl = URL.createObjectURL(file);
    previewUrlsRef.current.push(previewUrl);
    setImages((current) => ({ ...current, [kind]: { file, previewUrl, removed: false } }));
  }

  function removeImage(kind: ImageKind) {
    setImages((current) => ({ ...current, [kind]: { file: null, previewUrl: null, removed: true } }));
    setDirty(true);
  }

  const shownImage = (kind: ImageKind) => {
    const draft = images[kind];
    if (draft.previewUrl) return draft.previewUrl;
    if (draft.removed) return null;
    return kind === "logo" ? saved.logoUrl : saved.qrUrl;
  };

  async function save() {
    if (saving || !canEdit) return;
    const shopName = form.shop_name.trim();
    if (!shopName) return void toast.error("ກະລຸນາປ້ອນຊື່ຮ້ານ");
    setSaving(true);
    const uploaded: string[] = [];
    const bucket = supabase.storage.from(SHOP_BRANDING_BUCKET);
    const discardUploads = async () => { if (uploaded.length) await bucket.remove(uploaded); };
    try {
      const nextPaths: Record<ImageKind, string | null> = { logo: saved.logo_path, qr: saved.qr_path };
      for (const kind of ["logo", "qr"] as const) {
        const draft = images[kind];
        if (draft.removed) nextPaths[kind] = null;
        if (!draft.file) continue;
        const extension = draft.file.type === "image/png" ? "png" : draft.file.type === "image/webp" ? "webp" : "jpg";
        const path = `${kind}/${crypto.randomUUID()}.${extension}`;
        const upload = await bucket.upload(path, draft.file, { contentType: draft.file.type });
        if (upload.error) {
          await discardUploads();
          return void toast.error(shopSettingsError(upload.error));
        }
        uploaded.push(path);
        nextPaths[kind] = path;
      }
      const result = await supabase
        .from("shop_settings")
        .update({ shop_name: shopName, phone: form.phone.trim(), address: form.address.trim(), logo_path: nextPaths.logo, qr_path: nextPaths.qr })
        .eq("id", true)
        .select("shop_name,phone,address,logo_path,qr_path")
        .single<ShopSettingsRow>();
      if (result.error) {
        await discardUploads();
        return void toast.error(shopSettingsError(result.error));
      }
      const replaced = [saved.logo_path, saved.qr_path].filter((path): path is string => !!path && path !== nextPaths.logo && path !== nextPaths.qr);
      // The new settings are already saved, so a leftover old file is harmless.
      if (replaced.length) await bucket.remove(replaced);
      const next = withShopImageUrls(result.data);
      rememberShopSettings(next);
      setSaved(next);
      setForm({ shop_name: next.shop_name, phone: next.phone, address: next.address });
      setImages(EMPTY_IMAGE_DRAFTS);
      markClean();
      toast.success("ບັນທຶກຂໍ້ມູນຮ້ານແລ້ວ");
    } finally {
      setSaving(false);
    }
  }

  const locked = loading || saving || !canEdit || !!error;
  const logoSrc = shownImage("logo");
  const qrSrc = shownImage("qr");

  return (
    <div ref={pageRef} className="space-y-5 text-[var(--theme-foreground)]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Store size={24} />ຂໍ້ມູນຮ້ານ</h1>
          <p className="mt-2 text-sm text-[var(--theme-muted)]">ໂລໂກ້, QR ແລະ ຂໍ້ມູນຕິດຕໍ່ທີ່ສະແດງໃນໃບປະເມີນລາຄາ</p>
        </div>
        <button type="button" disabled={locked || !isDirty} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
          <Save size={16} />{saving ? "ກຳລັງບັນທຶກ…" : "ບັນທຶກ"}
        </button>
      </header>

      <SettingsTabs active="shop" />

      {error && <div role="alert" className="rounded-xl border border-rose-300 p-4 text-sm text-rose-600">{error}<button type="button" className="ml-3 underline" onClick={() => void load()}>ລອງໃໝ່</button></div>}
      {!loading && !error && !canEdit && <div role="status" className="rounded-xl border border-[var(--theme-border)] p-4 text-sm text-[var(--theme-muted)]">ທ່ານເບິ່ງໄດ້ຢ່າງດຽວ, ບໍ່ມີສິດແກ້ໄຂຂໍ້ມູນຮ້ານ</div>}

      {loading ? <p role="status">ກຳລັງໂຫຼດ…</p> : !error && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <section aria-labelledby="shop-info-title" className={card}>
              <h2 id="shop-info-title" className="mb-4 font-bold">ຂໍ້ມູນຕິດຕໍ່</h2>
              <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold">ຊື່ຮ້ານ
                  <input maxLength={200} value={form.shop_name} onChange={(event) => setForm({ ...form, shop_name: event.target.value })} className={control} />
                </label>
                <label className="text-sm font-bold">ເບີໂທ
                  <input maxLength={200} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className={control} placeholder="+856 20 ..." />
                </label>
                <label className="text-sm font-bold sm:col-span-2">ທີ່ຢູ່
                  <textarea maxLength={500} rows={3} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className={control} />
                </label>
              </fieldset>
            </section>

            <section aria-labelledby="shop-images-title" className={card}>
              <h2 id="shop-images-title" className="mb-4 font-bold">ຮູບພາບ</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <ImageField
                  title="ໂລໂກ້ຮ້ານ"
                  hint="ແນະນຳ PNG ພື້ນໂປ່ງໃສ. JPG, PNG ຫຼື WEBP ບໍ່ເກີນ 5 MB"
                  emptyLabel=""
                  icon={ImagePlus}
                  src={logoSrc ?? bgSportLogo.src}
                  canRemove={!!logoSrc}
                  disabled={locked}
                  square={false}
                  onPick={(file) => pickImage("logo", file)}
                  onRemove={() => removeImage("logo")}
                />
                <ImageField
                  title="QR ຮ້ານ"
                  hint="ຕັດຮູບໃຫ້ເຫຼືອແຕ່ຕົວ QR ເພື່ອໃຫ້ສະແກນງ່າຍຕອນພິມ. JPG, PNG ຫຼື WEBP ບໍ່ເກີນ 5 MB"
                  emptyLabel="ຍັງບໍ່ມີ QR, ໃບປະເມີນຈະບໍ່ສະແດງ QR"
                  icon={QrCode}
                  src={qrSrc}
                  canRemove={!!qrSrc}
                  disabled={locked}
                  square
                  onPick={(file) => pickImage("qr", file)}
                  onRemove={() => removeImage("qr")}
                />
              </div>
            </section>
          </div>

          <aside aria-labelledby="shop-preview-title" className={`${card} xl:sticky xl:top-4`}>
            <h2 id="shop-preview-title" className="font-bold">ຕົວຢ່າງໃນໃບປະເມີນ</h2>
            <p className="mb-4 mt-1 text-xs text-[var(--theme-muted)]">ສະແດງຕາມທີ່ແກ້ໄຂ, ຍັງບໍ່ບັນທຶກຈົນກວ່າຈະກົດບັນທຶກ</p>
            <div className='rounded-xl border border-slate-300 bg-white p-4 text-slate-900 [font-family:"Noto_Sans_Lao_Looped","Noto_Sans_Lao",Tahoma,Arial,sans-serif]'>
              <div className="border-b border-slate-200 pb-3">
                <img src={logoSrc ?? bgSportLogo.src} alt="" className="h-auto max-h-[56px] w-[78px] object-contain object-left" />
                <div className="text-[18px] font-black">{form.shop_name || "-"}</div>
                <div className="mt-1 max-w-[220px] whitespace-pre-line text-[10px] font-medium leading-4 text-slate-500">{form.address || "-"}</div>
                <div className="mt-1 text-[10px] font-bold text-slate-600">{form.phone || "-"}</div>
              </div>
              <div className="mt-3 text-[10px] leading-4 text-slate-600">
                <div className="font-black text-slate-700">ຈຳນວນລວມ</div>
                <div>ເສື້ອ: ໄລ່ເງິນ 0 ຜືນ / ຜະລິດລວມ 0 ຜືນ</div>
                {qrSrc && <img src={qrSrc} alt="" className="mt-2 h-24 w-24 object-contain" />}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
