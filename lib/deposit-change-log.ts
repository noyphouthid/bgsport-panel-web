// Turns the field changes recorded by log_factory_deposit_field_changes() into Lao text.

export type DepositFieldChange = { field: string; from?: unknown; to?: unknown };

export const DEPOSIT_CHANGE_FIELD_LABELS: Record<string, string> = {
  order_code: "ລະຫັດອໍເດີ",
  deposit_date: "ວັນທີໃບມັດຈຳ",
  customer_name: "ຊື່ລູກຄ້າ",
  customer_phone: "ເບີໂທລູກຄ້າ",
  customer_whatsapp: "WhatsApp",
  customer_facebook: "Facebook",
  team_name: "ຊື່ທີມ",
  fabric_name: "ຜ້າ",
  style_name: "ແບບເສື້ອ",
  color_name: "ສີ",
  sleeve_type: "ແຂນເສື້ອ",
  collar_label: "ຄໍເສື້ອ",
  work_category_label: "ປະເພດງານ",
  short_qty: "ຈຳນວນແຂນສັ້ນ",
  long_qty: "ຈຳນວນແຂນຍາວ",
  free_qty: "ຈຳນວນແຖມ",
  qty_3xl: "ຈຳນວນ 3XL",
  qty_4xl: "ຈຳນວນ 4XL",
  qty_5xl: "ຈຳນວນ 5XL",
  qty_6xl: "ຈຳນວນ 6XL",
  collar_qty: "ຈຳນວນບວກຄໍ",
  sleeve_charge_qty: "ຈຳນວນບວກແຂນ",
  fabric_short_price: "ລາຄາແຂນສັ້ນ",
  fabric_long_price: "ລາຄາແຂນຍາວ",
  collar_unit_price: "ລາຄາບວກຄໍ",
  extra_charge: "ບວກເພີ່ມ",
  discount: "ສ່ວນຫຼຸດ",
  design_deposit: "ຫັກຄ່າແບບ",
  initial_deposit: "ມັດຈຳສັ່ງຜະລິດ",
  factory_deposit_amount: "ມັດຈຳໂຮງງານ",
  factory_cost: "ຕົ້ນທຶນໂຮງງານ",
  gross_total: "ຍອດກ່ອນຫັກ",
  net_total: "ຍອດສຸດທິ",
  balance: "ຍອດຄ້າງຈາກລູກຄ້າ",
  production_sent_date: "ວັນທີສົ່ງຜະລິດ",
  delivery_date: "ກຳນົດສົ່ງລູກຄ້າ",
  payment_due_date: "ກຳນົດຊຳລະ",
  production_priority: "ຄວາມຮີບດ່ວນ",
  urgent_due_date: "ວັນທີງານດ່ວນ",
  factory_bill_code: "ລະຫັດບິນໂຮງງານ",
  payment_terms: "ເງື່ອນໄຂຊຳລະ",
  notes: "ໝາຍເຫດ",
  warning_note: "ໝາຍເຫດເຕືອນ",
  factory_deposit_note: "ໝາຍເຫດມັດຈຳໂຮງງານ",
  admin_user_id: "Admin",
  graphic_user_id: "Graphic",
  transfer_slip_url: "ສະລິບໂອນເງິນ",
  production_items: "ລາຍການຜະລິດ (ໄຊສ໌ / ຊື່ / ເບີ / ຮູບ)",
  pants_items: "ລາຍການໂສ້ງ",
};

const MONEY_FIELDS = new Set([
  "fabric_short_price", "fabric_long_price", "collar_unit_price", "extra_charge", "discount", "design_deposit",
  "initial_deposit", "factory_deposit_amount", "factory_cost", "gross_total", "net_total", "balance",
]);
const DATE_FIELDS = new Set(["deposit_date", "production_sent_date", "delivery_date", "payment_due_date", "urgent_due_date"]);
const USER_FIELDS = new Set(["admin_user_id", "graphic_user_id"]);
// Only the fact of the change is shown: lists are long and slip links are not readable.
const SUMMARY_ONLY_FIELDS = new Set(["production_items", "pants_items", "transfer_slip_url"]);
const VALUE_LABELS: Record<string, Record<string, string>> = {
  sleeve_type: { short: "ແຂນສັ້ນ", long: "ແຂນຍາວ", mixed: "ແຂນສັ້ນ/ແຂນຍາວ" },
  production_priority: { normal: "ປົກກະຕິ", urgent: "ດ່ວນ" },
};
const MAX_TEXT_LENGTH = 60;

export function parseDepositFieldChanges(raw: unknown): DepositFieldChange[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) =>
    entry && typeof entry === "object" && typeof (entry as { field?: unknown }).field === "string" ? [entry as DepositFieldChange] : []
  );
}

export function formatDepositChangeValue(field: string, value: unknown, userNames?: ReadonlyMap<string, string>) {
  if (value === null || value === undefined || value === "") return "-";
  if (USER_FIELDS.has(field)) return userNames?.get(String(value)) || "-";
  if (MONEY_FIELDS.has(field)) {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount.toLocaleString("en-US") : String(value);
  }
  if (DATE_FIELDS.has(field)) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
  }
  const text = VALUE_LABELS[field]?.[String(value)] ?? String(value);
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}…` : text;
}

/** One line per change, e.g. "ຈຳນວນແຂນສັ້ນ: 20 → 25". */
export function describeDepositFieldChange(change: DepositFieldChange, userNames?: ReadonlyMap<string, string>) {
  const label = DEPOSIT_CHANGE_FIELD_LABELS[change.field] || change.field;
  if (SUMMARY_ONLY_FIELDS.has(change.field)) return { label, text: "ມີການປ່ຽນແປງ" };
  return {
    label,
    text: `${formatDepositChangeValue(change.field, change.from, userNames)} → ${formatDepositChangeValue(change.field, change.to, userNames)}`,
  };
}
