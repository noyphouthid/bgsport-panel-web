import { NextRequest, NextResponse } from "next/server";
import { getActorFromAuthHeader } from "@/lib/admin-api-auth";
import { FACTORY_PRODUCTION_QUEUE_FULL_SELECT, FACTORY_PRODUCTION_VISIBLE_STATUS_SET } from "@/lib/factory-production-queue-server";
import type { FactoryProductionQueueVisibleStatus } from "@/lib/factory-production-queue";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_ROLES = ["superadmin", "production"] as const;

export async function GET(req: NextRequest) {
  const client = getSupabaseAdmin();
  if (!client) return NextResponse.json({ error: "missing_server_env" }, { status: 500 });
  const actor = await getActorFromAuthHeader(req.headers.get("authorization"), [...ALLOWED_ROLES]);
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    if (req.nextUrl.searchParams.get("sync") === "1") {
      const { error } = await client.rpc("sync_factory_production_queue_entries", { p_actor_user_id: actor.profileId });
      if (error) throw error;
    }
    const [usersResult, profileResult] = await Promise.all([
      client.from("users").select("id,full_name,role,is_active").order("full_name"),
      client.from("users").select("id,role,permission_settings").eq("id", actor.profileId).single(),
    ]);
    if (usersResult.error) throw usersResult.error;
    if (profileResult.error) throw profileResult.error;
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = client.from("factory_production_queue_entries").select(FACTORY_PRODUCTION_QUEUE_FULL_SELECT)
        .in("deposit.status", ["submitted", "approved", "converted"])
        .order("queue_date", { ascending: false }).order("queue_sequence").range(offset, offset + 499);
      if (actor.role !== "superadmin") query = query.eq("planner_user_id", actor.profileId);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data ?? []) as unknown as Record<string, unknown>[]);
      if (!data || data.length < 500) break;
    }
    return NextResponse.json({ ok: true, rows, users: usersResult.data, profile: { ...profileResult.data, role: actor.role } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : (error as { message?: string })?.message || "load_factory_production_queue_failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const client = getSupabaseAdmin();
  if (!client) return NextResponse.json({ error: "missing_server_env" }, { status: 500 });
  const actor = await getActorFromAuthHeader(req.headers.get("authorization"), [...ALLOWED_ROLES]);
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (body.action !== "update_status" && body.action !== "bulk_status") {
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
  }
  const ids = Array.from(new Set((body.action === "bulk_status" && Array.isArray(body.ids) ? body.ids : [body.id])
    .map(value => typeof value === "string" ? value.trim() : "").filter(Boolean)));
  if (!ids.length || ids.length > 500 || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return NextResponse.json({ error: "invalid_queue_ids" }, { status: 400 });
  }
  const status = String(body.targetStatus || "") as FactoryProductionQueueVisibleStatus;
  if (!FACTORY_PRODUCTION_VISIBLE_STATUS_SET.has(status)) return NextResponse.json({ error: "invalid_target_status" }, { status: 400 });
  const { data, error } = await client.rpc("update_factory_production_queue_statuses", {
    p_ids: ids, p_target_status: status, p_actor_user_id: actor.profileId,
  });
  if (error) {
    const statusCode = error.message === "forbidden" ? 403 : error.message === "queue_not_found" ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status: statusCode });
  }
  return NextResponse.json({ ok: true, updatedCount: data });
}
