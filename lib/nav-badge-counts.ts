import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/access-control";
import { canViewAllFactoryDepositOrders, type FactoryDepositOrderStatus } from "@/lib/factory-deposit-orders";
import { supabase } from "@/lib/supabase";
import { canManageAllTransportNotes } from "@/lib/transport-notes";
import { fetchOrderAlertOrdersWithClient, getOrderAlertEndDate, getOrderAlertToday, getOrderAlertTiming } from "@/lib/order-alerts";
import { canAccessPath } from "@/lib/access-control";
import { countNewerThan, getLatestMarker, NAV_BADGE_PATHS, type NavBadgeCounts, type NavBadgeEntry, type NavBadgePath, type SeenMarkers } from "@/lib/nav-badge-seen";
import { fetchAllReportRows } from "@/lib/report-query";
import type { UserPermissionSettings } from "@/lib/user-permissions";

export { NAV_BADGE_PATHS } from "@/lib/nav-badge-seen";
export type { NavBadgeCounts, NavBadgeEntry, NavBadgePath, SeenMarkers } from "@/lib/nav-badge-seen";

type NavBadgeProfile = {
  id: string;
  role: AppRole;
  permission_settings?: UserPermissionSettings | null;
};

type OrderAlertDepositRow = {
  id: string;
  status: FactoryDepositOrderStatus;
  order_id: string | null;
  production_sent_date: string | null;
  delivery_date: string | null;
  updated_at?: string | null;
};

type ReceiptItemOrderRow = {
  order_id: string | null;
  created_at: string | null;
};

type ReceiptOrderState = {
  id: string;
  updated_at: string | null;
};

const ORDER_ID_BATCH_SIZE = 100;

function buildSignature(parts: Array<string | null | undefined>) {
  return parts.filter((part) => Boolean(part)).join("|");
}

// Work queues: the first visit shows everything pending, later ones only what changed since.
function buildQueueEntry(stamps: Array<string | null | undefined>, seen?: string): NavBadgeEntry {
  return { count: countNewerThan(stamps, seen), marker: getLatestMarker(stamps), mode: "timestamp" };
}

type FeedResult = { data: unknown; error: unknown; count?: number | null };
type FeedQuery = PromiseLike<FeedResult> & {
  gt(column: string, value: string): FeedQuery;
  not(column: string, operator: string, value: null): FeedQuery;
  order(column: string, options: { ascending: boolean }): FeedQuery;
  limit(count: number): FeedQuery;
};
type FeedSource = (columns: string, options?: { count: "exact"; head: true }) => unknown;

// Feeds can hold years of rows, so the database counts them instead of this server loading them.
async function fetchFeedEntry(source: FeedSource, column: string, seen: string | undefined): Promise<NavBadgeEntry> {
  const query = (columns: string, options?: { count: "exact"; head: true }) => source(columns, options) as FeedQuery;
  const latest = await query(column).not(column, "is", null).order(column, { ascending: false }).limit(1);
  if (latest.error) throw latest.error;
  const marker = ((latest.data ?? []) as Array<Record<string, string | null>>)[0]?.[column] ?? null;
  if (!seen) return { count: 0, marker, mode: "timestamp", baseline: true };

  const newer = await query(column, { count: "exact", head: true }).gt(column, seen);
  if (newer.error) throw newer.error;
  return { count: newer.count ?? 0, marker, mode: "timestamp", baseline: true };
}

async function fetchFactoryDepositOrderBadge(client: SupabaseClient, profile: NavBadgeProfile, seen?: string) {
  let query = client.from("factory_deposit_orders").select("id,updated_at").eq("status", "submitted");
  if (profile.role !== "agent" && !canViewAllFactoryDepositOrders(profile.role)) {
    query = query.eq("created_by_user_id", profile.id);
  }
  const { data, error } = await query;
  if (error) throw error;
  return buildQueueEntry(((data ?? []) as Array<{ updated_at: string | null }>).map((row) => row.updated_at), seen);
}

async function fetchOrderAlertsBadge(client: SupabaseClient): Promise<NavBadgeEntry> {
  const today = getOrderAlertToday();

  const { data: depositData, error: depositError } = await client
    .from("factory_deposit_orders")
    .select("id,status,order_id,production_sent_date,delivery_date,updated_at")
    .eq("status", "converted")
    .not("order_id", "is", null)
    .not("production_sent_date", "is", null)
    .not("delivery_date", "is", null)
    .lte("production_sent_date", today)
    .lte("delivery_date", getOrderAlertEndDate(today));
  if (depositError) throw depositError;

  const deposits = (depositData ?? []) as OrderAlertDepositRow[];
  const orderIds = Array.from(new Set(deposits.map((row) => row.order_id).filter((value): value is string => Boolean(value))));
  if (orderIds.length === 0) return { count: 0, marker: null, mode: "signature" };

  const orderData = await fetchOrderAlertOrdersWithClient(client, orderIds);
  const ordersById = new Map(orderData.map((row) => [row.id, row]));
  const rows = deposits.filter((row) => getOrderAlertTiming(row, row.order_id ? ordersById.get(row.order_id) || null : null, today));

  return {
    count: rows.length,
    marker: buildSignature(rows.map((row) => `${row.id}:${row.production_sent_date || ""}:${row.delivery_date || ""}:${row.updated_at || ""}`).sort()) || null,
    mode: "signature",
  };
}

// Starts from open orders so the receipt-item history cannot exceed the API row limit.
async function fetchFactoryReceiptOrdersBadge(client: SupabaseClient, seen?: string) {
  const { data: orderData, error: orderError } = await fetchAllReportRows<ReceiptOrderState>((from, to) =>
    client
      .from("orders")
      .select("id,updated_at")
      .neq("status", "completed")
      .is("closed_at", null)
      .is("shipment_completed_at", null)
      .or("shipment_status.is.null,shipment_status.neq.shipped")
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (orderError) throw orderError;
  const openOrders = orderData ?? [];

  const latestItemByOrderId = new Map<string, string>();
  const receivedOrderIds = new Set<string>();
  for (let start = 0; start < openOrders.length; start += ORDER_ID_BATCH_SIZE) {
    const ids = openOrders.slice(start, start + ORDER_ID_BATCH_SIZE).map((row) => row.id);
    const { data, error } = await fetchAllReportRows<ReceiptItemOrderRow>((from, to) =>
      client.from("factory_receipt_items").select("order_id,created_at").in("order_id", ids).order("id", { ascending: true }).range(from, to)
    );
    if (error) throw error;
    for (const item of data ?? []) {
      if (!item.order_id) continue;
      receivedOrderIds.add(item.order_id);
      const latest = getLatestMarker([latestItemByOrderId.get(item.order_id), item.created_at]);
      if (latest) latestItemByOrderId.set(item.order_id, latest);
    }
  }

  // A new receipt item may not touch the order row, so both timestamps count as activity.
  return buildQueueEntry(
    openOrders.filter((row) => receivedOrderIds.has(row.id)).map((row) => getLatestMarker([row.updated_at, latestItemByOrderId.get(row.id)])),
    seen
  );
}

async function fetchShipmentNotesBadge(client: SupabaseClient, profile: NavBadgeProfile, seen?: string) {
  let query = client
    .from("transport_notes")
    .select("updated_at")
    .is("printed_at", null)
    .is("last_printed_at", null)
    .or("print_count.is.null,print_count.lte.0");
  if (profile.role !== "agent" && !canManageAllTransportNotes(profile.role)) query = query.eq("created_by_user_id", profile.id);
  const { data, error } = await query;
  if (error) throw error;
  return buildQueueEntry(((data ?? []) as Array<{ updated_at: string | null }>).map((row) => row.updated_at), seen);
}

async function fetchShipmentApprovalsBadge(client: SupabaseClient, seen?: string) {
  const { data, error } = await client.from("shipment_delivery_requests").select("updated_at").eq("status", "submitted");
  if (error) throw error;
  return buildQueueEntry(((data ?? []) as Array<{ updated_at: string | null }>).map((row) => row.updated_at), seen);
}

async function fetchDesignQueueBadge(client: SupabaseClient, profile: NavBadgeProfile, seen?: string) {
  let query = client.from("design_queue_entries").select("updated_at").eq("is_designed", false);
  if (profile.role === "graphic") query = query.eq("graphic_user_id", profile.id);
  const { data, error } = await query;
  if (error) throw error;
  return buildQueueEntry(((data ?? []) as Array<{ updated_at: string | null }>).map((row) => row.updated_at), seen);
}

const PRODUCTION_DEPOSIT_EMBED = "deposit:factory_deposit_orders!factory_production_queue_entries_factory_deposit_order_id_fkey!inner(production_queue_legacy,production_queue_entered_at,status)";

type ProductionQueueQuery = PromiseLike<FeedResult> & {
  eq(column: string, value: boolean | string): ProductionQueueQuery;
  neq(column: string, value: string): ProductionQueueQuery;
  not(column: string, operator: string, value: null): ProductionQueueQuery;
  in(column: string, values: string[]): ProductionQueueQuery;
  or(filter: string): ProductionQueueQuery;
};

function scopeProductionQueue(source: unknown, profile: NavBadgeProfile) {
  const scoped = (source as ProductionQueueQuery)
    .eq("deposit.production_queue_legacy", false)
    .not("deposit.production_queue_entered_at", "is", null)
    .in("deposit.status", ["submitted", "approved", "converted"]);
  return profile.role === "superadmin"
    ? scoped
    : scoped.or(["pattern_user_id", "print_user_id", "dispatch_user_id"].map((field) => `${field}.eq.${profile.id}`).join(","));
}

async function fetchFactoryProductionQueueBadge(client: SupabaseClient, profile: NavBadgeProfile, seen?: string) {
  const { data, error } = await scopeProductionQueue(
    client.from("factory_production_queue_entries").select(`updated_at,${PRODUCTION_DEPOSIT_EMBED}`),
    profile
  ).neq("status", "sent_to_factory");
  if (error) throw error;
  return buildQueueEntry(((data ?? []) as Array<{ updated_at: string | null }>).map((row) => row.updated_at), seen);
}

function fetchProductionRecordsBadge(client: SupabaseClient, profile: NavBadgeProfile, seen?: string) {
  return fetchFeedEntry(
    (columns, options) =>
      scopeProductionQueue(client.from("factory_production_queue_entries").select(`${columns},${PRODUCTION_DEPOSIT_EMBED}`, options), profile).eq("status", "sent_to_factory"),
    "updated_at",
    seen
  );
}

function fetchTransportDepositsBadge(client: SupabaseClient, profile: NavBadgeProfile, seen?: string) {
  return fetchFeedEntry(
    (columns, options) => {
      const query = client.from("transport_notes").select(columns, options);
      return profile.role !== "agent" && !canManageAllTransportNotes(profile.role) ? query.eq("created_by_user_id", profile.id) : query;
    },
    "transport_deposited_at",
    seen
  );
}

function simpleFeed(client: SupabaseClient, table: string, column: string, seen?: string) {
  return fetchFeedEntry((columns, options) => client.from(table).select(columns, options), column, seen);
}

export async function fetchNavBadgeCounts(profile: NavBadgeProfile, seen: SeenMarkers = {}): Promise<NavBadgeCounts> {
  return fetchNavBadgeCountsWithClient(supabase, profile, seen);
}

export async function fetchNavBadgeCountsWithClient(client: SupabaseClient, profile: NavBadgeProfile, seen: SeenMarkers = {}): Promise<NavBadgeCounts> {
  const loaders: Record<NavBadgePath, () => Promise<NavBadgeEntry>> = {
    "/orders": () => simpleFeed(client, "orders", "updated_at", seen["/orders"]),
    "/order-alerts": () => fetchOrderAlertsBadge(client),
    "/design-queue": () => fetchDesignQueueBadge(client, profile, seen["/design-queue"]),
    "/quotations": () => simpleFeed(client, "quotation_drafts", "updated_at", seen["/quotations"]),
    "/factory-deposit-orders": () => fetchFactoryDepositOrderBadge(client, profile, seen["/factory-deposit-orders"]),
    "/factory-production-queue": () => fetchFactoryProductionQueueBadge(client, profile, seen["/factory-production-queue"]),
    "/factory-production-queue/records": () => fetchProductionRecordsBadge(client, profile, seen["/factory-production-queue/records"]),
    "/payments": () => simpleFeed(client, "payment_transactions", "created_at", seen["/payments"]),
    "/factory-payments": () => simpleFeed(client, "factory_payments", "created_at", seen["/factory-payments"]),
    "/factory-receipts": () => simpleFeed(client, "factory_receipts", "created_at", seen["/factory-receipts"]),
    "/factory-receipts/orders": () => fetchFactoryReceiptOrdersBadge(client, seen["/factory-receipts/orders"]),
    "/shipments/notes": () => fetchShipmentNotesBadge(client, profile, seen["/shipments/notes"]),
    "/shipments/deposits": () => fetchTransportDepositsBadge(client, profile, seen["/shipments/deposits"]),
    "/shipments/approvals": () => fetchShipmentApprovalsBadge(client, seen["/shipments/approvals"]),
    "/shipments/orders": () => simpleFeed(client, "shipment_records", "created_at", seen["/shipments/orders"]),
    "/change-requests": () => simpleFeed(client, "order_change_requests", "updated_at", seen["/change-requests"]),
  };

  // Viewers get counts only for pages they may open, and one failing page cannot blank the others.
  const paths = NAV_BADGE_PATHS.filter((path) => canAccessPath(path, profile.role, profile.permission_settings));
  const results = await Promise.allSettled(paths.map((path) => loaders[path]()));

  const counts: NavBadgeCounts = {};
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      counts[paths[index]] = result.value;
    } else {
      console.error(`Failed to load nav badge for ${paths[index]}`, result.reason);
    }
  });
  return counts;
}
