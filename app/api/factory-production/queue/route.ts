import { NextRequest, NextResponse } from "next/server";
import { getActorFromAuthHeader } from "@/lib/admin-api-auth";
import { buildFactoryProductionQueueStatusUpdate, type FactoryProductionQueueVisibleStatus } from "@/lib/factory-production-queue";
import {
  FACTORY_PRODUCTION_QUEUE_FULL_SELECT,
  FACTORY_PRODUCTION_QUEUE_UPDATE_SELECT,
  FACTORY_PRODUCTION_VISIBLE_STATUS_SET,
  resolveEffectivePlannerMap,
  type QueueUpdateRow,
} from "@/lib/factory-production-queue-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_ROLES = ["superadmin", "production"] as const;

function getUnauthorizedResponse() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

function getMissingEnvResponse() {
  return NextResponse.json(
    { error: "missing_server_env", message: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
    { status: 500 }
  );
}

function normalizeQueueRows<T extends { deposit?: { status?: string | null } | Array<{ status?: string | null }> | null }>(rows: T[]) {
  return rows.filter((row) => {
    const deposit = Array.isArray(row.deposit) ? row.deposit[0] ?? null : row.deposit ?? null;
    const depositStatus = String(deposit?.status || "").trim().toLowerCase();
    return depositStatus !== "draft" && depositStatus !== "cancelled";
  });
}

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return getMissingEnvResponse();

  const actor = await getActorFromAuthHeader(req.headers.get("authorization"), [...ALLOWED_ROLES]);
  if (!actor) return getUnauthorizedResponse();

  const shouldSync = req.nextUrl.searchParams.get("sync") === "1";

  try {
    if (shouldSync) {
      await supabaseAdmin.rpc("sync_factory_production_queue_entries", {
        p_actor_user_id: actor.profileId,
      });
    }

    const [{ data: queueData, error: queueError }, { data: userData, error: userError }, { data: profileData, error: profileError }] =
      await Promise.all([
        supabaseAdmin
          .from("factory_production_queue_entries")
          .select(FACTORY_PRODUCTION_QUEUE_FULL_SELECT)
          .order("queue_date", { ascending: false })
          .order("queue_sequence", { ascending: true }),
        supabaseAdmin.from("users").select("id,full_name,role,is_active").order("full_name", { ascending: true }),
        supabaseAdmin.from("users").select("id,role,permission_settings").eq("id", actor.profileId).maybeSingle(),
      ]);

    if (queueError) return NextResponse.json({ error: queueError.message }, { status: 400 });
    if (userError) return NextResponse.json({ error: userError.message }, { status: 400 });
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      rows: normalizeQueueRows((queueData ?? []) as Array<Record<string, unknown>>),
      users: (userData ?? []) as Array<Record<string, unknown>>,
      profile: profileData ?? { id: actor.profileId, role: actor.role, permission_settings: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "load_factory_production_queue_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return getMissingEnvResponse();

  const actor = await getActorFromAuthHeader(req.headers.get("authorization"), [...ALLOWED_ROLES]);
  if (!actor) return getUnauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "").trim();

  try {
    if (action === "claim") {
      const id = String(body.id || "").trim();
      if (!id) return NextResponse.json({ error: "missing_queue_id" }, { status: 400 });

      const { data, error } = await supabaseAdmin
        .from("factory_production_queue_entries")
        .select(FACTORY_PRODUCTION_QUEUE_UPDATE_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data) return NextResponse.json({ error: "queue_not_found" }, { status: 404 });

      const row = data as QueueUpdateRow;
      const plannerMap = await resolveEffectivePlannerMap(supabaseAdmin, [row.planner_user_id]);
      const effectivePlannerUserId = row.planner_user_id ? plannerMap.get(row.planner_user_id) ?? null : null;
      if (effectivePlannerUserId && effectivePlannerUserId !== actor.profileId) {
        return NextResponse.json({ error: "queue_already_claimed" }, { status: 409 });
      }

      if (!effectivePlannerUserId) {
        const { error: updateError } = await supabaseAdmin
          .from("factory_production_queue_entries")
          .update({
            planner_user_id: actor.profileId,
            updated_by_user_id: actor.profileId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "update_status") {
      const id = String(body.id || "").trim();
      const targetStatus = String(body.targetStatus || "").trim() as FactoryProductionQueueVisibleStatus;
      if (!id) return NextResponse.json({ error: "missing_queue_id" }, { status: 400 });
      if (!FACTORY_PRODUCTION_VISIBLE_STATUS_SET.has(targetStatus)) {
        return NextResponse.json({ error: "invalid_target_status" }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from("factory_production_queue_entries")
        .select(FACTORY_PRODUCTION_QUEUE_UPDATE_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data) return NextResponse.json({ error: "queue_not_found" }, { status: 404 });

      const row = data as QueueUpdateRow;
      const plannerMap = await resolveEffectivePlannerMap(supabaseAdmin, [row.planner_user_id]);
      const effectivePlannerUserId = row.planner_user_id ? plannerMap.get(row.planner_user_id) ?? null : null;
      if (effectivePlannerUserId && effectivePlannerUserId !== actor.profileId && actor.role === "production") {
        return NextResponse.json({ error: "queue_already_claimed" }, { status: 409 });
      }

      const now = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from("factory_production_queue_entries")
        .update({
          ...buildFactoryProductionQueueStatusUpdate(targetStatus, row, actor.profileId, now),
          planner_user_id: effectivePlannerUserId || actor.profileId,
          updated_by_user_id: actor.profileId,
        })
        .eq("id", id);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

      return NextResponse.json({ ok: true });
    }

    if (action === "bulk_status") {
      const rawIds = Array.isArray(body.ids) ? body.ids : [];
      const ids = Array.from(new Set(rawIds.map((item) => String(item || "").trim()).filter(Boolean)));
      const targetStatus = String(body.targetStatus || "").trim() as FactoryProductionQueueVisibleStatus;

      if (ids.length === 0) return NextResponse.json({ error: "missing_queue_ids" }, { status: 400 });
      if (!FACTORY_PRODUCTION_VISIBLE_STATUS_SET.has(targetStatus)) {
        return NextResponse.json({ error: "invalid_target_status" }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from("factory_production_queue_entries")
        .select(FACTORY_PRODUCTION_QUEUE_UPDATE_SELECT)
        .in("id", ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      const rows = (data ?? []) as QueueUpdateRow[];
      if (rows.length !== ids.length) return NextResponse.json({ error: "queue_not_found" }, { status: 404 });

      const plannerMap = await resolveEffectivePlannerMap(
        supabaseAdmin,
        rows.map((row) => row.planner_user_id)
      );
      const now = new Date().toISOString();

      for (const row of rows) {
        const effectivePlannerUserId = row.planner_user_id ? plannerMap.get(row.planner_user_id) ?? null : null;
        if (effectivePlannerUserId && effectivePlannerUserId !== actor.profileId && actor.role === "production") {
          return NextResponse.json({ error: "queue_already_claimed" }, { status: 409 });
        }
      }

      for (const row of rows) {
        const effectivePlannerUserId = row.planner_user_id ? plannerMap.get(row.planner_user_id) ?? null : null;
        const { error: updateError } = await supabaseAdmin
          .from("factory_production_queue_entries")
          .update({
            ...buildFactoryProductionQueueStatusUpdate(targetStatus, row, actor.profileId, now),
            planner_user_id: effectivePlannerUserId || actor.profileId,
            updated_by_user_id: actor.profileId,
          })
          .eq("id", row.id);
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, updatedCount: rows.length });
    }

    return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "update_factory_production_queue_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
