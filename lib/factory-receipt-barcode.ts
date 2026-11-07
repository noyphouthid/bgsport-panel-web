import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderSummary } from "./inventory-qr";

// factory: bill code printed by the factory (e.g. 26-184019).
// shop: our order code printed on the production sheet (e.g. RK26-11013).
export type ReceiptBarcodeSource = "factory" | "shop";
export const RECEIPT_BARCODE_SOURCES: ReceiptBarcodeSource[] = ["factory", "shop"];

const SOURCE_COLUMNS: Record<ReceiptBarcodeSource, string> = {
  factory: "factory_bill_code",
  shop: "order_code",
};

const SOURCE_LABELS: Record<ReceiptBarcodeSource, string> = {
  factory: "ລະຫັດບິນໂຮງງານ",
  shop: "ລະຫັດອໍເດີຮ້ານ",
};

export function getReceiptBarcodeSourceLabel(source: ReceiptBarcodeSource) {
  return SOURCE_LABELS[source];
}

// Unknown values are dropped and an empty selection falls back to both types,
// so the scanner can never end up accepting nothing.
export function normalizeReceiptBarcodeSources(value: unknown): ReceiptBarcodeSource[] {
  const list = Array.isArray(value) ? value : String(value ?? "").split(",");
  const picked = RECEIPT_BARCODE_SOURCES.filter((source) => list.map((item) => String(item).trim()).includes(source));
  return picked.length > 0 ? picked : [...RECEIPT_BARCODE_SOURCES];
}

export function describeReceiptBarcodeSources(sources: ReceiptBarcodeSource[]) {
  return normalizeReceiptBarcodeSources(sources).map((source) => SOURCE_LABELS[source]).join(" ຫຼື ");
}

// Keep the full printed code (including the year and hyphen). Some handheld
// scanners prepend an AIM symbology identifier such as ]C0 for Code 128.
export function normalizeFactoryBarcode(raw: string) {
  const code = raw.trim().replace(/^\][A-Za-z]\d/, "").trim();
  return /^[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*$/.test(code) ? code : "";
}

// The pattern above keeps the value safe inside the or() filter.
export async function findFactoryBarcodeOrder(
  client: SupabaseClient,
  raw: string,
  select: string,
  sourcesInput: ReceiptBarcodeSource[] = RECEIPT_BARCODE_SOURCES
) {
  const sources = normalizeReceiptBarcodeSources(sourcesInput);
  const code = normalizeFactoryBarcode(raw);
  if (!code) {
    const examples = sources.map((source) => `${SOURCE_LABELS[source]} ເຊັ່ນ ${source === "factory" ? "26-184019" : "RK26-11013"}`);
    throw new Error(`ກະລຸນາສະແກນ Barcode ${examples.join(" ຫຼື ")}`);
  }

  let query = client.from("orders").select(select);
  query =
    sources.length === 1
      ? query.eq(SOURCE_COLUMNS[sources[0]], code)
      : query.or(sources.map((source) => `${SOURCE_COLUMNS[source]}.eq.${code}`).join(","));
  const { data, error } = await query.limit(2);
  if (error) throw new Error(error.message);
  const matches = (data ?? []) as unknown as OrderSummary[];
  if (matches.length > 1) {
    throw new Error(`ລະຫັດ ${code} ກົງກັບຫຼາຍອໍເດີ ກະລຸນາຄົ້ນຫາ ແລະ ເລືອກອໍເດີດ້ານລຸ່ມ`);
  }
  return matches[0] || null;
}
