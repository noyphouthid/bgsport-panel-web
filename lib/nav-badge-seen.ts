export const NAV_BADGE_PATHS = [
  "/orders",
  "/order-alerts",
  "/design-queue",
  "/quotations",
  "/factory-deposit-orders",
  "/factory-production-queue",
  "/factory-production-queue/records",
  "/payments",
  "/factory-payments",
  "/factory-receipts",
  "/factory-receipts/orders",
  "/shipments/notes",
  "/shipments/deposits",
  "/shipments/approvals",
  "/shipments/orders",
  "/change-requests",
] as const;

export type NavBadgePath = (typeof NAV_BADGE_PATHS)[number];

export type NavBadgeEntry = {
  count: number;
  // The newest timestamp seen on the server, or a content signature for "signature" entries.
  marker: string | null;
  // Rows that become alerts as dates pass have no timestamp to compare, so they use a signature.
  mode: "timestamp" | "signature";
  // Feeds start from "now" on first sight rather than announcing their whole history.
  baseline?: boolean;
};

export type NavBadgeCounts = Partial<Record<NavBadgePath, NavBadgeEntry>>;
export type SeenMarkers = Partial<Record<NavBadgePath, string>>;

const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)?$/;
const SIGNATURE_PATHS = new Set<NavBadgePath>(["/order-alerts"]);

function isNavBadgePath(value: string): value is NavBadgePath {
  return (NAV_BADGE_PATHS as readonly string[]).includes(value);
}

// PostgREST returns one offset per column, and "+" and "." sort below digits,
// so plain string order matches time order, including sub-second precision.
export function isNewerMarker(candidate: string, reference: string) {
  return candidate > reference;
}

export function getLatestMarker(stamps: Array<string | null | undefined>) {
  return stamps.reduce<string | null>((latest, stamp) => (stamp && (!latest || isNewerMarker(stamp, latest)) ? stamp : latest), null);
}

export function countNewerThan(stamps: Array<string | null | undefined>, seen?: string) {
  if (!seen) return stamps.length;
  return stamps.filter((stamp) => stamp && isNewerMarker(stamp, seen)).length;
}

// Query input reaches database filters, so keep only known paths with real timestamps.
export function parseSeenMarkers(raw: string | null): SeenMarkers {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const seen: SeenMarkers = {};
  for (const [path, marker] of Object.entries(parsed)) {
    if (isNavBadgePath(path) && !SIGNATURE_PATHS.has(path) && typeof marker === "string" && TIMESTAMP_PATTERN.test(marker)) {
      seen[path] = marker;
    }
  }
  return seen;
}

export function buildSeenQueryValue(seen: SeenMarkers) {
  const timestamps = Object.fromEntries(Object.entries(seen).filter(([path]) => !SIGNATURE_PATHS.has(path as NavBadgePath)));
  return JSON.stringify(timestamps);
}

// The longest match wins, so viewing /shipments/notes never clears a sibling page.
export function getActiveBadgePath(pathname: string): NavBadgePath | null {
  const matches = NAV_BADGE_PATHS.filter((path) => pathname === path || pathname.startsWith(`${path}/`));
  return matches.reduce<NavBadgePath | null>((longest, path) => (!longest || path.length > longest.length ? path : longest), null);
}

export function getVisibleBadgeCount(path: NavBadgePath, entry: NavBadgeEntry | undefined, seen: SeenMarkers, activePath: NavBadgePath | null) {
  if (!entry || entry.count <= 0 || path === activePath) return 0;
  const seenMarker = seen[path];
  if (seenMarker && entry.marker) {
    if (entry.mode === "signature" ? seenMarker === entry.marker : !isNewerMarker(entry.marker, seenMarker)) return 0;
  }
  return entry.count;
}

// Returns the same object when nothing changed, so callers can skip saving and re-rendering.
export function mergeSeenMarkers(seen: SeenMarkers, counts: NavBadgeCounts, activePath: NavBadgePath | null): SeenMarkers {
  let next = seen;
  for (const path of Object.keys(counts) as NavBadgePath[]) {
    const entry = counts[path];
    if (!entry?.marker) continue;
    const current = seen[path];
    const startsBaseline = entry.baseline === true && !current;
    const viewedChange = path === activePath && (entry.mode === "signature" ? current !== entry.marker : !current || isNewerMarker(entry.marker, current));
    if (startsBaseline || viewedChange) {
      next = next === seen ? { ...seen } : next;
      next[path] = entry.marker;
    }
  }
  return next;
}
