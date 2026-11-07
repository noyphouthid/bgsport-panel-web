// Shared helpers for the sign-in audit log. Dependency-free so tests can import it.

export type DeviceType = "desktop" | "mobile" | "tablet";

export type ParsedUserAgent = {
  browser: string | null;
  os: string | null;
  deviceType: DeviceType;
};

export type RequestGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
};

type HeaderReader = { get(name: string): string | null };

export const DEVICE_KEY_STORAGE = "bgsport-login-device-key";
export const LOGIN_FAILURE_REASONS = ["wrong_password", "inactive_account", "profile_check_failed"] as const;
export type LoginFailureReason = (typeof LOGIN_FAILURE_REASONS)[number];

const DEVICE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function normalizeDeviceKey(value: unknown): string | null {
  const key = String(value ?? "").trim().toLowerCase();
  return DEVICE_KEY_PATTERN.test(key) ? key : null;
}

export function normalizeFailureReason(value: unknown): LoginFailureReason {
  return (LOGIN_FAILURE_REASONS as readonly string[]).includes(String(value)) ? (value as LoginFailureReason) : "wrong_password";
}

function clip(value: string | null | undefined, max: number): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function majorVersion(ua: string, pattern: RegExp): string {
  const match = ua.match(pattern);
  return match ? ` ${match[1]}` : "";
}

function parseBrowser(ua: string): string | null {
  if (/FBAN|FBAV/.test(ua)) return "Facebook App";
  if (/\bLine\//.test(ua)) return "LINE App";
  if (/Edg(?:e|A|iOS)?\//.test(ua)) return `Edge${majorVersion(ua, /Edg(?:e|A|iOS)?\/(\d+)/)}`;
  if (/OPR\/|Opera/.test(ua)) return `Opera${majorVersion(ua, /OPR\/(\d+)/)}`;
  if (/SamsungBrowser\//.test(ua)) return `Samsung Internet${majorVersion(ua, /SamsungBrowser\/(\d+)/)}`;
  if (/CriOS\//.test(ua)) return `Chrome${majorVersion(ua, /CriOS\/(\d+)/)}`;
  if (/FxiOS\//.test(ua)) return `Firefox${majorVersion(ua, /FxiOS\/(\d+)/)}`;
  if (/Firefox\//.test(ua)) return `Firefox${majorVersion(ua, /Firefox\/(\d+)/)}`;
  if (/Chrome\//.test(ua)) return `Chrome${majorVersion(ua, /Chrome\/(\d+)/)}`;
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return `Safari${majorVersion(ua, /Version\/(\d+)/)}`;
  return null;
}

function parseOs(ua: string): string | null {
  const windows = ua.match(/Windows NT (\d+\.\d+)/);
  if (windows) {
    const names: Record<string, string> = { "10.0": "Windows 10/11", "6.3": "Windows 8.1", "6.2": "Windows 8", "6.1": "Windows 7" };
    return names[windows[1]] || "Windows";
  }
  const ios = ua.match(/(?:iPhone|CPU) OS (\d+)(?:_(\d+))?/);
  if (ios && /iPhone|iPad|iPod/.test(ua)) return `${/iPad/.test(ua) ? "iPadOS" : "iOS"} ${ios[1]}${ios[2] ? `.${ios[2]}` : ""}`;
  const android = ua.match(/Android (\d+(?:\.\d+)?)/);
  if (android) return `Android ${android[1]}`;
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  const ua = String(userAgent ?? "");
  let deviceType: DeviceType = "desktop";
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) deviceType = "tablet";
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) deviceType = "mobile";
  return { browser: parseBrowser(ua), os: parseOs(ua), deviceType };
}

function normalizeIp(value: string | null | undefined): string | null {
  let ip = String(value ?? "").trim();
  if (!ip) return null;
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  // Drop a port from "1.2.3.4:5678" but leave IPv6 addresses intact.
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.split(":")[0];
  return clip(ip, 64);
}

// The host in front of the app sets these headers. Netlify (production) sends
// x-nf-client-connection-ip; the first x-forwarded-for entry is the fallback.
export function getClientIp(headers: HeaderReader): string | null {
  return (
    normalizeIp(headers.get("x-nf-client-connection-ip")) ||
    normalizeIp(headers.get("cf-connecting-ip")) ||
    normalizeIp(headers.get("x-real-ip")) ||
    normalizeIp((headers.get("x-forwarded-for") || "").split(",")[0]) ||
    null
  );
}

function decodeHeader(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toCoordinate(value: unknown, limit: number): number | null {
  const number = typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

type NetlifyGeo = {
  city?: string;
  country?: { code?: string; name?: string };
  subdivision?: { code?: string; name?: string };
  latitude?: number;
  longitude?: number;
};

// Netlify sends x-nf-geo as base64-encoded JSON (plain JSON is accepted too).
export function parseNetlifyGeo(value: string | null): NetlifyGeo | null {
  if (!value) return null;
  const candidates = [value];
  try {
    const binary = atob(value);
    candidates.unshift(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
  } catch {
    // Not base64.
  }
  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") return parsed as NetlifyGeo;
    } catch {
      // Try the next form.
    }
  }
  return null;
}

export function getRequestGeo(headers: HeaderReader): RequestGeo {
  const netlify = parseNetlifyGeo(headers.get("x-nf-geo"));
  const country = clip(netlify?.country?.code || headers.get("x-vercel-ip-country") || headers.get("cf-ipcountry"), 8);
  return {
    country: country && country !== "XX" ? country.toUpperCase() : null,
    region: clip(netlify?.subdivision?.name || decodeHeader(headers.get("x-vercel-ip-country-region") || headers.get("cf-region")), 100),
    city: clip(netlify?.city || decodeHeader(headers.get("x-vercel-ip-city") || headers.get("cf-ipcity")), 100),
    latitude: toCoordinate(netlify?.latitude ?? headers.get("x-vercel-ip-latitude"), 90),
    longitude: toCoordinate(netlify?.longitude ?? headers.get("x-vercel-ip-longitude"), 180),
  };
}

// Private, loopback and link-local addresses have no public location to look up.
export function isPublicIp(ip: string | null): ip is string {
  if (!ip) return false;
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip)) return false;
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::" || /^(fc|fd|fe80)/.test(lower)) return false;
  return /^[0-9a-f:.]+$/i.test(ip);
}

export type IpLookup = { isp: string | null; country: string | null; region: string | null; city: string | null; latitude: number | null; longitude: number | null };

// Shape of https://ipinfo.io/<ip>/json, e.g. { city, region, country, loc: "17.96,102.61", org: "AS131192 Unitel" }.
export function parseIpinfoResponse(body: unknown): IpLookup | null {
  if (!body || typeof body !== "object" || (body as { bogon?: boolean }).bogon) return null;
  const data = body as Record<string, unknown>;
  const [lat, lng] = String(data.loc || "").split(",");
  const org = String(data.org || "").replace(/^AS\d+\s+/, "");
  const country = clip(String(data.country || ""), 8);
  return {
    isp: clip(org, 120),
    country: country ? country.toUpperCase() : null,
    region: clip(String(data.region || ""), 100),
    city: clip(String(data.city || ""), 100),
    latitude: toCoordinate(lat, 90),
    longitude: toCoordinate(lng, 180),
  };
}

export const GPS_STATUSES = ["granted", "denied", "unavailable", "timeout", "unsupported"] as const;
export type GpsStatus = (typeof GPS_STATUSES)[number];
export type GpsLocation = { status: GpsStatus; latitude: number | null; longitude: number | null; accuracy: number | null };

// Validates what the browser reports; coordinates only count with status "granted".
export function normalizeGpsLocation(value: unknown): GpsLocation | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const status = (GPS_STATUSES as readonly string[]).includes(String(data.status)) ? (data.status as GpsStatus) : null;
  if (!status) return null;
  if (status !== "granted") return { status, latitude: null, longitude: null, accuracy: null };
  const latitude = toCoordinate(data.latitude, 90);
  const longitude = toCoordinate(data.longitude, 180);
  if (latitude === null || longitude === null) return { status: "unavailable", latitude: null, longitude: null, accuracy: null };
  const accuracy = toCoordinate(data.accuracy, 1_000_000);
  return { status, latitude, longitude, accuracy: accuracy === null ? null : Math.max(0, Math.round(accuracy)) };
}

export function googleMapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export function describeDevice(parsed: Pick<ParsedUserAgent, "browser" | "os">): string {
  return [parsed.os, parsed.browser].filter(Boolean).join(" · ") || "ບໍ່ຮູ້ຈັກອຸປະກອນ";
}

export function clipUserAgent(userAgent: string | null | undefined): string | null {
  return clip(userAgent, 500);
}
