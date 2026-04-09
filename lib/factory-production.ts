export type FactoryProductionEvent = {
  status_index: number | null;
  status: string | null;
  actor: string | null;
  actor_display_name: string | null;
  note: string | null;
  ts: string | null;
  ts_display: string | null;
};

export type FactoryProductionPayload = {
  order_no: string | null;
  status_index: number | null;
  status: string | null;
  statuses: string[];
  updated_at: string | null;
  updated_at_display: string | null;
  due_date: string | null;
  due_date_display: string | null;
  shipping_status: string | null;
  is_rush: boolean;
  customer_name: string | null;
  quantity: number | null;
  events: FactoryProductionEvent[];
};

export type FactoryProductionSnapshot = {
  factoryOrderNo: string;
  currentStatus: string | null;
  currentStatusIndex: number | null;
  sourceUpdatedAt: string | null;
  sourceUpdatedAtDisplay: string | null;
  dueDate: string | null;
  dueDateDisplay: string | null;
  shippingStatus: string | null;
  isRush: boolean;
  payload: FactoryProductionPayload;
};

type FactoryApiResponse = {
  ok?: boolean;
  order?: Record<string, unknown> | null;
  error?: string;
  message?: string;
};

function getFactoryProductionBaseUrl() {
  const configured = String(process.env.TRACKLIFE_API_BASE_URL || process.env.FACTORY_TRACKING_API_BASE_URL || "").trim();
  return configured || "https://www.tracklifefootball.com";
}

function toNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function toNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function normalizeEvent(value: unknown): FactoryProductionEvent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    status_index: toNullableNumber(row.status_index),
    status: toNullableString(row.status),
    actor: toNullableString(row.actor),
    actor_display_name: toNullableString(row.actor_display_name),
    note: toNullableString(row.note),
    ts: toNullableString(row.ts),
    ts_display: toNullableString(row.ts_display),
  };
}

function normalizePayload(order: Record<string, unknown>): FactoryProductionPayload {
  const statuses = Array.isArray(order.statuses)
    ? order.statuses.map((item) => toNullableString(item)).filter((item): item is string => Boolean(item))
    : [];
  const events = Array.isArray(order.events)
    ? order.events.map(normalizeEvent).filter((item): item is FactoryProductionEvent => Boolean(item))
    : [];

  return {
    order_no: toNullableString(order.order_no),
    status_index: toNullableNumber(order.status_index),
    status: toNullableString(order.status),
    statuses,
    updated_at: toNullableString(order.updated_at),
    updated_at_display: toNullableString(order.updated_at_display),
    due_date: toNullableString(order.due_date),
    due_date_display: toNullableString(order.due_date_display),
    shipping_status: toNullableString(order.shipping_status),
    is_rush: toBoolean(order.is_rush),
    customer_name: toNullableString(order.customer_name),
    quantity: toNullableNumber(order.quantity),
    events,
  };
}

export function buildFactoryProductionUpdate(snapshot: FactoryProductionSnapshot, syncedAt = new Date().toISOString()) {
  return {
    factory_production_status: snapshot.currentStatus,
    factory_production_status_index: snapshot.currentStatusIndex,
    factory_production_shipping_status: snapshot.shippingStatus,
    factory_production_due_date: snapshot.dueDate,
    factory_production_is_rush: snapshot.isRush,
    factory_production_source_updated_at: snapshot.sourceUpdatedAt,
    factory_production_synced_at: syncedAt,
    factory_production_payload: snapshot.payload,
    factory_production_sync_error: null,
  };
}

export function buildFactoryProductionErrorUpdate(message: string, syncedAt = new Date().toISOString()) {
  return {
    factory_production_synced_at: syncedAt,
    factory_production_sync_error: message,
  };
}

export async function fetchFactoryProductionSnapshot(factoryOrderNo: string): Promise<FactoryProductionSnapshot> {
  const normalizedOrderNo = String(factoryOrderNo || "").trim();
  if (!normalizedOrderNo) {
    throw new Error("missing_factory_order_no");
  }

  const endpoint = `${getFactoryProductionBaseUrl().replace(/\/+$/, "")}/api/orders/${encodeURIComponent(normalizedOrderNo)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "BGSportPanel/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`factory_http_${response.status}`);
  }

  const data = (await response.json()) as FactoryApiResponse;
  if (!data.ok || !data.order || typeof data.order !== "object") {
    throw new Error(data.error || data.message || "factory_order_not_found");
  }

  const payload = normalizePayload(data.order);
  return {
    factoryOrderNo: normalizedOrderNo,
    currentStatus: payload.status,
    currentStatusIndex: payload.status_index,
    sourceUpdatedAt: payload.updated_at,
    sourceUpdatedAtDisplay: payload.updated_at_display,
    dueDate: payload.due_date,
    dueDateDisplay: payload.due_date_display,
    shippingStatus: payload.shipping_status,
    isRush: payload.is_rush,
    payload,
  };
}
