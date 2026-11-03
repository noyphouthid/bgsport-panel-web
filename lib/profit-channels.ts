import type { ShipmentDeliveryRequestRow } from "./shipment-delivery-requests";
import type { TransportNoteRow } from "./transport-notes";

export const PROFIT_CHANNELS = ["cod", "transport", "pickup", "unknown"] as const;
export type ProfitChannel = typeof PROFIT_CHANNELS[number];
export type ProfitChannelFilter = "all" | ProfitChannel;

export const PROFIT_CHANNEL_LABELS: Record<ProfitChannel, string> = {
  cod: "COD",
  transport: "ຂົນສົ່ງ / ໂດຍສານ",
  pickup: "ລູກຄ້າມາຮັບເອງ",
  unknown: "ບໍ່ລະບຸຊ່ອງທາງ",
};

export type ProfitChannelRequest = Pick<ShipmentDeliveryRequestRow,
  "id" | "order_id" | "delivery_method" | "status" | "delivered_at" | "approved_at" | "created_at"
>;
export type ProfitChannelNote = Pick<TransportNoteRow,
  "id" | "order_id" | "delivery_request_id" | "transport_deposited_at"
>;

export function buildProfitChannelMap(requests: readonly ProfitChannelRequest[], notes: readonly ProfitChannelNote[]) {
  const latest = new Map<string, { channel: ProfitChannel; timestamp: number; id: string }>();
  const setLatest = (orderId: string, channel: ProfitChannel, date: string | null, id: string) => {
    const timestamp = date ? Date.parse(date) : NaN;
    if (!Number.isFinite(timestamp)) return;
    const previous = latest.get(orderId);
    if (!previous || timestamp > previous.timestamp || (timestamp === previous.timestamp && id > previous.id)) {
      latest.set(orderId, { channel, timestamp, id });
    }
  };
  for (const request of requests) {
    if (request.status !== "approved" && request.status !== "delivered") continue;
    setLatest(request.order_id, request.delivery_method, request.delivered_at || request.approved_at || request.created_at, request.id);
  }
  // Standalone notes can establish transport only after an actual deposit.
  // Linked notes use their request, so an unapproved request cannot replace a delivery.
  for (const note of notes) {
    if (note.order_id && !note.delivery_request_id && note.transport_deposited_at) {
      setLatest(note.order_id, "transport", note.transport_deposited_at, note.id);
    }
  }
  return new Map([...latest].map(([orderId, value]) => [orderId, value.channel]));
}

export function getProfitChannel(order: { id: string; has_transport_cod?: boolean }, channels: ReadonlyMap<string, ProfitChannel>): ProfitChannel {
  // Count an order once: COD takes precedence over its transport method.
  return order.has_transport_cod ? "cod" : channels.get(order.id) || "unknown";
}
