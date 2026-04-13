import { NextRequest, NextResponse } from "next/server";
import { getActorFromAuthHeader } from "@/lib/admin-api-auth";
import {
  buildFactoryProductionErrorUpdate,
  buildFactoryProductionUpdate,
  fetchFactoryProductionSnapshot,
} from "@/lib/factory-production";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_ROLES = ["superadmin", "admin", "manager", "staff", "graphic", "accountant"] as const;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
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
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id,order_code,factory_bill_code")
    .eq("id", id)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 400 });
  }
  if (!order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  const factoryBillCode = String(order.factory_bill_code || "").trim();
  if (!factoryBillCode) {
    return NextResponse.json({ error: "missing_factory_bill_code" }, { status: 400 });
  }

  const syncedAt = new Date().toISOString();

  try {
    const snapshot = await fetchFactoryProductionSnapshot(factoryBillCode);
    const update = buildFactoryProductionUpdate(snapshot, syncedAt);
    const { error: updateError } = await supabaseAdmin.from("orders").update(update).eq("id", id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      orderId: id,
      orderCode: order.order_code,
      factoryBillCode,
      syncedAt,
      snapshot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "factory_sync_failed";
    await supabaseAdmin.from("orders").update(buildFactoryProductionErrorUpdate(message, syncedAt)).eq("id", id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
