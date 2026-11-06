import { supabase } from "@/lib/supabase";

export const SHOP_SETTINGS_MIGRATION = "20261112_create_shop_settings.sql";
export const SHOP_BRANDING_BUCKET = "shop-branding";
export const SHOP_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const SHOP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type ShopSettingsRow = {
  shop_name: string;
  phone: string;
  address: string;
  logo_path: string | null;
  qr_path: string | null;
};

export type ShopSettings = ShopSettingsRow & {
  logoUrl: string | null;
  qrUrl: string | null;
};

// Documents keep rendering with these if the settings cannot be loaded.
export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  shop_name: "ຮ້ານ ບີຈີ ສປອຮ໌ດ",
  phone: "+856 20 9220 1288",
  address: "ບ້ານ ໂພນຕ້ອງສະຫວາດ ມ. ຈັນທະບູລີ ນະຄອນຫຼວງວຽງຈັນ",
  logo_path: null,
  qr_path: null,
  logoUrl: null,
  qrUrl: null,
};

export function shopSettingsError(error: { code?: string; message?: string }) {
  const missing = ["42P01", "42703", "PGRST205", "PGRST204", "PGRST202"].includes(error.code || "") || /bucket not found/i.test(error.message || "");
  return missing ? `ກະລຸນາລັນ ${SHOP_SETTINGS_MIGRATION} ໃນ Supabase SQL Editor ກ່ອນ` : error.message || "ໂຫຼດຂໍ້ມູນຮ້ານບໍ່ສຳເລັດ";
}

export function withShopImageUrls(row: ShopSettingsRow): ShopSettings {
  const urlFor = (path: string | null) => (path ? supabase.storage.from(SHOP_BRANDING_BUCKET).getPublicUrl(path).data.publicUrl : null);
  return { ...row, logoUrl: urlFor(row.logo_path), qrUrl: urlFor(row.qr_path) };
}

export async function fetchShopSettings() {
  const result = await supabase
    .from("shop_settings")
    .select("shop_name,phone,address,logo_path,qr_path")
    .eq("id", true)
    .maybeSingle<ShopSettingsRow>();
  return { data: result.data ? withShopImageUrls(result.data) : null, error: result.error };
}
