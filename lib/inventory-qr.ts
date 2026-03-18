export type OrderQrLabelStatus = "created" | "received" | "shipped";

export type OrderSummary = {
  id: string;
  order_code: string;
  factory_bill_code: string | null;
  order_date?: string;
  production_completed_at?: string | null;
  short_qty?: number;
  long_qty?: number;
  free_qty?: number;
  qty_3xl?: number;
  qty_4xl?: number;
  qty_5xl?: number;
  net_total?: number;
  balance?: number;
  initial_deposit?: number;
  factory_cost?: number;
  customer_paid_full_at?: string | null;
  factory_paid_full_at?: string | null;
  status?: "in_progress" | "completed";
};

export type QrLabelRow = {
  id: string;
  order_id: string;
  qr_code: string;
  order_code: string;
  factory_bill_code: string | null;
  label_status: OrderQrLabelStatus;
  received_at: string | null;
  received_by: string | null;
  shipped_at: string | null;
  shipped_by: string | null;
  last_scanned_at: string | null;
  created_at: string;
  updated_at?: string;
};

const QR_PREFIX = "BGSPORT-ORDER";

export function buildOrderQrCode(order: Pick<OrderSummary, "id" | "order_code" | "factory_bill_code">) {
  const parts = [QR_PREFIX, order.id, order.order_code.trim(), (order.factory_bill_code || "").trim()];
  return parts.join("|");
}

export function normalizeQrCode(raw: string) {
  return String(raw || "").trim();
}

export function getTotalUnits(order: Partial<OrderSummary>) {
  return (
    Number(order.short_qty || 0) +
    Number(order.long_qty || 0) +
    Number(order.free_qty || 0) +
    Number(order.qty_3xl || 0) +
    Number(order.qty_4xl || 0) +
    Number(order.qty_5xl || 0)
  );
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function formatCurrency(value?: number | null) {
  return Number(value || 0).toLocaleString();
}
