import type { InternalDocumentOption } from "@/lib/internal-document-options";

export const PRODUCTION_COLLARS_MIGRATION = "20261105_create_production_collar_types.sql";
export const DEFAULT_PRODUCTION_COLLARS: InternalDocumentOption[] = [
  ["crew", "ຄໍມົນ"],
  ["crew_dyed_rib", "ຄໍມົນຜ້າບຸ້ງຍ້ອມ"],
  ["crew_printed_rib", "ຄໍມົນຜ້າບຸ້ງພິມລາຍ"],
  ["polo", "ໂປໂລ"],
  ["mandarin", "ຄໍຈີນ"],
  ["v_cut_polo", "ຄໍໂປໂລວີຕັດ"],
  ["v_neck", "ຄໍວີ"],
  ["cross_v", "ຄໍວີໄຂວ່"],
  ["cut_v", "ຄໍວີຕັດ"],
  ["pentagon", "ຄໍ 5 ຫຼ່ຽມ"],
  ["v_polo", "ຄໍໂປໂລວີ"],
  ["cross_v_polo", "ຄໍໂປໂລວີໄຂວ່"],
  ["y_neck", "ຄໍ Y"],
  ["sharp_v", "ຄໍ V ໂຊສາບ"],
].map(([code, label], index) => ({ code, label, sort_order: index * 10, is_active: true }));

export function normalizeProductionCollarCode(value: unknown, fallback = "crew") {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{0,59}$/.test(value) ? value : fallback;
}

export function getProductionCollarLabel(code: string | null | undefined, savedLabel?: string | null) {
  return savedLabel?.trim() || DEFAULT_PRODUCTION_COLLARS.find(row => row.code === code)?.label || code || "-";
}

export function selectableProductionCollars(options: InternalDocumentOption[], code: string, savedLabel?: string) {
  const visible = options.filter(row => row.is_active || row.code === code).map(row =>
    row.code === code && savedLabel ? { ...row, label: savedLabel } : row);
  if (!visible.some(row => row.code === code)) {
    visible.push({ code, label: getProductionCollarLabel(code, savedLabel), is_active: false, sort_order: 0 });
  }
  return visible;
}
