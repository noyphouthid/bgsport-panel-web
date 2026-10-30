import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchCustomerDeliveryDatesWithClient, publicFactoryBill, publicOrderId } from "@/lib/public-customer-delivery-dates";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const headers = { "Cache-Control": "private, no-store, no-cache, must-revalidate", "X-Content-Type-Options": "nosniff" };

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const orders = params.get("orders")?.split(",") ?? [];
  const bills = params.get("bills")?.split(",") ?? [];
  if ((!orders.length && !bills.length) || orders.length > 20 || bills.length > 20 || orders.some(id => !publicOrderId(id)) || bills.some(bill => !publicFactoryBill(bill))) {
    return NextResponse.json({ error: "invalid_delivery_lookup" }, { status: 400, headers });
  }
  const client = getSupabaseAdmin();
  if (!client) return NextResponse.json({ error: "delivery_dates_unavailable" }, { status: 503, headers });
  try {
    const deliveryDates = await fetchCustomerDeliveryDatesWithClient(client, orders, bills);
    return NextResponse.json({ ok: true, deliveryDates }, { headers });
  } catch {
    return NextResponse.json({ error: "delivery_dates_unavailable" }, { status: 503, headers });
  }
}
