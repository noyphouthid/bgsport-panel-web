export type PermissionMode = "inherit" | "allow" | "deny";

export const ACCESS_PERMISSION_ITEMS = [
  { key: "/dashboard", label: "ໜ້າຫຼັກ", group: "ໜ້າທົ່ວໄປ" },
  { key: "/search", label: "ຄົ້ນຫາອໍເດີ", group: "ໜ້າທົ່ວໄປ" },
  { key: "/orders", label: "ລາຍການອໍເດີ", group: "ອໍເດີ" },
  { key: "/orders/new", label: "ສ້າງອໍເດີໃໝ່", group: "ອໍເດີ" },
  { key: "/quotations", label: "ໃບປະເມີນລາຄາ", group: "ອໍເດີ" },
  { key: "/design-queue", label: "ຄິວອອກແບບ", group: "ອໍເດີ" },
  { key: "/factory-deposit-orders", label: "ມັດຈຳສັ່ງຜະລິດ", group: "ອໍເດີ" },
  { key: "/factory-production-status", label: "ສະຖານະໂຮງງານ", group: "ອໍເດີ" },
  { key: "/inventory-qr", label: "ສ້າງ QR", group: "ຄັງ/ຂົນສົ່ງ" },
  { key: "/factory-receipts", label: "ຮັບສິນຄ້າເຂົ້າ", group: "ຄັງ/ຂົນສົ່ງ" },
  { key: "/shipments", label: "ຈັດສົ່ງສິນຄ້າ", group: "ຄັງ/ຂົນສົ່ງ" },
  { key: "/change-requests", label: "ຄຳຂໍປ່ຽນແປງ", group: "ຄັງ/ຂົນສົ່ງ" },
  { key: "/reports", label: "ລາຍງານທົ່ວໄປ", group: "ລາຍງານ" },
  { key: "/reports/data-export", label: "ລາຍງານດຶງຂໍ້ມູນ", group: "ລາຍງານ" },
  { key: "/reports/monthly-close", label: "ປິດຍອດປະຈຳເດືອນ", group: "ລາຍງານ" },
  { key: "/payments", label: "ບັນຊີການຊຳລະເງິນ", group: "ການເງິນ" },
  { key: "/factory-payments", label: "ຊຳລະຄ່າໂຮງງານ", group: "ການເງິນ" },
  { key: "/payroll", label: "ເງິນເດືອນ", group: "ການເງິນ" },
  { key: "/users", label: "ຈັດການຜູ້ໃຊ້", group: "ຕັ້ງຄ່າ" },
  { key: "/imports", label: "ນຳເຂົ້າ Excel", group: "ຕັ້ງຄ່າ" },
  { key: "/fabric", label: "ລາຄາຜ້າ", group: "ຕັ້ງຄ່າ" },
  { key: "/order-code-types", label: "ປະເພດລະຫັດ", group: "ຕັ້ງຄ່າ" },
] as const;

export const EDIT_PERMISSION_ITEMS = [
  { key: "orders", label: "ແກ້ໄຂອໍເດີ", description: "ບັນທຶກ, ປິດງານ, ລົບ, ແກ້ໄຂລາຍລະອຽດອໍເດີ" },
  { key: "design_queue", label: "ແກ້ໄຂຄິວອອກແບບ", description: "ເພີ່ມ, ແກ້ໄຂ, ລຶບ, ແລະ ຕິກສະຖານະຄິວ" },
  { key: "factory_deposit_orders", label: "ແກ້ໄຂການມັດຈຳສັ່ງຜະລິດ", description: "ບັນທຶກ ແລະ ແກ້ໄຂຂໍ້ມູນໃບມັດຈຳ" },
] as const;

export type AccessPermissionKey = (typeof ACCESS_PERMISSION_ITEMS)[number]["key"];
export type EditPermissionKey = (typeof EDIT_PERMISSION_ITEMS)[number]["key"];

export type UserPermissionSettings = {
  access?: Partial<Record<AccessPermissionKey, PermissionMode>>;
  edit?: Partial<Record<EditPermissionKey, PermissionMode>>;
};

const VALID_PERMISSION_MODES = new Set<PermissionMode>(["inherit", "allow", "deny"]);
const ACCESS_PERMISSION_KEYS = new Set<string>(ACCESS_PERMISSION_ITEMS.map((item) => item.key));
const EDIT_PERMISSION_KEYS = new Set<string>(EDIT_PERMISSION_ITEMS.map((item) => item.key));

export function normalizePermissionMode(value: unknown): PermissionMode {
  if (typeof value !== "string") return "inherit";
  return VALID_PERMISSION_MODES.has(value as PermissionMode) ? (value as PermissionMode) : "inherit";
}

export function normalizeUserPermissionSettings(value: unknown): UserPermissionSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { access: {}, edit: {} };
  }

  const raw = value as { access?: Record<string, unknown>; edit?: Record<string, unknown> };
  const accessEntries = Object.entries(raw.access || {}).filter(([key]) => ACCESS_PERMISSION_KEYS.has(key));
  const editEntries = Object.entries(raw.edit || {}).filter(([key]) => EDIT_PERMISSION_KEYS.has(key));

  return {
    access: Object.fromEntries(accessEntries.map(([key, mode]) => [key, normalizePermissionMode(mode)])) as Partial<
      Record<AccessPermissionKey, PermissionMode>
    >,
    edit: Object.fromEntries(editEntries.map(([key, mode]) => [key, normalizePermissionMode(mode)])) as Partial<
      Record<EditPermissionKey, PermissionMode>
    >,
  };
}

export function getAccessPermissionMode(settings: UserPermissionSettings | null | undefined, key: AccessPermissionKey): PermissionMode {
  return normalizePermissionMode(settings?.access?.[key]);
}

export function getEditPermissionMode(settings: UserPermissionSettings | null | undefined, key: EditPermissionKey): PermissionMode {
  return normalizePermissionMode(settings?.edit?.[key]);
}

export function resolvePermissionMode(mode: PermissionMode, fallback: boolean) {
  if (mode === "allow") return true;
  if (mode === "deny") return false;
  return fallback;
}

export function canEditWithPermissions(
  settings: UserPermissionSettings | null | undefined,
  key: EditPermissionKey,
  fallback: boolean
) {
  return resolvePermissionMode(getEditPermissionMode(settings, key), fallback);
}

export function findAccessPermissionKey(pathname: string): AccessPermissionKey | null {
  const normalizedPath = pathname === "/" ? "/" : pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const matched = [...ACCESS_PERMISSION_ITEMS]
    .sort((a, b) => b.key.length - a.key.length)
    .find((item) => normalizedPath === item.key || normalizedPath.startsWith(`${item.key}/`));
  return matched?.key || null;
}

export function buildDefaultPermissionSettings(): UserPermissionSettings {
  return { access: {}, edit: {} };
}
