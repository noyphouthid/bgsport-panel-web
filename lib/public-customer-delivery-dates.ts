import type { SupabaseClient } from "@supabase/supabase-js";

export const publicOrderId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const publicFactoryBill = (value: string) => /^\d{2}-\d{3,16}$/.test(value);

export type CustomerDeliveryDate = {
  orderId: string | null;
  factoryBillCode: string | null;
  deliveryDate: string | null;
};

export function customerDeliveryDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

// Called only on the server. Never return deposit amounts, contacts or notes.
export async function fetchCustomerDeliveryDatesWithClient(
  client: SupabaseClient,
  orderIds: string[],
  factoryBills: string[]
): Promise<CustomerDeliveryDate[]> {
  if (orderIds.length > 20 || factoryBills.length > 20 || orderIds.some(id => !publicOrderId(id)) || factoryBills.some(bill => !publicFactoryBill(bill))) {
    throw new Error("invalid_delivery_lookup");
  }
  const ids = [...new Set(orderIds)], bills = [...new Set(factoryBills)];
  if (!ids.length && !bills.length) return [];
  const filters = [];
  if (ids.length) filters.push(`order_id.in.(${ids.join(",")})`);
  if (bills.length) filters.push(`factory_bill_code.in.(${bills.join(",")})`);
  const { data, error } = await client.from("factory_deposit_orders")
    .select("order_id,factory_bill_code,delivery_date")
    .in("status", ["submitted", "approved", "converted"])
    .or(filters.join(","))
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("delivery_dates_unavailable");
  return (data ?? []).flatMap(row => {
    const orderId = typeof row.order_id === "string" && publicOrderId(row.order_id) ? row.order_id : null;
    const factoryBillCode = typeof row.factory_bill_code === "string" && publicFactoryBill(row.factory_bill_code) ? row.factory_bill_code : null;
    if (!(orderId && ids.includes(orderId)) && !(factoryBillCode && bills.includes(factoryBillCode))) return [];
    return [{ orderId, factoryBillCode, deliveryDate: customerDeliveryDate(row.delivery_date) }];
  });
}
