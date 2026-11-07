import { NextRequest, NextResponse } from "next/server";
import { getAdminActorFromAuthHeader } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const PAGE_SIZE = 50;
const BASE_COLUMNS =
  "id,created_at,user_id,email,success,failure_reason,ip,country,region,city,browser,os,device_type,device_id,is_new_device,is_new_ip,user_agent,user:users(id,full_name,role),device:login_devices(id,label)";
const LOCATION_COLUMNS = "isp,ip_latitude,ip_longitude,gps_status,gps_latitude,gps_longitude,gps_accuracy_m";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Dates from the page are Laos calendar days (UTC+7).
function laosDayStart(date: string, addDays = 0) {
  const start = new Date(`${date}T00:00:00+07:00`);
  start.setUTCDate(start.getUTCDate() + addDays);
  return start.toISOString();
}

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: "missing_server_env" }, { status: 500 });

  const actor = await getAdminActorFromAuthHeader(req.headers.get("authorization"));
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const userId = params.get("user_id") || "";
  const deviceId = params.get("device_id") || "";
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const status = params.get("status") || "all";
  const ip = (params.get("ip") || "").trim().slice(0, 64);
  const onlyNew = params.get("only_new") === "1";
  const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);

  const runQuery = (columns: string) => {
    let query = supabaseAdmin
      .from("login_events")
      .select(columns, { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (UUID_PATTERN.test(userId)) query = query.eq("user_id", userId);
    if (UUID_PATTERN.test(deviceId)) query = query.eq("device_id", deviceId);
    if (DATE_PATTERN.test(from)) query = query.gte("created_at", laosDayStart(from));
    if (DATE_PATTERN.test(to)) query = query.lt("created_at", laosDayStart(to, 1));
    if (status === "success") query = query.eq("success", true);
    if (status === "failed") query = query.eq("success", false);
    if (ip) query = query.eq("ip", ip);
    if (onlyNew) query = query.or("is_new_device.eq.true,is_new_ip.eq.true");
    return query;
  };

  let { data, error, count } = await runQuery(`${BASE_COLUMNS},${LOCATION_COLUMNS}`);
  if (error?.code === "PGRST204" || error?.code === "42703") {
    // 20261114_login_events_location.sql not applied yet.
    ({ data, error, count } = await runQuery(BASE_COLUMNS));
  }
  if (error) {
    const missing = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json(
      { error: missing ? "Apply 20261113_create_login_audit.sql in Supabase first" : error.message },
      { status: missing ? 503 : 500 }
    );
  }

  return NextResponse.json({ events: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
}
