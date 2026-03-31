export type FactoryDepositOrderStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "converted"
  | "cancelled";

export const FACTORY_DEPOSIT_ORDER_STATUS_LABELS: Record<FactoryDepositOrderStatus, string> = {
  draft: "ຮ່າງ",
  submitted: "ສົ່ງແລ້ວ",
  approved: "ອະນຸມັດແລ້ວ",
  converted: "ບັນທຶກເປັນອໍເດີແລ້ວ",
  cancelled: "ຍົກເລີກ",
};

export const FACTORY_DEPOSIT_ORDER_STATUS_STYLES: Record<FactoryDepositOrderStatus, string> = {
  draft: "bg-amber-100 text-amber-700 border border-amber-200",
  submitted: "bg-sky-100 text-sky-700 border border-sky-200",
  approved: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  converted: "bg-violet-100 text-violet-700 border border-violet-200",
  cancelled: "bg-rose-100 text-rose-700 border border-rose-200",
};

export type FactoryDepositOrderAction =
  | "create"
  | "update"
  | "submit"
  | "approve"
  | "convert_to_order"
  | "cancel"
  | "delete";

export type FactoryDepositOrder = {
  id: string;
  quotation_draft_id: string | null;
  quotation_quote_no: string | null;
  deposit_no: string;
  deposit_date: string;
  order_code: string | null;
  order_date: string | null;
  status: FactoryDepositOrderStatus;
  order_id: string | null;
  converted_at: string | null;
  approved_at: string | null;
  cancelled_at: string | null;
  customer_name: string;
  customer_phone: string;
  customer_whatsapp: string;
  customer_facebook: string;
  team_name: string;
  production_sent_date: string | null;
  production_priority: "normal" | "urgent";
  urgent_due_date: string | null;
  fabric_id: string | null;
  fabric_name: string;
  fabric_short_price: number;
  fabric_long_price: number;
  style_name: string;
  color_name: string;
  sleeve_type: "short" | "long" | "mixed";
  collar_type: "none" | "polo" | "mandarin";
  collar_qty: number;
  short_qty: number;
  long_qty: number;
  free_qty: number;
  qty_3xl: number;
  qty_4xl: number;
  qty_5xl: number;
  qty_6xl: number;
  extra_charge: number;
  discount: number;
  design_deposit: number;
  initial_deposit: number;
  factory_deposit_amount: number;
  factory_cost: number;
  gross_total: number;
  net_total: number;
  balance: number;
  payment_due_date: string | null;
  delivery_date: string | null;
  factory_bill_code: string | null;
  payment_terms: string;
  notes: string;
  warning_note: string;
  factory_deposit_note: string;
  production_items: unknown[];
  transfer_slip_url: string | null;
  transfer_slip_path: string | null;
  created_by_user_id: string | null;
  admin_user_id: string | null;
  graphic_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export function canEditFactoryDepositOrder(
  status: FactoryDepositOrderStatus,
  role: "superadmin" | "admin" | "manager" | "staff" | "graphic" | "accountant"
) {
  if (role === "superadmin" || role === "accountant" || role === "admin") return status !== "converted";
  return status === "draft" || status === "submitted";
}

export function canApproveFactoryDepositOrder(
  role: "superadmin" | "admin" | "manager" | "staff" | "graphic" | "accountant"
) {
  return role === "superadmin" || role === "accountant";
}

export function canConvertFactoryDepositOrder(
  role: "superadmin" | "admin" | "manager" | "staff" | "graphic" | "accountant"
) {
  return role === "superadmin" || role === "accountant";
}

export function canDeleteFactoryDepositOrder(
  role: "superadmin" | "admin" | "manager" | "staff" | "graphic" | "accountant"
) {
  return role === "superadmin" || role === "accountant" || role === "admin";
}
