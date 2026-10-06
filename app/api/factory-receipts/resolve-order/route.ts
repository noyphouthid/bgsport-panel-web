import { NextRequest, NextResponse } from "next/server";
import { canAccessPath } from "@/lib/access-control";
import { getActorFromAuthHeader } from "@/lib/admin-api-auth";
import { extractLifefootballOrderId } from "@/lib/lifefootball-order";
import { LifefootballLookupError, resolveLifefootballOrderCode } from "@/lib/lifefootball-order-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeUserPermissionSettings } from "@/lib/user-permissions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const actor = await getActorFromAuthHeader(req.headers.get("authorization"));
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "missing_server_env" }, { status: 503 });
  const { data: profile, error } = await admin.from("users").select("permission_settings").eq("id", actor.profileId).maybeSingle();
  if (error || !profile || !canAccessPath("/factory-receipts", actor.role, normalizeUserPermissionSettings(profile.permission_settings))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const orderId = typeof body?.url === "string" && body.url.length <= 2048 ? extractLifefootballOrderId(body.url) : null;
  if (!orderId) {
    return NextResponse.json({ error: "invalid_factory_url", message: "ລິ້ງ QR ໂຮງງານບໍ່ຖືກຕ້ອງ" }, { status: 400 });
  }
  try {
    const factoryBillCode = await resolveLifefootballOrderCode(orderId);
    return NextResponse.json({ factoryBillCode }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof LifefootballLookupError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "factory_lookup_failed", message: "ກວດລະຫັດອໍເດີໂຮງງານບໍ່ສຳເລັດ" }, { status: 502 });
  }
}
