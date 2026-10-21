import type { FactoryDepositOrder } from "@/lib/factory-deposit-orders";
import type { SupabaseClient } from "@supabase/supabase-js";

const ORDER_ALERT_BATCH_SIZE = 100;

type OrderAlertDeposit = Pick<FactoryDepositOrder, "status" | "order_id" | "production_sent_date" | "delivery_date">;

export type OrderAlertOrderState = {
  id: string;
  status: "in_progress" | "completed";
  closed_at: string | null;
  production_completed_at: string | null;
  shipment_status: "pending" | "shipped" | null;
  shipment_completed_at: string | null;
};

export type OrderAlertOrderRow = OrderAlertOrderState & {
  order_image_url: string | null;
  factory_bill_code: string | null;
  short_qty: number | null;
  long_qty: number | null;
  free_qty: number | null;
};

export async function fetchOrderAlertOrdersWithClient(client: SupabaseClient, orderIds: string[]) {
  const uniqueIds = [...new Set(orderIds)];
  const batches: string[][] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += ORDER_ALERT_BATCH_SIZE) {
    batches.push(uniqueIds.slice(offset, offset + ORDER_ALERT_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map(async (ids) => {
      const [{ data: orderData, error: orderError }, { data: receiptData, error: receiptError }] = await Promise.all([
        client
          .from("orders")
          .select("id,status,closed_at,production_completed_at,shipment_status,shipment_completed_at,order_image_url,factory_bill_code,short_qty,long_qty,free_qty")
          .in("id", ids),
        client.from("factory_receipt_items").select("order_id").in("order_id", ids),
      ]);

      if (orderError) throw new Error(`ໂຫຼດສະຖານະອໍເດີບໍ່ສຳເລັດ: ${orderError.message}`);
      if (receiptError) throw new Error(`ໂຫຼດລາຍການຮັບເຂົ້າຈາກໂຮງງານບໍ່ສຳເລັດ: ${receiptError.message}`);

      // A receipt proves production is complete even if updating the order failed.
      const receivedOrderIds = new Set((receiptData ?? []).map((row) => row.order_id));
      return ((orderData ?? []) as OrderAlertOrderRow[]).filter((order) => !receivedOrderIds.has(order.id));
    })
  );

  return results.flat();
}

export function getOrderAlertErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ";
}

export function getOrderAlertToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Vientiane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function dateDayNumber(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  return timestamp / 86_400_000;
}

export function getOverdueOrderTiming(
  deposit: OrderAlertDeposit,
  order: OrderAlertOrderState | null,
  today = getOrderAlertToday()
) {
  if (deposit.status !== "converted" || !deposit.order_id || !order || order.id !== deposit.order_id) return null;
  if (order.status === "completed" || order.closed_at) return null;
  if (order.production_completed_at) return null;
  if (order.shipment_status === "shipped" || order.shipment_completed_at) return null;

  const todayDay = dateDayNumber(today);
  const sentDay = dateDayNumber(deposit.production_sent_date);
  const dueDay = dateDayNumber(deposit.delivery_date);
  if (todayDay === null || sentDay === null || dueDay === null) return null;
  if (sentDay > todayDay || dueDay >= todayDay) return null;

  return {
    dueInDays: dueDay - todayDay,
    productionDays: todayDay - sentDay,
  };
}
