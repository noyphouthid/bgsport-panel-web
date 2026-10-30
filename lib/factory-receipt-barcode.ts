import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderSummary } from "./inventory-qr";

// Keep the full printed code (including the year and hyphen). Some handheld
// scanners prepend an AIM symbology identifier such as ]C0 for Code 128.
export function normalizeFactoryBarcode(raw: string) {
  const code = raw.trim().replace(/^\][A-Za-z]\d/, "").trim();
  return /^[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*$/.test(code) ? code : "";
}

export async function findFactoryBarcodeOrder(client: SupabaseClient, raw: string, select: string) {
  const code = normalizeFactoryBarcode(raw);
  if (!code) throw new Error("ກະລຸນາສະແກນ Barcode ລະຫັດບິນໂຮງງານ ເຊັ່ນ 26-184019");

  const { data, error } = await client.from("orders").select(select).eq("factory_bill_code", code).limit(2);
  if (error) throw new Error(error.message);
  const matches = (data ?? []) as unknown as OrderSummary[];
  if (matches.length > 1) {
    throw new Error(`ລະຫັດບິນໂຮງງານ ${code} ກົງກັບຫຼາຍອໍເດີ ກະລຸນາຄົ້ນຫາ ແລະ ເລືອກອໍເດີດ້ານລຸ່ມ`);
  }
  return matches[0] || null;
}
