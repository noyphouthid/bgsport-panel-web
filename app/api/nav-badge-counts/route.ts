import { NextRequest, NextResponse } from "next/server";
import { getActorFromAuthHeader } from "@/lib/admin-api-auth";
import { fetchNavBadgeCountsWithClient } from "@/lib/nav-badge-counts";
import { parseSeenMarkers } from "@/lib/nav-badge-seen";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeUserPermissionSettings } from "@/lib/user-permissions";

const ALLOWED_ROLES = ["superadmin", "admin", "manager", "staff", "graphic", "production", "accountant", "agent"] as const;

export async function GET(req: NextRequest) {
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

  // Page overrides decide which counts this viewer may receive, so a failed read must not widen them.
  const { data: profileRow, error: profileError } = await supabaseAdmin.from("users").select("permission_settings").eq("id", actor.profileId).maybeSingle();
  if (profileError) return NextResponse.json({ error: "load_nav_badge_counts_failed" }, { status: 500 });
  const profile = {
    id: actor.profileId,
    role: actor.role,
    permission_settings: normalizeUserPermissionSettings(profileRow?.permission_settings),
  };
  const seen = parseSeenMarkers(req.nextUrl.searchParams.get("seen"));

  // Agent badges use the caller's JWT and database policies, never service-role
  // queries that can count another agent's orders.
  if (actor.role === "agent") {
    const { createClient } = await import("@supabase/supabase-js");
    const scopedClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: req.headers.get("authorization")! } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    try {
      const counts = await fetchNavBadgeCountsWithClient(scopedClient, profile, seen);
      return NextResponse.json({ ok: true, counts }, { headers: { "Cache-Control": "private, no-store" } });
    } catch {
      return NextResponse.json({ error: "load_nav_badge_counts_failed" }, { status: 500 });
    }
  }

  try {
    const counts = await fetchNavBadgeCountsWithClient(supabaseAdmin, profile, seen);
    return NextResponse.json({ ok: true, counts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "load_nav_badge_counts_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
