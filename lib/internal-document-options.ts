import { ORDER_WORK_CATEGORIES } from "@/lib/order-work-category";

export const INTERNAL_DOCUMENT_OPTIONS_MIGRATION = "20261104_create_internal_document_options.sql";
export type InternalOptionKind = "collars" | "work-categories" | "production-collars";
export type InternalDocumentOption = { code: string; label: string; sort_order: number; is_active: boolean; unit_price?: number };
export const INTERNAL_OPTION_TABLES = { collars: "internal_collar_types", "work-categories": "internal_work_categories", "production-collars": "internal_production_collar_types" } as const;
export const DEFAULT_INTERNAL_COLLARS: InternalDocumentOption[] = [
  { code: "none", label: "ຄໍປົກກະຕິ", unit_price: 0, sort_order: 0, is_active: true },
  { code: "polo", label: "ຄໍໂປໂລ", unit_price: 20000, sort_order: 10, is_active: true },
  { code: "mandarin", label: "ຄໍຈີນ", unit_price: 20000, sort_order: 20, is_active: true },
];
export const DEFAULT_INTERNAL_WORK_CATEGORIES: InternalDocumentOption[] = ORDER_WORK_CATEGORIES.map((row, index) => ({ code: row.value, label: row.label, sort_order: (index + 1) * 10, is_active: true }));

export function legacyCollarPrice(code: string) { return code === "none" ? 0 : 20000; }
export function legacyCollarLabel(code: string) { return DEFAULT_INTERNAL_COLLARS.find(row => row.code === code)?.label || code; }
export function internalOptionsError(error: { code?: string; message?: string }, migration = INTERNAL_DOCUMENT_OPTIONS_MIGRATION) {
  return ["42P01", "42703", "PGRST205", "PGRST204", "PGRST202"].includes(error.code || "")
    ? `ກະລຸນາລັນ ${migration} ໃນ Supabase SQL Editor ກ່ອນ`
    : error.message || "ໂຫຼດລາຍການຕັ້ງຄ່າບໍ່ສຳເລັດ";
}
