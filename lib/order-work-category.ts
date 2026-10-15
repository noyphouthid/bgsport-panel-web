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

export type OrderWorkCategory = (typeof ORDER_WORK_CATEGORIES)[number]["value"];

export function normalizeOrderWorkCategory(value: unknown): OrderWorkCategory | null {
  return ORDER_WORK_CATEGORIES.find((category) => category.value === value)?.value ?? null;
}

export function getOrderWorkCategoryLabel(value: unknown) {
  return ORDER_WORK_CATEGORIES.find((category) => category.value === value)?.label ?? "ຍັງບໍ່ລະບຸ";
}

export function isMissingWorkCategoryError(error: { message?: string; code?: string } | null) {
  return Boolean(error?.message?.includes("work_category") && (error.code === "42703" || error.code === "PGRST204"));
}
