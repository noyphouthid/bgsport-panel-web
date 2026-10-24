import { NextRequest, NextResponse } from "next/server";
import { getActorFromAuthHeader } from "@/lib/admin-api-auth";
import { FACTORY_PRODUCTION_QUEUE_LIST_SELECT, FACTORY_PRODUCTION_VISIBLE_STATUS_SET, productionParticipantFilter } from "@/lib/factory-production-queue-server";
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
    const [usersResult, profileResult, settingsResult] = await Promise.all([
      client.from("users").select("id,full_name,role,is_active").order("full_name"),
      client.from("users").select("id,role,permission_settings").eq("id", actor.profileId).single(),
      client.from("factory_production_queue_settings").select("started_at").single(),
    ]);
    if (usersResult.error) throw usersResult.error;
    if (profileResult.error) throw profileResult.error;
    if (settingsResult.error) throw settingsResult.error;
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = client.from("factory_production_queue_entries").select(FACTORY_PRODUCTION_QUEUE_LIST_SELECT)
        .in("deposit.status", ["submitted", "approved", "converted"])
        .eq("deposit.production_queue_legacy", false).not("deposit.production_queue_entered_at", "is", null)
        .order("queue_date", { ascending: false }).order("queue_sequence").range(offset, offset + 499);
      if (actor.role !== "superadmin") query = query.or(productionParticipantFilter(actor.profileId));
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data ?? []) as unknown as Record<string, unknown>[]);
      if (!data || data.length < 500) break;
    }
    return NextResponse.json({ ok: true, rows, startedAt: settingsResult.data?.started_at, users: usersResult.data, profile: { ...profileResult.data, role: actor.role } });
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
  if ((body.action === "reassign" || body.action === "assign_stages") && actor.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (body.action !== "update_status" && body.action !== "bulk_status" && body.action !== "reassign" && body.action !== "assign_stages" && body.action !== "complete_pattern" && body.action !== "start_print") {
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
  }
  const ids = Array.from(new Set((body.action === "bulk_status" && Array.isArray(body.ids) ? body.ids : [body.id])
    .map(value => typeof value === "string" ? value.trim() : "").filter(Boolean)));
  if (!ids.length || ids.length > 500 || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return NextResponse.json({ error: "invalid_queue_ids" }, { status: 400 });
  }
  if (body.action === "assign_stages") {
    const next = body.assignments as Record<string, unknown> | null;
    const expected = body.expectedAssignments as Record<string, unknown> | null;
    const keys = ["patternUserId", "printUserId", "dispatchUserId"];
    const validId = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    if (!next || !expected || keys.some(key => !validId(next[key]) || (expected[key] !== null && !validId(expected[key])))) return NextResponse.json({ error: "invalid_planner_user" }, { status: 400 });
    const { error } = await client.rpc("assign_factory_production_stages", {
      p_id: ids[0], p_pattern_user_id: next.patternUserId, p_print_user_id: next.printUserId, p_dispatch_user_id: next.dispatchUserId,
      p_actor_user_id: actor.profileId, p_expected_pattern_user_id: expected.patternUserId, p_expected_print_user_id: expected.printUserId, p_expected_dispatch_user_id: expected.dispatchUserId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: error.message === "forbidden" ? 403 : error.message === "assignment_changed" ? 409 : 400 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "complete_pattern" || body.action === "start_print") {
    const { error } = await client.rpc("advance_factory_production_task", { p_id: ids[0], p_action: body.action, p_actor_user_id: actor.profileId });
    if (error) return NextResponse.json({ error: error.message }, { status: error.message === "forbidden" ? 403 : error.message === "queue_not_found" ? 404 : 400 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "reassign") {
    const plannerId = typeof body.plannerUserId === "string" ? body.plannerUserId.trim() : "";
    const expectedPlannerId = body.expectedPlannerUserId;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(plannerId) || (expectedPlannerId !== null && (typeof expectedPlannerId !== "string" || !uuidPattern.test(expectedPlannerId)))) {
      return NextResponse.json({ error: "invalid_planner_user" }, { status: 400 });
    }
    const { error } = await client.rpc("reassign_factory_production_queue_entry", {
      p_id: ids[0], p_planner_user_id: plannerId, p_actor_user_id: actor.profileId,
      p_expected_planner_user_id: expectedPlannerId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: error.message === "forbidden" ? 403 : error.message === "assignment_changed" ? 409 : error.message === "queue_not_found" ? 404 : 400 });
    }
    return NextResponse.json({ ok: true });
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
