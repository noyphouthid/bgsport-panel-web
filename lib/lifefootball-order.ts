export const LIFEFOOTBALL_ORIGIN = "https://bgsport.lifefootball.la";

export function extractLifefootballOrderId(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.origin !== LIFEFOOTBALL_ORIGIN || url.username || url.password) return null;
    const match = url.pathname.match(
      /^\/agent\/orders\/([^/]+)(?:\/(?:factory\/print|factory\/receipt\/print|receipt\/print))?\/?$/
    );
    if (!match) return null;
    const id = decodeURIComponent(match[1]);
    return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function normalizeLifefootballOrderCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().replace(/^#\s*/, "");
  return /^\d{2}-\d{4,}$/.test(code) ? code : null;
}
