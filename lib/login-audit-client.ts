import { DEVICE_KEY_STORAGE, normalizeDeviceKey, type GpsLocation, type LoginFailureReason } from "@/lib/login-audit";

// A random id stored in this browser so the audit log can recognise the same
// computer across sign-ins. Clearing site data or using a private window makes a new one.
export function getOrCreateDeviceKey(): string | null {
  try {
    const existing = normalizeDeviceKey(window.localStorage.getItem(DEVICE_KEY_STORAGE));
    if (existing) return existing;
    const created = normalizeDeviceKey(window.crypto?.randomUUID?.());
    if (created) window.localStorage.setItem(DEVICE_KEY_STORAGE, created);
    return created;
  } catch {
    return null;
  }
}

type LoginEventInput =
  | { success: true; accessToken: string }
  | { success: false; email: string; reason: LoginFailureReason };

// Never rejects: a logging problem must not block signing in. Resolves to the event id.
export async function recordLoginEvent(input: LoginEventInput): Promise<number | null> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (input.success) headers.Authorization = `Bearer ${input.accessToken}`;
    const response = await fetch("/api/auth/login-events", {
      method: "POST",
      headers,
      keepalive: true,
      body: JSON.stringify({
        success: input.success,
        device_key: getOrCreateDeviceKey(),
        email: input.success ? undefined : input.email,
        reason: input.success ? undefined : input.reason,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { id?: number };
    return response.ok && typeof payload.id === "number" ? payload.id : null;
  } catch {
    return null;
  }
}

const GPS_TIMEOUT_MS = 20_000;
// Covers a permission prompt nobody answers; getCurrentPosition's own timeout starts only after permission.
const GPS_PROMPT_LIMIT_MS = 90_000;

const noLocation = (status: GpsLocation["status"]): GpsLocation => ({ status, latitude: null, longitude: null, accuracy: null });

// Asks the browser for its location. Call it from the login click so the prompt
// appears in response to the user's action. Never rejects.
export function requestGpsLocation(): Promise<GpsLocation> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(noLocation("unsupported"));

  return new Promise((resolve) => {
    const guard = setTimeout(() => resolve(noLocation("timeout")), GPS_PROMPT_LIMIT_MS);
    const finish = (location: GpsLocation) => {
      clearTimeout(guard);
      resolve(location);
    };
    navigator.geolocation.getCurrentPosition(
      (position) =>
        finish({
          status: "granted",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) =>
        finish(noLocation(error.code === error.PERMISSION_DENIED ? "denied" : error.code === error.TIMEOUT ? "timeout" : "unavailable")),
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 60_000 }
    );
  });
}

// Runs after the page has moved on; the app keeps running during client-side navigation.
export function attachGpsToLoginEvent(accessToken: string, eventId: Promise<number | null>, gps: Promise<GpsLocation>): void {
  void Promise.all([eventId, gps])
    .then(([id, location]) => {
      if (!id) return;
      return fetch("/api/auth/login-events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        keepalive: true,
        body: JSON.stringify({ id, gps: location }),
      });
    })
    .catch(() => undefined);
}
