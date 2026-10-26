"use client";

import { OrderActivityTimeline, type OrderActivityItem } from "../../_components/order-activity-timeline";

export type OrderHistoryEntry = OrderActivityItem;

export function OrderActivityPanel({ items, loading = false }: { items: OrderHistoryEntry[]; loading?: boolean }) {
  return <OrderActivityTimeline items={items} loading={loading} />;
}
