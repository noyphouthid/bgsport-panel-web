import { NextRequest, NextResponse } from "next/server";
import { getActorFromAuthHeader } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { FACTORY_PRODUCTION_QUEUE_LIST_SELECT, productionCreditParticipantFilter } from "@/lib/factory-production-queue-server";
import { getProductionCompletionDateRange, getProductionCompletionPeriod, getProductionCredit, getProductionCreditParticipants, getProductionQueueDeposit, isProductionOrderCompleted, type ProductionQueueRow } from "@/lib/factory-production-queue";

export async function GET(req: NextRequest) {
  const client = getSupabaseAdmin();
  if (!client) return NextResponse.json({ error: "missing_server_env" }, { status: 500 });
  const actor = await getActorFromAuthHeader(req.headers.get("authorization"), ["superadmin", "production"]);
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const selected = req.nextUrl.searchParams.get("planner") || (actor.role === "superadmin" ? "ALL" : actor.profileId);
  if (actor.role !== "superadmin" && selected !== actor.profileId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const year = req.nextUrl.searchParams.get("year") || String(getProductionCompletionPeriod(new Date().toISOString())!.year);
  const month = req.nextUrl.searchParams.get("month") || "ALL";
  if ((year !== "ALL" && (!/^\d{4}$/.test(year) || Number(year) < 2000 || Number(year) > 2200)) || (month !== "ALL" && (!/^\d{1,2}$/.test(month) || Number(month) < 1 || Number(month) > 12))) return NextResponse.json({ error: "invalid_period" }, { status: 400 });
  try {
    let peopleQuery = client.from("users").select("id,full_name,role,is_active").eq("is_active", true).in("role", ["superadmin", "production", "factory-production", "production-team"]).order("full_name");
    if (actor.role !== "superadmin") peopleQuery = peopleQuery.eq("id", actor.profileId);
    const { data: people, error: peopleError } = await peopleQuery;
    if (peopleError) throw peopleError;
    if (selected !== "ALL" && !(people || []).some(user => user.id === selected)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const rows: ProductionQueueRow[] = [];
    const completionRange = year === "ALL" ? null : getProductionCompletionDateRange(Number(year), month === "ALL" ? undefined : Number(month));
    for (let offset = 0; ; offset += 500) {
      let query = client.from("factory_production_queue_entries").select(FACTORY_PRODUCTION_QUEUE_LIST_SELECT)
        .in("deposit.status", ["submitted", "approved", "converted"]).eq("deposit.production_queue_legacy", false).not("deposit.production_queue_entered_at", "is", null)
        .in("status", ["awaiting_factory", "sent_to_factory"]).not("production_completed_at", "is", null)
        .order("production_completed_at", { ascending: false }).order("queue_sequence", { ascending: false }).range(offset, offset + 499);
      if (selected !== "ALL") query = query.or(productionCreditParticipantFilter(selected));
      if (completionRange) query = query.gte("production_completed_at", completionRange.start).lt("production_completed_at", completionRange.end);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...((data || []) as unknown as ProductionQueueRow[]).filter(row => {
        const period = getProductionCompletionPeriod(row.production_completed_at);
        return period && (year === "ALL" || period.year === Number(year)) && (month === "ALL" || period.month === Number(month));
      }));
      if (!data || data.length < 500) break;
    }
    const visiblePeople = (people || []).filter(user => selected === "ALL" || user.id === selected);
    const summaries = visiblePeople.map(user => {
      const ownRows = rows.filter(row => getProductionCreditParticipants(row).includes(user.id));
      const done = ownRows.filter(isProductionOrderCompleted);
      return { userId: user.id, fullName: user.full_name, completedOrderCount: done.length,
        completedPieceQty: done.reduce((sum, row) => sum + getProductionCredit(row, user.id), 0),
        awaitingCount: done.filter(row => row.status === "awaiting_factory").length, sentCount: done.filter(row => row.status === "sent_to_factory").length };
    });
    // Each returned detail contains this user's credit only. Other workers' totals never enter a staff response.
    const completed = visiblePeople.flatMap(user => rows.filter(row => isProductionOrderCompleted(row) && getProductionCreditParticipants(row).includes(user.id)).map(row => {
      const deposit = getProductionQueueDeposit(row);
      return { id: row.id, userId: user.id, fullName: user.full_name, queueNumber: row.queue_number, orderNo: row.order_no,
        orderCode: deposit?.order_code || deposit?.deposit_no || row.order_no, customerName: deposit?.team_name || deposit?.customer_name || "-",
        status: row.status, completedAt: row.production_completed_at, totalPieceQty: Number(row.workload_piece_qty),
        participantCount: getProductionCreditParticipants(row).length, creditedPieceQty: getProductionCredit(row, user.id) };
    }));
    return NextResponse.json({ ok: true, profile: { id: actor.profileId, role: actor.role }, users: people || [], selectedPlanner: selected, summaries, completed });
  } catch (error) {
    return NextResponse.json({ error: (error as { message?: string })?.message || "summary_load_failed" }, { status: 500 });
  }
}
