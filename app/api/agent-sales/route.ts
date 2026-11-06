import { NextRequest, NextResponse } from "next/server";
import { getActorFromAuthHeader } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { agentSalesError, agentSalesPeriod, summarizeAgentSales, type AgentSalesOrder } from "@/lib/agent-sales";
import { fetchAllReportRows } from "@/lib/report-query";

const headers = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const actor = await getActorFromAuthHeader(req.headers.get("authorization"), ["agent", "superadmin", "manager", "accountant"]);
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "missing_server_env" }, { status: 500, headers });
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  let period;
  try { period = agentSalesPeriod(year, month); }
  catch { return NextResponse.json({ error: "invalid_period" }, { status: 400, headers }); }
  const requestedAgent = req.nextUrl.searchParams.get("agentId") || "";
  if (actor.role === "agent" && requestedAgent && requestedAgent !== actor.profileId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }
  const agentId = actor.role === "agent" ? actor.profileId : requestedAgent;
  if (agentId && !UUID.test(agentId)) return NextResponse.json({ error: "invalid_agent" }, { status: 400, headers });
  const { data, error } = await fetchAllReportRows<AgentSalesOrder>((from, to) => {
    let query = db.from("orders")
      .select("id,order_code,created_at,agent_user_id,short_qty,long_qty,free_qty,net_total,agent_commission_rate_lak")
      .not("agent_user_id", "is", null)
      .gte("created_at", period.start).lt("created_at", period.endExclusive)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
    if (agentId) query = query.eq("agent_user_id", agentId);
    return query;
  });
  if (error) return NextResponse.json({ error: agentSalesError(error.message) }, { status: 500, headers });
  // Never send the staff selector to an agent, including inactive agents.
  let agents: Array<{ id: string; full_name: string; is_active: boolean }> = [];
  if (actor.role !== "agent") {
    const result = await db.from("users").select("id,full_name,is_active").eq("role", "agent").order("full_name");
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500, headers });
    agents = result.data || [];
  }
  const orders = data || [];
  return NextResponse.json({ orders, summary: summarizeAgentSales(orders), agents }, { headers });
}
