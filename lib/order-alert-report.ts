import type { SupabaseClient } from "@supabase/supabase-js";
import type { FactoryDepositOrder } from "@/lib/factory-deposit-orders";
import { fetchOrderAlertOrdersWithClient, getOrderAlertTiming, getOrderAlertToday } from "@/lib/order-alerts";
import { getTotalShirtQty } from "@/lib/order-quantities";
import { fetchAllReportRows } from "@/lib/report-query";

type ReportDeposit = Pick<FactoryDepositOrder,
  "id" | "order_id" | "order_code" | "factory_bill_code" | "production_sent_date" |
  "delivery_date" | "production_priority" | "status"
>;

export type OrderAlertReportRow = {
  id: string;
  orderId: string;
  orderCode: string;
  factoryBillCode: string;
  quantity: number;
  productionSentDate: string;
  deliveryDate: string;
  overdueDays: number;
  priority: "normal" | "urgent";
};

export const ORDER_ALERT_REPORT_HEADERS = [
  "ລຳດັບ", "ລະຫັດອໍເດີ້ BG", "ລະຫັດບິນໂຮງງານ", "ຈຳນວນ",
  "ວັນທີ່ສົ່ງຜະລິດ", "ກຳນົດສົ່ງລູກຄ້າ", "ເກີນກຳນົດຈັກວັນ", "ປະເພດງານ (ງານດ່ວນ/ປົກກະຕິ)",
];

export function formatOrderAlertReportDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function getOrderAlertReportCells(row: OrderAlertReportRow, index: number) {
  return [index + 1, row.orderCode, row.factoryBillCode, row.quantity,
    formatOrderAlertReportDate(row.productionSentDate), formatOrderAlertReportDate(row.deliveryDate),
    row.overdueDays, row.priority === "urgent" ? "ງານດ່ວນ" : "ປົກກະຕິ"];
}

export async function fetchOrderAlertReportWithClient(client: SupabaseClient, today = getOrderAlertToday()) {
  const { data, error } = await fetchAllReportRows<ReportDeposit>((from, to) => client
    .from("factory_deposit_orders")
    .select("id,order_id,order_code,factory_bill_code,production_sent_date,delivery_date,production_priority,status")
    .eq("status", "converted")
    .not("order_id", "is", null)
    .not("production_sent_date", "is", null)
    .lte("production_sent_date", today)
    .lt("delivery_date", today)
    .order("delivery_date", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to));
  if (error) throw new Error(`ໂຫຼດລາຍງານອໍເດີ້ບໍ່ສຳເລັດ: ${error.message}`);

  const deposits = data ?? [];
  const orders = await fetchOrderAlertOrdersWithClient(client, deposits.flatMap(row => row.order_id ? [row.order_id] : []));
  const ordersById = new Map(orders.map(row => [row.id, row]));
  const rows: OrderAlertReportRow[] = [];
  for (const deposit of deposits) {
    const order = ordersById.get(deposit.order_id || "") ?? null;
    const timing = getOrderAlertTiming(deposit, order, today);
    if (!timing || timing.dueInDays >= 0 || !order) continue;
    rows.push({
      id: deposit.id,
      orderId: order.id,
      orderCode: deposit.order_code?.trim() || "-",
      factoryBillCode: deposit.factory_bill_code?.trim() || order.factory_bill_code?.trim() || "-",
      quantity: getTotalShirtQty(order),
      productionSentDate: deposit.production_sent_date!,
      deliveryDate: deposit.delivery_date!,
      overdueDays: -timing.dueInDays,
      priority: deposit.production_priority === "urgent" ? "urgent" : "normal",
    });
  }
  return rows.sort((a, b) => b.overdueDays - a.overdueDays || a.orderCode.localeCompare(b.orderCode) || a.id.localeCompare(b.id));
}
