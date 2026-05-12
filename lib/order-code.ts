export const CURRENT_ORDER_TYPES = ["PK26", "MK26", "PM26", "MM26"] as const;
export const LEGACY_ORDER_TYPES = ["PKF26", "PKLF26", "MKF26", "MKLF26", "PMF26", "PMLF26", "MMF26", "MMLF26"] as const;
export const ORDER_TYPES = [...CURRENT_ORDER_TYPES, ...LEGACY_ORDER_TYPES] as const;

export type KnownOrderType = (typeof ORDER_TYPES)[number];
export type OrderType = string;
export type OrderPrefixFilter = string;

export function normalizeOrderType(orderType: string) {
  return String(orderType || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function isKnownOrderType(orderType: string): orderType is KnownOrderType {
  return ORDER_TYPES.includes(normalizeOrderType(orderType) as KnownOrderType);
}

export function parseOrderCode(orderCode: string): { orderType: OrderType; orderNo: string } {
  const normalized = String(orderCode || "").trim().toUpperCase();
  const match = normalized.match(/^([A-Z0-9]+)-([A-Z0-9+]+)$/);
  if (!match) return { orderType: "", orderNo: normalized };

  const [, prefix, orderNo] = match;
  return { orderType: prefix, orderNo };
}

export function normalizeOrderNo(orderNo: string) {
  return String(orderNo || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9+]/g, "");
}

export function buildOrderCode(orderType: OrderType, orderNo: string) {
  const normalizedOrderNo = normalizeOrderNo(orderNo);
  const formattedOrderNo = /^\d+$/.test(normalizedOrderNo) ? normalizedOrderNo.padStart(3, "0") : normalizedOrderNo;
  return `${normalizeOrderType(orderType)}-${formattedOrderNo}`;
}

export function matchOrderPrefix(orderCode: string, prefix: OrderPrefixFilter) {
  if (prefix === "ALL") return true;
  if (prefix === "OTHER") return /^\d/.test(String(orderCode || ""));
  return String(orderCode || "").startsWith(prefix);
}
