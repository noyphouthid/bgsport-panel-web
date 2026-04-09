import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  mapOrderToPublicTracking,
  matchesTrackingQuery,
  rankTrackingMatch,
  type PublicTrackingResult,
} from "@/lib/public-order-tracking";

type RawOrderRow = {
  id: string;
  order_code: string;
  order_date: string;
  customer_phone: string | null;
  customer_whatsapp: string | null;
  fabric_name: string;
  short_qty: number | null;
  long_qty: number | null;
  free_qty: number | null;
  status: "in_progress" | "completed";
  closed_at: string | null;
  shipment_status: "pending" | "shipped" | null;
  shipment_completed_at: string | null;
  production_completed_at: string | null;
  factory_bill_code: string | null;
  factory_production_status: string | null;
  factory_production_status_index: number | null;
  factory_production_shipping_status: string | null;
  factory_production_due_date: string | null;
  factory_production_is_rush: boolean | null;
  factory_production_source_updated_at: string | null;
  factory_production_synced_at: string | null;
  factory_production_payload: {
    statuses?: string[] | null;
    updated_at_display?: string | null;
    due_date_display?: string | null;
  } | null;
};

function normalizeDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "missing_server_env", message: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const search = String(req.nextUrl.searchParams.get("q") || "").trim();
  if (!search) {
    return NextResponse.json({ error: "missing_query" }, { status: 400 });
  }

  const digits = normalizeDigits(search);
  if (search.length < 3 && digits.length < 3) {
    return NextResponse.json({ error: "query_too_short" }, { status: 400 });
  }

  const escapedText = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const escapedDigits = digits.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const clauses = [`order_code.ilike.%${escapedText}%`];
  if (escapedDigits.length >= 4) {
    clauses.push(`customer_phone.ilike.%${escapedDigits}%`);
    clauses.push(`customer_whatsapp.ilike.%${escapedDigits}%`);
  }

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id,order_code,order_date,customer_phone,customer_whatsapp,fabric_name,short_qty,long_qty,free_qty,status,closed_at,shipment_status,shipment_completed_at,production_completed_at,factory_bill_code,factory_production_status,factory_production_status_index,factory_production_shipping_status,factory_production_due_date,factory_production_is_rush,factory_production_source_updated_at,factory_production_synced_at,factory_production_payload"
    )
    .or(clauses.join(","))
    .order("order_date", { ascending: false })
    .limit(40);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const matches = ((data ?? []) as RawOrderRow[])
    .filter((row) => matchesTrackingQuery(row, search))
    .sort((a, b) => {
      const byRank = rankTrackingMatch(b, search) - rankTrackingMatch(a, search);
      if (byRank !== 0) return byRank;
      return String(b.order_date || "").localeCompare(String(a.order_date || ""));
    })
    .slice(0, 20);

  const results: PublicTrackingResult[] = matches.map(mapOrderToPublicTracking);
  return NextResponse.json({
    ok: true,
    query: search,
    count: results.length,
    results,
  });
}
