import { APP_NAVIGATION } from "@/lib/app-navigation";

export type PermissionMode = "inherit" | "allow" | "deny";
export type AccessPermissionKey = `/${string}`;
export type AccessPermissionItem = { key: AccessPermissionKey; label: string; group: string };

const ACCESS_GROUPS: Record<string, string> = {
  "/dashboard": "ໜ້າທົ່ວໄປ",
  "/orders": "ອໍເດີ",
  "/quotations": "ອໍເດີ",
  "/design-queue": "ອໍເດີ",
  "/shirt-catalog": "ໜ້າຮ້ານ",
  "/factory-deposit-orders": "ອໍເດີ",
  "/factory-production-queue": "ອໍເດີ",
  "/inventory-qr": "ຄັງ/ຂົນສົ່ງ",
  "/factory-receipts": "ຄັງ/ຂົນສົ່ງ",
  "/shipments": "ຄັງ/ຂົນສົ່ງ",
  "/change-requests": "ຄັງ/ຂົນສົ່ງ",
  "/reports": "ລາຍງານ",
  "/payments": "ການເງິນ",
  "/factory-payments": "ການເງິນ",
  "/payroll": "ການເງິນ",
  "/users": "ຕັ້ງຄ່າ",
  "/imports": "ຕັ້ງຄ່າ",
  "/fabric": "ຕັ້ງຄ່າ",
  "/order-code-types": "ຕັ້ງຄ່າ",
  "/order-alerts": "ອໍເດີ",
};

// Pages reached through buttons/tabs rather than the sidebar.
const ADDITIONAL_ACCESS_ITEMS: AccessPermissionItem[] = [
  { key: "/orders/new", label: "ສ້າງອໍເດີໃໝ່", group: "ອໍເດີ" },
  { key: "/reports", label: "ລາຍງານທົ່ວໄປ", group: "ລາຍງານ" },
  { key: "/design-queue/completed", label: "ຄິວອອກແບບສຳເລັດ", group: "ອໍເດີ" },
  { key: "/factory-deposit-orders/new", label: "ສ້າງໃບມັດຈຳສັ່ງຜະລິດ", group: "ອໍເດີ" },
  { key: "/factory-production-queue/activity/completed", label: "ສະຫຼຸບການຜະລິດສຳເລັດ", group: "ອໍເດີ" },
  { key: "/factory-production-queue/awaiting-factory", label: "ລໍຖ້າໂຮງງານຮັບວຽກ", group: "ອໍເດີ" },
  { key: "/factory-production-queue/in-production", label: "ກຳລັງຜະລິດ", group: "ອໍເດີ" },
  { key: "/factory-production-queue/pattern-laid", label: "ວາງ Pattern ແລ້ວ", group: "ອໍເດີ" },
  { key: "/factory-production-queue/ready-for-print", label: "ພ້ອມພິມ", group: "ອໍເດີ" },
  { key: "/factory-production-queue/sent-to-factory", label: "ສົ່ງໂຮງງານແລ້ວ", group: "ອໍເດີ" },
  { key: "/quotations/new", label: "ສ້າງໃບປະເມີນລາຄາ", group: "ອໍເດີ" },
  { key: "/shipments/transport-note", label: "ສ້າງໃບຝາກເຄື່ອງ", group: "ຄັງ/ຂົນສົ່ງ" },
  { key: "/users/permissions", label: "ກຳນົດສິດພະນັກງານ", group: "ຕັ້ງຄ່າ" },
];

// A new sidebar link automatically becomes an employee access-permission option.
export const ACCESS_PERMISSION_ITEMS: AccessPermissionItem[] = [
  ...APP_NAVIGATION.flatMap((item) => (item.type === "group" ? item.items : [item])).map((item) => ({
    key: item.href,
    label: item.label,
    group: ACCESS_GROUPS[`/${item.href.split("/")[1]}`] || "ໜ້າອື່ນໆ",
  })),
  ...ADDITIONAL_ACCESS_ITEMS,
];

const SORTED_ACCESS_ITEMS = [...ACCESS_PERMISSION_ITEMS].sort((a, b) => b.key.length - a.key.length);

export const EDIT_PERMISSION_ITEMS = [
  { key: "orders", label: "ແກ້ໄຂອໍເດີ", description: "ບັນທຶກ, ປິດງານ, ລົບ, ແກ້ໄຂລາຍລະອຽດອໍເດີ" },
  { key: "design_queue", label: "ແກ້ໄຂຄິວອອກແບບ", description: "ເພີ່ມ, ແກ້ໄຂ, ລຶບ, ແລະ ຕິກສະຖານະຄິວ" },
  { key: "shirt_catalog", label: "ເຜີຍແຜ່ແບບເສື້ອ", description: "ຈັດການແບບ, ລາຄາ Store ແລະ ການເຜີຍແຜ່ໜ້າຮ້ານ" },
  { key: "factory_deposit_orders", label: "ແກ້ໄຂການມັດຈຳສັ່ງຜະລິດ", description: "ບັນທຶກ ແລະ ແກ້ໄຂຂໍ້ມູນໃບມັດຈຳ" },
  { key: "factory_production_queue", label: "ແກ້ໄຂຄິວວາງຜະລິດ", description: "ມອບໝາຍຄິວ, ປ່ຽນສະຖານະວາງ Pattern, ແລະ ສົ່ງໂຮງງານ" },
] as const;

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
  // Preserve saved parent permissions when a child gets its own catalog entry.
  // Explicit child settings take precedence; inherit continues up to the role default.
  for (const item of SORTED_ACCESS_ITEMS) {
    if (key !== item.key && !key.startsWith(`${item.key}/`)) continue;
    const mode = normalizePermissionMode(settings?.access?.[item.key]);
    if (mode !== "inherit") return mode;
  }
  return "inherit";
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
  const matched = SORTED_ACCESS_ITEMS.find((item) => normalizedPath === item.key || normalizedPath.startsWith(`${item.key}/`));
  return matched?.key || null;
}

export function buildDefaultPermissionSettings(): UserPermissionSettings {
  return { access: {}, edit: {} };
}
