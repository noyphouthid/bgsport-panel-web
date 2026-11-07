import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getActorFromAuthHeader } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  clipUserAgent,
  getClientIp,
  getRequestGeo,
  isPublicIp,
  normalizeDeviceKey,
  normalizeFailureReason,
  normalizeGpsLocation,
  parseIpinfoResponse,
  parseUserAgent,
  type IpLookup,
} from "@/lib/login-audit";

type Body = {
  success?: boolean;
  device_key?: string | null;
  email?: string;
  reason?: string;
};

// Failed attempts are unauthenticated, so cap how many one IP can record.
const FAILED_LIMIT_PER_IP = 30;
const FAILED_LIMIT_WINDOW_MS = 10 * 60 * 1000;
// Reuse an earlier lookup of the same IP instead of calling ipinfo.io again.
const IP_LOOKUP_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const IP_LOOKUP_TIMEOUT_MS = 2500;
// The browser may take a while to answer the location prompt.
const GPS_ATTACH_WINDOW_MS = 15 * 60 * 1000;

const LOCATION_COLUMNS = ["isp", "ip_latitude", "ip_longitude"] as const;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function isMissingColumn(error: { code?: string } | null) {
  return error?.code === "PGRST204" || error?.code === "42703";
}

async function lookupIp(supabaseAdmin: SupabaseClient, ip: string | null): Promise<IpLookup | null> {
  if (!isPublicIp(ip)) return null;

  const since = new Date(Date.now() - IP_LOOKUP_CACHE_MS).toISOString();
  const { data: cached, error: cacheErr } = await supabaseAdmin
    .from("login_events")
    .select("isp,country,region,city,ip_latitude,ip_longitude")
    .eq("ip", ip)
    .not("isp", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cacheErr && cached) {
    return {
      isp: cached.isp,
      country: cached.country,
      region: cached.region,
      city: cached.city,
      latitude: cached.ip_latitude,
      longitude: cached.ip_longitude,
    };
  }

  try {
    const token = String(process.env.IPINFO_TOKEN || "").trim();
    const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(IP_LOOKUP_TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) return null;
    return parseIpinfoResponse(await response.json());
  } catch {
    // A slow or failed lookup must never block signing in.
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: "missing_server_env" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const success = body.success === true;
  const ip = getClientIp(req.headers);
  const geo = getRequestGeo(req.headers);
  const userAgent = clipUserAgent(req.headers.get("user-agent"));
  const parsed = parseUserAgent(userAgent);

  let userId: string | null = null;
  let email: string | null = null;
  let failureReason: string | null = null;

  if (success) {
    const actor = await getActorFromAuthHeader(req.headers.get("authorization"));
    if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    userId = actor.profileId;
    email = actor.email.toLowerCase();
  } else {
    email = String(body.email || "").trim().toLowerCase().slice(0, 320) || null;
    failureReason = normalizeFailureReason(body.reason);

    if (ip) {
      const since = new Date(Date.now() - FAILED_LIMIT_WINDOW_MS).toISOString();
      const { count } = await supabaseAdmin
        .from("login_events")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .eq("success", false)
        .gte("created_at", since);
      if ((count ?? 0) >= FAILED_LIMIT_PER_IP) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    if (email) {
      const { data: user } = await supabaseAdmin.from("users").select("id").ilike("email", escapeLike(email)).limit(1).maybeSingle();
      userId = user?.id ?? null;
    }
  }

  let deviceId: string | null = null;
  const deviceKey = normalizeDeviceKey(body.device_key);
  if (deviceKey) {
    const { data: device, error: deviceErr } = await supabaseAdmin
      .from("login_devices")
      .upsert(
        { device_key: deviceKey, last_user_agent: userAgent, last_seen_at: new Date().toISOString() },
        { onConflict: "device_key" }
      )
      .select("id")
      .single();
    if (deviceErr) return NextResponse.json({ error: deviceErr.message }, { status: 500 });
    deviceId = device.id;
  }

  // "New" means this account has never signed in successfully from it before.
  let isNewDevice = false;
  let isNewIp = false;
  const flagsPromise = (async () => {
    if (!userId) return;
    const priorSuccess = () =>
      supabaseAdmin.from("login_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("success", true);
    const [deviceSeen, ipSeen] = await Promise.all([
      deviceId ? priorSuccess().eq("device_id", deviceId) : null,
      ip ? priorSuccess().eq("ip", ip) : null,
    ]);
    isNewDevice = Boolean(deviceSeen && !deviceSeen.error && (deviceSeen.count ?? 0) === 0);
    isNewIp = Boolean(ipSeen && !ipSeen.error && (ipSeen.count ?? 0) === 0);
  })();
  const [lookup] = await Promise.all([lookupIp(supabaseAdmin, ip), flagsPromise]);

  // Netlify's own geo header wins; ipinfo.io fills the gaps and adds the ISP.
  const row: Record<string, unknown> = {
    user_id: userId,
    email,
    success,
    failure_reason: failureReason,
    ip,
    country: geo.country || lookup?.country || null,
    region: geo.region || lookup?.region || null,
    city: geo.city || lookup?.city || null,
    user_agent: userAgent,
    browser: parsed.browser,
    os: parsed.os,
    device_type: parsed.deviceType,
    device_id: deviceId,
    is_new_device: isNewDevice,
    is_new_ip: isNewIp,
    isp: lookup?.isp || null,
    ip_latitude: geo.latitude ?? lookup?.latitude ?? null,
    ip_longitude: geo.longitude ?? lookup?.longitude ?? null,
  };

  let result = await supabaseAdmin.from("login_events").insert(row).select("id").single();
  if (isMissingColumn(result.error)) {
    // 20261114_login_events_location.sql not applied yet: keep logging without location columns.
    for (const column of LOCATION_COLUMNS) delete row[column];
    result = await supabaseAdmin.from("login_events").insert(row).select("id").single();
  }
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: result.data.id });
}

// Attaches the browser's GPS answer to the caller's own recent sign-in, once.
export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: "missing_server_env" }, { status: 500 });

  const actor = await getActorFromAuthHeader(req.headers.get("authorization"));
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; gps?: unknown };
  const id = Number(body.id);
  const gps = normalizeGpsLocation(body.gps);
  if (!Number.isSafeInteger(id) || id <= 0 || !gps) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const since = new Date(Date.now() - GPS_ATTACH_WINDOW_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("login_events")
    .update({
      gps_status: gps.status,
      gps_latitude: gps.latitude,
      gps_longitude: gps.longitude,
      gps_accuracy_m: gps.accuracy,
      gps_recorded_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", actor.profileId)
    .eq("success", true)
    .is("gps_status", null)
    .gte("created_at", since)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: isMissingColumn(error) ? 503 : 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
