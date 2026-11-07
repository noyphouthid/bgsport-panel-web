import { NextRequest, NextResponse } from "next/server";
import { getAdminActorFromAuthHeader } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: "missing_server_env" }, { status: 500 });

  const actor = await getAdminActorFromAuthHeader(req.headers.get("authorization"));
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("login_devices")
    .select("id,label,last_user_agent,first_seen_at,last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ devices: data ?? [] });
}
