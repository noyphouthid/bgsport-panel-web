export const ORDER_WORK_CATEGORIES = [
  { value: "team_group", label: "ເສື້ອທີມງານ / ເສື້ອກຸ່ມ" },
  { value: "cockfighting", label: "ເສື້ອໄກ່ຕີ" },
  { value: "boat_racing", label: "ເສື້ອຊ່ວງເຮືອ" },
  { value: "automotive", label: "ເສື້ອລົດ" },
  { value: "rocket_festival", label: "ເສື້ອບຸນບັ້ງໄຟ" },
  { value: "religious", label: "ເສື້ອສາຍບຸນ" },
  { value: "sports", label: "ເສື້ອກິລາ" },
  { value: "other", label: "ອື່ນໆ" },
] as const;

export type OrderWorkCategory = string;

export function normalizeOrderWorkCategory(value: unknown): OrderWorkCategory | null {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{0,59}$/.test(value) ? value : null;
}

export function getOrderWorkCategoryLabel(value: unknown, options: ReadonlyArray<{ value: string; label: string }> = ORDER_WORK_CATEGORIES) {
  return options.find((category) => category.value === value)?.label ?? normalizeOrderWorkCategory(value) ?? "ຍັງບໍ່ລະບຸ";
}

export function isMissingWorkCategoryError(error: { message?: string; code?: string } | null) {
  return Boolean(error?.message?.includes("work_category") && (error.code === "42703" || error.code === "PGRST204"));
}
