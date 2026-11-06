"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { agentOrderCommission, paidAgentShirts, type AgentSalesOrder, type AgentSalesSummary } from "@/lib/agent-sales";

type Report = { orders: AgentSalesOrder[]; summary: AgentSalesSummary; agents: { id: string; full_name: string; is_active: boolean }[] };
const number = (value: number) => value.toLocaleString("en-US");
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Vientiane", dateStyle: "short" }).format(new Date(value));

export function AgentSalesReport({ ownOnly = false }: { ownOnly?: boolean }) {
  const [period, setPeriod] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Vientiane", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7));
  const [agentId, setAgentId] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setReport(null); setPage(1);
    const [year, month] = period.split("-");
    void authenticatedFetch(`/api/agent-sales?year=${year}&month=${month}${!ownOnly && agentId ? `&agentId=${encodeURIComponent(agentId)}` : ""}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "ໂຫຼດລາຍງານບໍ່ສຳເລັດ");
        if (!controller.signal.aborted) setReport(data);
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, agentId, ownOnly]);
  const agents = new Map(report?.agents.map(agent => [agent.id, agent.full_name]));
  return (
    <section className="mb-6 w-full min-w-0 max-w-full rounded-2xl border border-emerald-200 bg-white p-5 text-slate-900 shadow-sm" aria-label="ຍອດຂາຍແລະຄ່າຄອມຕົວແທນ">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-full"><h2 className="break-words text-lg font-black">ຍອດຂາຍ ແລະ ຄ່າຄອມຕົວແທນ</h2><p className="mt-1 text-sm text-slate-500">2,500 ກີບ/ເສື້ອຂາຍ 1 ໂຕ · ບໍ່ລວມຂອງແຖມ ແລະ ໂສ້ງ · ນັບເດືອນທີ່ສ້າງອໍເດີ (ເວລາລາວ)</p></div>
        <div className="flex min-w-0 max-w-full flex-wrap gap-3"><label className="text-sm font-bold">ເດືອນ<input aria-label="ເດືອນລາຍງານ" type="month" min="2000-01" max="9998-12" value={period} onChange={e => { if (e.target.value) setPeriod(e.target.value); }} className="ml-2 max-w-full rounded-lg border border-slate-200 p-2" /></label>
          {!ownOnly && <label className="text-sm font-bold">ຕົວແທນ<select aria-label="ຕົວແທນ" className="ml-2 max-w-64 rounded-lg border border-slate-200 p-2" value={agentId} onChange={e => setAgentId(e.target.value)}><option value="">ທັງໝົດ</option>{report?.agents.map(agent => <option key={agent.id} value={agent.id}>{agent.full_name}{!agent.is_active ? " (ປິດໃຊ້ງານ)" : ""}</option>)}</select></label>}
        </div>
      </div>
      {loading && <p role="status" className="py-6 text-center text-slate-500">ກຳລັງໂຫຼດ...</p>}
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      {report && <>
        <div className="mb-4 grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-5">{[
          ["ອໍເດີ", report.summary.orders], ["ເສື້ອຂາຍ (ໂຕ)", report.summary.paidShirts], ["ເສື້ອແຖມ (ໂຕ)", report.summary.freeShirts], ["ຍອດຂາຍສຸດທິ (ກີບ)", report.summary.salesLak], ["ຄ່າຄອມ (ກີບ)", report.summary.commissionLak],
        ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-emerald-50 p-4"><p className="text-xs text-slate-600">{label}</p><p className="mt-2 break-words text-lg font-black text-emerald-800 sm:text-xl">{number(Number(value))}</p></div>)}</div>
        <p className="mb-3 text-xs text-slate-500">ຍອດຂາຍສຸດທິລວມສິນຄ້າອື່ນໃນອໍເດີ. ຄ່າຄອມຄິດສະເພາະເສື້ອຂາຍ. ລາຍງານອັບເດດຕາມຈຳນວນໃນອໍເດີປັດຈຸບັນ.</p>
        <div className="min-w-0 max-w-full overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr>{["ອໍເດີ", "ວັນທີສ້າງ", ...(!ownOnly ? ["ຕົວແທນ"] : []), "ເສື້ອຂາຍ", "ແຖມ", "ຍອດຂາຍ", "ຄ່າຄອມ (ກີບ)"].map(label => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody>
          {report.orders.slice((page - 1) * 20, page * 20).map(order => <tr key={order.id} className="border-t border-slate-100"><td className="px-3 py-3"><Link className="font-bold text-blue-700" href={`/orders/${order.id}/edit`}>{order.order_code}</Link></td><td className="px-3 py-3">{date(order.created_at)}</td>{!ownOnly && <td className="px-3 py-3">{agents.get(order.agent_user_id) || "-"}</td>}<td className="px-3 py-3">{number(paidAgentShirts(order))}</td><td className="px-3 py-3">{number(order.free_qty)}</td><td className="px-3 py-3">{number(order.net_total)}</td><td className="px-3 py-3 font-bold text-emerald-700">{number(agentOrderCommission(order))}</td></tr>)}
          {!report.orders.length && <tr><td colSpan={ownOnly ? 6 : 7} className="p-8 text-center text-slate-500">ບໍ່ມີອໍເດີໃນເດືອນນີ້</td></tr>}
        </tbody></table></div>
        {report.orders.length > 20 && <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={page === 1} onClick={() => setPage(p => p - 1)}>ກ່ອນໜ້າ</button><span>{page} / {Math.ceil(report.orders.length / 20)}</span><button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={page * 20 >= report.orders.length} onClick={() => setPage(p => p + 1)}>ຖັດໄປ</button></div>}
      </>}
    </section>
  );
}
