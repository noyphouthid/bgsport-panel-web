type RawOrderRow = {
  id: string;
  order_code: string;
  order_date: string;
  customer_phone: string | null;
  customer_whatsapp: string | null;
  fabric_name: string;
  short_qty: number | null;
  long_qty: number | null;
  free_qty: number | null;
  status: "in_progress" | "completed";
  closed_at: string | null;
  shipment_status: "pending" | "shipped" | null;
  shipment_completed_at: string | null;
  production_completed_at: string | null;
  shop_received_at: string | null;
  factory_bill_code: string | null;
  factory_production_status: string | null;
  factory_production_status_index: number | null;
  factory_production_shipping_status: string | null;
  factory_production_due_date: string | null;
  factory_production_is_rush: boolean | null;
  factory_production_source_updated_at: string | null;
  factory_production_synced_at: string | null;
  factory_production_payload: {
    statuses?: string[] | null;
    updated_at_display?: string | null;
    due_date_display?: string | null;
    design_image_url?: string | null;
  } | null;
};

function normalizeFactoryAssetUrl(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  const base = "https://www.tracklifefootball.com";
  return text.startsWith("/") ? `${base}${text}` : `${base}/${text}`;
}

function buildTrackingImageProxyUrl(
  value: string | null | undefined,
  options?: {
    orderId?: string | null;
    factoryBillCode?: string | null;
    updatedAt?: string | null;
  }
) {
  const normalized = normalizeFactoryAssetUrl(value);
  if (!normalized) return null;
  const params = new URLSearchParams({
    src: normalized,
  });

  const orderId = String(options?.orderId || "").trim();
  if (orderId) {
    params.set("order", orderId);
  }

  const factoryBillCode = String(options?.factoryBillCode || "").trim();
  if (factoryBillCode) {
    params.set("bill", factoryBillCode);
  }

  const updatedAt = String(options?.updatedAt || "").trim();
  if (updatedAt) {
    params.set("v", updatedAt);
  }

  return `/api/public/order-tracking/design?${params.toString()}`;
}

export type PublicTrackingResult = {
  id: string;
  orderCode: string;
  orderDate: string;
  customerPhoneMasked: string | null;
  fabricName: string | null;
  totalQty: number;
  designImageUrl: string | null;
  currentStatus: string;
  currentStageIndex: number | null;
  currentStageSource: "factory" | "shop";
  shipmentStatus: string | null;
  dueDateDisplay: string | null;
  lastUpdatedDisplay: string | null;
  isRush: boolean;
  steps: string[];
  activeStepIndex: number | null;
  factoryBillCode: string | null;
};

function normalizeDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

function maskPhone(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return null;

  const digits = normalizeDigits(text);
  if (digits.length < 5) return text;

  const first = digits.slice(0, 3);
  const last = digits.slice(-3);
  return `${first}${"*".repeat(Math.max(0, digits.length - 6))}${last}`;
}

function formatDateDisplay(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US");
}

function getLocalTrackingSteps(row: RawOrderRow) {
  const closed = row.status === "completed" || Boolean(row.closed_at);
  const shipped = !closed && (row.shipment_status === "shipped" || Boolean(row.shipment_completed_at));
  const receivedAtShop = Boolean(row.shop_received_at || row.production_completed_at);

  return {
    steps: ["ຮັບອໍເດີ", "ກຳລັງຜະລິດ", "ສິນຄ້າເຂົ້າຮ້ານ", "ຈັດສົ່ງແລ້ວ", "ປິດອໍເດີ"],
    activeIndex: closed ? 5 : shipped ? 4 : receivedAtShop ? 3 : 2,
    currentStatus: closed ? "ປິດອໍເດີແລ້ວ" : shipped ? "ຈັດສົ່ງແລ້ວ" : receivedAtShop ? "ສິນຄ້າເຂົ້າຮ້ານແລ້ວ" : "ກຳລັງຜະລິດ",
  };
}

export function mapOrderToPublicTracking(row: RawOrderRow): PublicTrackingResult {
  const totalQty = (Number(row.short_qty) || 0) + (Number(row.long_qty) || 0) + (Number(row.free_qty) || 0);
  const factorySteps = Array.isArray(row.factory_production_payload?.statuses)
    ? row.factory_production_payload?.statuses?.filter((item): item is string => Boolean(String(item || "").trim()))
    : [];
  const factoryStatus = String(row.factory_production_status || "").trim();
  const hasFactoryStatus = Boolean(factoryStatus);
  const fallback = getLocalTrackingSteps(row);
  const receivedAtShop = Boolean(row.shop_received_at);
  const steps =
    hasFactoryStatus && factorySteps.length > 0
      ? receivedAtShop
        ? [...factorySteps, "ນຳເຂົ້າມາໜ້າຮ້ານແລ້ວ"]
        : factorySteps
      : fallback.steps;
  const activeStepIndex = hasFactoryStatus
    ? receivedAtShop
      ? factorySteps.length + 1
      : Number(row.factory_production_status_index || 0) || null
    : fallback.activeIndex;

  return {
    id: row.id,
    orderCode: row.order_code,
    orderDate: row.order_date,
    customerPhoneMasked: maskPhone(row.customer_phone || row.customer_whatsapp || null),
    fabricName: row.fabric_name || null,
    totalQty,
    designImageUrl: buildTrackingImageProxyUrl(row.factory_production_payload?.design_image_url, {
      orderId: row.id,
      factoryBillCode: row.factory_bill_code,
      updatedAt:
        row.factory_production_source_updated_at ||
        row.factory_production_synced_at ||
        row.order_date,
    }),
    currentStatus: hasFactoryStatus ? factoryStatus : fallback.currentStatus,
    currentStageIndex: hasFactoryStatus ? Number(row.factory_production_status_index || 0) || null : fallback.activeIndex,
    currentStageSource: hasFactoryStatus ? "factory" : "shop",
    shipmentStatus: row.factory_production_shipping_status || row.shipment_status || null,
    dueDateDisplay:
      row.factory_production_payload?.due_date_display?.trim() ||
      formatDateDisplay(row.factory_production_due_date) ||
      null,
    lastUpdatedDisplay:
      row.factory_production_payload?.updated_at_display?.trim() ||
      formatDateDisplay(row.factory_production_source_updated_at) ||
      formatDateDisplay(row.factory_production_synced_at) ||
      formatDateDisplay(row.shop_received_at) ||
      formatDateDisplay(row.shipment_completed_at) ||
      formatDateDisplay(row.production_completed_at) ||
      null,
    isRush: Boolean(row.factory_production_is_rush),
    steps,
    activeStepIndex,
    factoryBillCode: row.factory_bill_code || null,
  };
}

export function rankTrackingMatch(row: RawOrderRow, rawQuery: string) {
  const normalizedQuery = normalizeText(rawQuery);
  const digits = normalizeDigits(rawQuery);
  const normalizedOrderCode = normalizeText(row.order_code);
  const phoneDigits = normalizeDigits(row.customer_phone || row.customer_whatsapp || "");
  const numericSuffix = normalizedOrderCode.match(/(\d+)$/)?.[1] || "";

  if (normalizedQuery && normalizedOrderCode === normalizedQuery) return 100;
  if (digits.length >= 4 && numericSuffix === digits) return 90;
  if (digits.length >= 7 && phoneDigits === digits) return 80;
  if (digits.length >= 7 && phoneDigits.endsWith(digits)) return 70;
  if (normalizedQuery && normalizedOrderCode.includes(normalizedQuery)) return 60;
  if (digits.length >= 7 && phoneDigits.includes(digits)) return 50;
  return 0;
}

export function matchesTrackingQuery(row: RawOrderRow, rawQuery: string) {
  return rankTrackingMatch(row, rawQuery) > 0;
}
