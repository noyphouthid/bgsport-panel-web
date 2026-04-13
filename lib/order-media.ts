export const ORDER_MEDIA_BUCKET = "order-media";
const TRACKLIFE_BASE_URL = "https://www.tracklifefootball.com";
const TRACKLIFE_HOSTS = new Set(["www.tracklifefootball.com", "tracklifefootball.com"]);

export function isImageFileName(name: string | null | undefined) {
  const text = String(name || "").trim();
  if (!text) return false;
  if (text.startsWith("/api/public/order-tracking/design") || text.startsWith("/api/factory-production/design")) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(text);
}

export function buildSafeStorageFileName(fileName: string, prefix: string) {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() || "bin" : "bin";
  const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "bin";
  const readableBase = fileName
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const fallbackBase = readableBase || "file";
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fallbackBase}.${safeExtension}`;
}

function normalizeMediaUrl(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

export function normalizeFactoryAssetUrl(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return text.startsWith("/") ? `${TRACKLIFE_BASE_URL}${text}` : `${TRACKLIFE_BASE_URL}/${text}`;
}

function isTracklifeAssetUrl(value: string | null | undefined) {
  const normalized = normalizeFactoryAssetUrl(value);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    return TRACKLIFE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function buildTracklifeProxyUrl(value: string | null | undefined) {
  const normalized = normalizeFactoryAssetUrl(value);
  if (!normalized) return null;
  return `/api/public/order-tracking/design?src=${encodeURIComponent(normalized)}`;
}

export function toDisplayMediaUrl(value: string | null | undefined) {
  const normalized = normalizeFactoryAssetUrl(value);
  if (!normalized) return null;
  return isTracklifeAssetUrl(normalized) ? buildTracklifeProxyUrl(normalized) : normalized;
}

export function buildFactoryDesignFallbackUrl(factoryBillCode: string | null | undefined) {
  const normalizedCode = String(factoryBillCode || "").trim();
  if (!normalizedCode) return null;
  return `/api/factory-production/design?factoryBillCode=${encodeURIComponent(normalizedCode)}`;
}

export function extractProductionMockupUrls(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[];

  const urls = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      return toDisplayMediaUrl(normalizeMediaUrl((entry as { mockup_url?: unknown }).mockup_url));
    })
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(urls));
}
