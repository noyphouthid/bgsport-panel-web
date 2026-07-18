import { NextRequest, NextResponse } from "next/server";
import { getActorFromAuthHeader } from "@/lib/admin-api-auth";
import { normalizeFactoryProductionQueueStatus } from "@/lib/factory-production-queue";
import { FACTORY_PRODUCTION_QUEUE_FULL_SELECT, resolveEffectivePlannerMap } from "@/lib/factory-production-queue-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_ROLES = ["superadmin", "production"] as const;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "missing_server_env", message: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const actor = await getActorFromAuthHeader(req.headers.get("authorization"), [...ALLOWED_ROLES]);
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const [{ data: rowData, error: rowError }, { data: userData, error: userError }, { data: profileData, error: profileError }] =
      await Promise.all([
        supabaseAdmin.from("factory_production_queue_entries").select(FACTORY_PRODUCTION_QUEUE_FULL_SELECT).eq("id", id).maybeSingle(),
        supabaseAdmin.from("users").select("id,full_name,role,is_active").order("full_name", { ascending: true }),
        supabaseAdmin.from("users").select("id,role,permission_settings").eq("id", actor.profileId).maybeSingle(),
      ]);

    if (rowError) return NextResponse.json({ error: rowError.message }, { status: 400 });
    if (userError) return NextResponse.json({ error: userError.message }, { status: 400 });
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
    if (!rowData) return NextResponse.json({ error: "queue_not_found" }, { status: 404 });

    const row = rowData as { planner_user_id: string | null; status: "queued" | "pattern_laid" | "all_sizes_laid" | "ready_for_print" | "sent_to_factory" };
    const plannerMap = await resolveEffectivePlannerMap(supabaseAdmin, [row.planner_user_id]);
    const effectivePlannerUserId = row.planner_user_id ? plannerMap.get(row.planner_user_id) ?? null : null;
    if (
      actor.role === "production" &&
      normalizeFactoryProductionQueueStatus(row.status) === "queued" &&
      effectivePlannerUserId &&
      effectivePlannerUserId !== actor.profileId
    ) {
      return NextResponse.json({ error: "queue_already_claimed" }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      row: rowData,
      users: (userData ?? []) as Array<Record<string, unknown>>,
      profile: profileData ?? { id: actor.profileId, role: actor.role, permission_settings: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "load_factory_production_queue_detail_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
