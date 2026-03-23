import { NextRequest, NextResponse } from "next/server";
import { getAdminActorFromAuthHeader } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type TransferOrdersBody = {
  source_user_id?: string;
  assignment_type?: "admin" | "graphic";
};

const ADMIN_ROLE_ALIASES = new Set(["superadmin", "admin", "sale-admin", "sale_admin"]);
const GRAPHIC_ROLE_ALIASES = new Set(["graphic", "graphics", "designer"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "missing_server_env", message: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const actor = await getAdminActorFromAuthHeader(req.headers.get("authorization"));
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: targetUserId } = await ctx.params;
  const body = (await req.json()) as TransferOrdersBody;
  const sourceUserId = String(body.source_user_id || "").trim();
  const assignmentType = body.assignment_type === "graphic" ? "graphic" : "admin";

  if (!sourceUserId) {
    return NextResponse.json({ error: "missing_source_user_id" }, { status: 400 });
  }
  if (sourceUserId === targetUserId) {
    return NextResponse.json({ error: "same_source_and_target" }, { status: 400 });
  }

  const { data: users, error: usersError } = await supabaseAdmin
    .from("users")
    .select("id,full_name,role")
    .in("id", [sourceUserId, targetUserId]);

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 400 });
  }

  const sourceUser = (users ?? []).find((item) => item.id === sourceUserId);
  const targetUser = (users ?? []).find((item) => item.id === targetUserId);

  if (!sourceUser) {
    return NextResponse.json({ error: "source_user_not_found" }, { status: 404 });
  }
  if (!targetUser) {
    return NextResponse.json({ error: "target_user_not_found" }, { status: 404 });
  }

  const sourceRole = String(sourceUser.role || "").toLowerCase();
  const targetRole = String(targetUser.role || "").toLowerCase();
  const roleSet = assignmentType === "graphic" ? GRAPHIC_ROLE_ALIASES : ADMIN_ROLE_ALIASES;
  const roleErrorPrefix = assignmentType === "graphic" ? "graphic" : "admin";

  if (!roleSet.has(sourceRole)) {
    return NextResponse.json({ error: `source_user_is_not_${roleErrorPrefix}` }, { status: 400 });
  }
  if (!roleSet.has(targetRole)) {
    return NextResponse.json({ error: `target_user_is_not_${roleErrorPrefix}` }, { status: 400 });
  }

  const assignmentColumn = assignmentType === "graphic" ? "graphic_user_id" : "admin_user_id";

  const { count, error: countError } = await supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq(assignmentColumn, sourceUserId);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 400 });
  }

  const transferCount = Number(count || 0);

  if (transferCount === 0) {
    return NextResponse.json({
      ok: true,
      transferred_count: 0,
      source_user_name: sourceUser.full_name,
      target_user_name: targetUser.full_name,
    });
  }

  const { error: updateError } = await supabaseAdmin
    .from("orders")
    .update({ [assignmentColumn]: targetUserId })
    .eq(assignmentColumn, sourceUserId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    transferred_count: transferCount,
    assignment_type: assignmentType,
    source_user_name: sourceUser.full_name,
    target_user_name: targetUser.full_name,
  });
}
