import { NextRequest, NextResponse } from "next/server";
import { getActorFromAuthHeader } from "@/lib/admin-api-auth";
import {
  buildFactoryProductionErrorUpdate,
  buildFactoryProductionUpdate,
  fetchFactoryProductionSnapshot,
} from "@/lib/factory-production";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_ROLES = ["superadmin", "admin", "manager", "staff", "graphic", "accountant"] as const;

type SyncBody = {
  orderIds?: string[];
};

type OrderRow = {
  id: string;
  order_code: string;
  factory_bill_code: string | null;
};

export async function POST(req: NextRequest) {
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

  const body = (await req.json().catch(() => ({}))) as SyncBody;
  const normalizedIds = Array.isArray(body.orderIds)
    ? Array.from(new Set(body.orderIds.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];

  let query = supabaseAdmin.from("orders").select("id,order_code,factory_bill_code").order("order_date", { ascending: false });
  if (normalizedIds.length > 0) {
    query = query.in("id", normalizedIds);
  } else {
    query = query.not("factory_bill_code", "is", null).neq("factory_bill_code", "");
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = ((data ?? []) as OrderRow[]).filter((row) => String(row.factory_bill_code || "").trim());
  const results: Array<{
    orderId: string;
    orderCode: string;
    factoryBillCode: string | null;
    ok: boolean;
    status: string | null;
    statusIndex: number | null;
    error: string | null;
  }> = [];

  for (const row of rows) {
    const factoryBillCode = String(row.factory_bill_code || "").trim();
    const syncedAt = new Date().toISOString();
    try {
      const snapshot = await fetchFactoryProductionSnapshot(factoryBillCode);
      const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update(buildFactoryProductionUpdate(snapshot, syncedAt))
        .eq("id", row.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      results.push({
        orderId: row.id,
        orderCode: row.order_code,
        factoryBillCode,
        ok: true,
        status: snapshot.currentStatus,
        statusIndex: snapshot.currentStatusIndex,
        error: null,
      });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "factory_sync_failed";
      await supabaseAdmin.from("orders").update(buildFactoryProductionErrorUpdate(message, syncedAt)).eq("id", row.id);
      results.push({
        orderId: row.id,
        orderCode: row.order_code,
        factoryBillCode,
        ok: false,
        status: null,
        statusIndex: null,
        error: message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    requestedCount: normalizedIds.length > 0 ? normalizedIds.length : rows.length,
    syncedCount: results.filter((item) => item.ok).length,
    failedCount: results.filter((item) => !item.ok).length,
    results,
  });
}
