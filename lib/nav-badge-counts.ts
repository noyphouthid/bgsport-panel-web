import type { AppRole } from "@/lib/access-control";
import { canManageAllFactoryDepositOrders } from "@/lib/factory-deposit-orders";
import { supabase } from "@/lib/supabase";
import { canManageAllTransportNotes } from "@/lib/transport-notes";

export const NAV_BADGE_PATHS = [
  "/factory-deposit-orders",
  "/order-alerts",
  "/factory-receipts/orders",
  "/shipments/notes",
  "/shipments/approvals",
  "/design-queue",
] as const;

export type NavBadgePath = (typeof NAV_BADGE_PATHS)[number];

export type NavBadgeEntry = {
  count: number;
  signature: string;
};

export type NavBadgeCounts = Partial<Record<NavBadgePath, NavBadgeEntry>>;

type NavBadgeProfile = {
  id: string;
  role: AppRole;
};

type OrderAlertDepositRow = {
  id: string;
  order_id: string | null;
  delivery_date: string | null;
  updated_at?: string | null;
};

type OrderAlertOrderState = {
  id: string;
  status: "in_progress" | "completed";
  closed_at: string | null;
  production_completed_at: string | null;
  shipment_status: "pending" | "shipped" | null;
  shipment_completed_at: string | null;
};

type ReceiptItemOrderRow = {
  receipt_id?: string | null;
  order_id: string | null;
};

type ReceiptOrderState = {
  id: string;
  status: "in_progress" | "completed";
  closed_at: string | null;
  shipment_status: "pending" | "shipped" | null;
  shipment_completed_at: string | null;
  updated_at?: string | null;
};

type TransportNoteBadgeRow = {
  id: string;
  print_count: number | null;
  printed_at: string | null;
  last_printed_at: string | null;
  created_by_user_id: string | null;
  updated_at?: string | null;
};

type ShipmentApprovalBadgeRow = {
  id: string;
  updated_at: string | null;
};

type DesignQueueBadgeRow = {
  id: string;
  updated_at: string | null;
};

function buildSignature(parts: Array<string | null | undefined>) {
  return parts.filter((part) => Boolean(part)).join("|");
}

function parseDateOnly(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toDateOnlyValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function diffDaysFromToday(value: string | null) {
  const target = parseDateOnly(value);
  if (!target) return null;
  const msPerDay = 86_400_000;
  return Math.round((target.getTime() - startOfToday().getTime()) / msPerDay);
}

function isOrderStillOpen(order: OrderAlertOrderState | null) {
  if (!order) return true;
  if (order.status === "completed" || order.closed_at) return false;
  if (order.production_completed_at) return false;
  if (order.shipment_status === "shipped" || order.shipment_completed_at) return false;
  return true;
}

async function fetchFactoryDepositOrderBadgeCount(profile: NavBadgeProfile) {
  let query = supabase.from("factory_deposit_orders").select("id,updated_at").eq("status", "submitted");
  if (!canManageAllFactoryDepositOrders(profile.role)) {
    query = query.eq("created_by_user_id", profile.id);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; updated_at: string | null }>;
  return {
    count: rows.length,
    signature: buildSignature(rows.map((row) => `${row.id}:${row.updated_at || ""}`).sort()),
  };
}

async function fetchOrderAlertsBadgeCount() {
  const nearDueDate = startOfToday();
  nearDueDate.setDate(nearDueDate.getDate() + 3);

  const { data: depositData, error: depositError } = await supabase
    .from("factory_deposit_orders")
    .select("id,order_id,delivery_date,updated_at")
    .not("order_id", "is", null)
    .not("delivery_date", "is", null)
    .lte("delivery_date", toDateOnlyValue(nearDueDate));

  if (depositError) throw depositError;

  const deposits = (depositData ?? []) as OrderAlertDepositRow[];
  const orderIds = Array.from(new Set(deposits.map((row) => row.order_id).filter((value): value is string => Boolean(value))));

  if (orderIds.length === 0) return { count: 0, signature: "" };

  const [{ data: orderData, error: orderError }, { data: receiptData, error: receiptError }] = await Promise.all([
    supabase.from("orders").select("id,status,closed_at,production_completed_at,shipment_status,shipment_completed_at").in("id", orderIds),
    supabase.from("factory_receipt_items").select("order_id").in("order_id", orderIds),
  ]);

  if (orderError) throw orderError;
  if (receiptError) throw receiptError;

  const ordersById = new Map(((orderData ?? []) as OrderAlertOrderState[]).map((row) => [row.id, row]));
  const receivedOrderIds = new Set(((receiptData ?? []) as Array<{ order_id: string | null }>).map((row) => row.order_id).filter(Boolean));

  const rows = deposits.filter((row) => {
    const dueInDays = diffDaysFromToday(row.delivery_date);
    if (dueInDays === null || dueInDays > 3) return false;
    if (!row.order_id) return false;
    if (receivedOrderIds.has(row.order_id)) return false;
    return isOrderStillOpen(ordersById.get(row.order_id) || null);
  });

  return {
    count: rows.length,
    signature: buildSignature(rows.map((row) => `${row.id}:${row.delivery_date || ""}:${row.updated_at || ""}`).sort()),
  };
}

async function fetchFactoryReceiptOrdersBadgeCount() {
  const { data: itemData, error: itemError } = await supabase.from("factory_receipt_items").select("receipt_id,order_id");
  if (itemError) throw itemError;

  const orderIds = Array.from(new Set(((itemData ?? []) as ReceiptItemOrderRow[]).map((row) => row.order_id).filter((value): value is string => Boolean(value))));
  if (orderIds.length === 0) return { count: 0, signature: "" };

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select("id,status,closed_at,shipment_status,shipment_completed_at,updated_at")
    .in("id", orderIds);

  if (orderError) throw orderError;

  const itemRows = (itemData ?? []) as ReceiptItemOrderRow[];
  const itemKeysByOrderId = new Map<string, string[]>();
  for (const row of itemRows) {
    if (!row.order_id) continue;
    const next = itemKeysByOrderId.get(row.order_id) || [];
    next.push(`${row.receipt_id || ""}:${row.order_id}`);
    itemKeysByOrderId.set(row.order_id, next);
  }

  const rows = ((orderData ?? []) as ReceiptOrderState[]).filter(
    (row) => row.status !== "completed" && !row.closed_at && row.shipment_status !== "shipped" && !row.shipment_completed_at
  );

  return {
    count: rows.length,
    signature: buildSignature(
      rows
        .map((row) => `${row.id}:${row.updated_at || ""}:${(itemKeysByOrderId.get(row.id) || []).sort().join(",")}`)
        .sort()
    ),
  };
}

async function fetchShipmentNotesBadgeCount(profile: NavBadgeProfile) {
  const { data, error } = await supabase
    .from("transport_notes")
    .select("id,print_count,printed_at,last_printed_at,created_by_user_id,updated_at");
  if (error) throw error;

  const rows = ((data ?? []) as TransportNoteBadgeRow[]).filter((row) => {
    if (!canManageAllTransportNotes(profile.role) && row.created_by_user_id !== profile.id) return false;
    return !(Number(row.print_count) > 0 || row.printed_at || row.last_printed_at);
  });

  return {
    count: rows.length,
    signature: buildSignature(rows.map((row) => `${row.id}:${row.updated_at || ""}`).sort()),
  };
}

async function fetchShipmentApprovalsBadgeCount() {
  const { data, error } = await supabase
    .from("shipment_delivery_requests")
    .select("id,updated_at")
    .eq("status", "submitted");

  if (error) throw error;
  const rows = (data ?? []) as ShipmentApprovalBadgeRow[];
  return {
    count: rows.length,
    signature: buildSignature(rows.map((row) => `${row.id}:${row.updated_at || ""}`).sort()),
  };
}

async function fetchDesignQueueBadgeCount(profile: NavBadgeProfile) {
  let query = supabase.from("design_queue_entries").select("id,updated_at").eq("is_designed", false);
  if (profile.role === "graphic") {
    query = query.eq("graphic_user_id", profile.id);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as DesignQueueBadgeRow[];
  return {
    count: rows.length,
    signature: buildSignature(rows.map((row) => `${row.id}:${row.updated_at || ""}`).sort()),
  };
}

export async function fetchNavBadgeCounts(profile: NavBadgeProfile): Promise<NavBadgeCounts> {
  const [
    factoryDepositOrders,
    orderAlerts,
    factoryReceiptOrders,
    shipmentNotes,
    shipmentApprovals,
    designQueue,
  ] = await Promise.all([
    fetchFactoryDepositOrderBadgeCount(profile),
    fetchOrderAlertsBadgeCount(),
    fetchFactoryReceiptOrdersBadgeCount(),
    fetchShipmentNotesBadgeCount(profile),
    fetchShipmentApprovalsBadgeCount(),
    fetchDesignQueueBadgeCount(profile),
  ]);

  return {
    "/factory-deposit-orders": factoryDepositOrders,
    "/order-alerts": orderAlerts,
    "/factory-receipts/orders": factoryReceiptOrders,
    "/shipments/notes": shipmentNotes,
    "/shipments/approvals": shipmentApprovals,
    "/design-queue": designQueue,
  };
}
