export const AGENT_COMMISSION_RATE_LAK = 2500;
export const AGENT_SALES_MIGRATION = "20261109_add_sales_agents.sql";

export type AgentSalesOrder = {
  id: string;
  order_code: string;
  created_at: string;
  agent_user_id: string;
  short_qty: number;
  long_qty: number;
  free_qty: number;
  net_total: number;
  agent_commission_rate_lak: number;
};

export type AgentSalesSummary = {
  orders: number;
  paidShirts: number;
  freeShirts: number;
  salesLak: number;
  commissionLak: number;
};

export function agentSalesPeriod(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 9998 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("invalid_period");
  }
  const start = `${year}-${String(month).padStart(2, "0")}-01T00:00:00+07:00`;
  const end = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  return { start, endExclusive: `${end}-01T00:00:00+07:00` };
}

export function paidAgentShirts(order: Pick<AgentSalesOrder, "short_qty" | "long_qty">) {
  return Math.max(0, Number(order.short_qty) || 0) + Math.max(0, Number(order.long_qty) || 0);
}

export function agentOrderCommission(order: Pick<AgentSalesOrder, "short_qty" | "long_qty" | "agent_commission_rate_lak">) {
  return paidAgentShirts(order) * Math.max(0, Number(order.agent_commission_rate_lak) || 0);
}

export function summarizeAgentSales(orders: AgentSalesOrder[]): AgentSalesSummary {
  return orders.reduce<AgentSalesSummary>((sum, order) => ({
    orders: sum.orders + 1,
    paidShirts: sum.paidShirts + paidAgentShirts(order),
    freeShirts: sum.freeShirts + Math.max(0, Number(order.free_qty) || 0),
    salesLak: sum.salesLak + (Number(order.net_total) || 0),
    commissionLak: sum.commissionLak + agentOrderCommission(order),
  }), { orders: 0, paidShirts: 0, freeShirts: 0, salesLak: 0, commissionLak: 0 });
}

export function agentSalesError(message: string) {
  return /agent_user_id|agent_commission_rate_lak|source_deposit_order_id/.test(message)
    ? `ກະລຸນາລັນ ${AGENT_SALES_MIGRATION} ໃນ Supabase SQL Editor`
    : message;
}
