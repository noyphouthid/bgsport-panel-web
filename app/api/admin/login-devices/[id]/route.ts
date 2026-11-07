import { NextRequest, NextResponse } from "next/server";
import { getAdminActorFromAuthHeader } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Names a computer, e.g. "ຄອມແຄັດເຊຍ 1". An empty label clears the name.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: "missing_server_env" }, { status: 500 });

  const actor = await getAdminActorFromAuthHeader(req.headers.get("authorization"));
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { label?: string | null };
  const label = String(body.label ?? "").trim();
  if (label.length > 100) return NextResponse.json({ error: "label_too_long" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("login_devices")
    .update({ label: label || null })
    .eq("id", id)
    .select("id,label")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ device: data });
}
