import { NextRequest, NextResponse } from "next/server";
import { getActorFromAuthHeader } from "@/lib/admin-api-auth";
import { fetchNavBadgeCountsWithClient } from "@/lib/nav-badge-counts";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_ROLES = ["superadmin", "admin", "manager", "staff", "graphic", "production", "accountant"] as const;

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

  try {
    const counts = await fetchNavBadgeCountsWithClient(supabaseAdmin, {
      id: actor.profileId,
      role: actor.role,
    });

    return NextResponse.json({
      ok: true,
      counts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "load_nav_badge_counts_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
