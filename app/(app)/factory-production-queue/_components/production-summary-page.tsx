"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getProductionCompletionPeriod, formatProductionCredit, FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS as labels, type FactoryProductionQueueVisibleStatus, type ProductionQueueUser } from "@/lib/factory-production-queue";
import { callProductionQueueApi, formatProductionDate } from "./queue-client";
import { ProductionQueueNav } from "./production-queue-nav";
import { useProductionRefresh } from "./use-production-refresh";

type Summary = { userId: string; fullName: string; completedOrderCount: number; completedPieceQty: number; awaitingCount: number; sentCount: number };
type Completed = { id: string; userId: string; fullName: string; queueNumber: string; orderCode: string; customerName: string; status: FactoryProductionQueueVisibleStatus; completedAt: string | null; totalPieceQty: number; participantCount: number; creditedPieceQty: number };
type Payload = { profile: { id: string; role: string }; users: ProductionQueueUser[]; selectedPlanner: string; summaries: Summary[]; completed: Completed[] };

export function ProductionSummaryPage({ completedOnly = false, initialPlanner = "", initialYear = "", initialMonth = "" }: { completedOnly?: boolean; initialPlanner?: string; initialYear?: string; initialMonth?: string }) {
  const currentPeriod = getProductionCompletionPeriod(new Date().toISOString())!;
  const [payload,setPayload] = useState<Payload | null>(null);
  const [planner,setPlanner] = useState(initialPlanner);
  const [year,setYear] = useState(initialYear || String(currentPeriod.year));
  const [month,setMonth] = useState(initialMonth || String(currentPeriod.month));
  const [search,setSearch] = useState("");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [page,setPage] = useState(1);
  const requestVersion = useRef(0);
  const load = useCallback(async (background = false) => {
    const version=++requestVersion.current; if(!background) setLoading(true); setError("");
    try {
      const params=new URLSearchParams({year,month}); if(planner) params.set("planner",planner);
      const data=await callProductionQueueApi<Payload>(`/api/factory-production/queue/summary?${params}`);
      if(version===requestVersion.current) {setPayload(data);if(!background)setPage(1);}
    } catch(err) {if(version===requestVersion.current){setPayload(null);setError(err instanceof Error?err.message:"ໂຫຼດບໍ່ສຳເລັດ");}}
    finally {if(version===requestVersion.current)setLoading(false);}
  },[planner,year,month]);
  useEffect(()=>{void load();return()=>{requestVersion.current++;};},[load]);
  const refresh = useCallback(() => load(true), [load]);
  useProductionRefresh(refresh);
  const isSuperadmin=payload?.profile.role==="superadmin";
  const completed=(payload?.completed||[]).filter(row=>[row.orderCode,row.customerName,row.fullName,row.queueNumber].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const pageCount=Math.max(1,Math.ceil(completed.length/20)), activePage=Math.min(page,pageCount);
  const visible=completed.slice((activePage-1)*20,activePage*20);
  const completedLink=(userId:string)=>{const params=new URLSearchParams({year,month});if(userId)params.set("planner",userId);return `/factory-production-queue/activity/completed?${params}`;};
  const totalCredit=(payload?.summaries||[]).reduce((sum,row)=>sum+row.completedPieceQty,0);
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-extrabold text-slate-900">{completedOnly?"ລາຍການວາງຜະລິດສຳເລັດ":"ສະຫຼຸບການວາງຜະລິດ"}</h1><p className="mt-2 text-sm text-slate-500">ນັບຍອດຕາມເດືອນທີ່ວາງພ້ອມພິມສຳເລັດຈິງ (ເວລາລາວ). ແບ່ງຍອດສະເພາະຜູ້ວາງ Pattern ແລະ ຜູ້ວາງພ້ອມພິມ.</p></div>
      <button type="button" onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black disabled:opacity-50"><RefreshCw size={16} className={loading?"animate-spin":""}/>ໂຫຼດຄືນ</button></header>
    <ProductionQueueNav active="activity"/>
    <div className="flex flex-wrap gap-2"><Link href={completedLink(payload?.selectedPlanner||planner||"").replace("/activity/completed?", "/activity?")} className={`rounded-xl border px-4 py-2 text-sm font-bold ${!completedOnly?"border-sky-200 bg-sky-50 text-sky-700":"border-slate-200 bg-white"}`}>ຍອດສະຫຼຸບ</Link><Link href={completedLink(payload?.selectedPlanner||planner||"")} className={`rounded-xl border px-4 py-2 text-sm font-bold ${completedOnly?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-slate-200 bg-white"}`}>ລາຍການວາງສຳເລັດ</Link></div>
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</p>}
    <section className="grid gap-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm md:grid-cols-4">
      <select aria-label="ຜູ້ວາງຜະລິດ" value={payload?.selectedPlanner||planner} disabled={!isSuperadmin} onChange={e=>setPlanner(e.target.value)} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold disabled:bg-slate-50">{isSuperadmin&&<option value="ALL">ທຸກຜູ້ວາງຜະລິດ</option>}{(payload?.users||[]).map(user=><option key={user.id} value={user.id}>{user.full_name}</option>)}</select>
      <select aria-label="ເດືອນ" value={month} onChange={e=>setMonth(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"><option value="ALL">ທຸກເດືອນ</option>{Array.from({length:12},(_,i)=><option key={i} value={String(i+1)}>ເດືອນ {i+1}</option>)}</select>
      <select aria-label="ປີ" value={year} onChange={e=>setYear(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"><option value="ALL">ທຸກປີ</option>{Array.from(new Set([Number(year)||currentPeriod.year,currentPeriod.year,currentPeriod.year-1,currentPeriod.year-2])).sort((a,b)=>b-a).map(y=><option key={y} value={String(y)}>ປີ {y}</option>)}</select>
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-sm font-black text-emerald-800">ຍອດວາງສຳເລັດ: {formatProductionCredit(totalCredit)} ຜືນ</div>
    </section>
    {!completedOnly&&<section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm"><div className="border-b border-slate-100 bg-slate-50 px-5 py-4 font-black text-slate-700">ສະຫຼຸບຜົນງານ</div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="text-left text-xs text-slate-500">{["ຜູ້ວາງຜະລິດ","ອໍເດີ້ວາງສຳເລັດ","ລໍຖ້າສົ່ງໂຮງງານ","ສົ່ງແລ້ວ","ຍອດຜືນຂອງຕົນ","ຈັດການ"].map(label=><th key={label} className="px-4 py-3 font-black">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{loading?<tr><td colSpan={6} className="p-10 text-center">ກຳລັງໂຫຼດ...</td></tr>:(payload?.summaries||[]).map(row=><tr key={row.userId}><td className="p-4 font-black">{row.fullName}</td><td className="p-4 font-bold">{row.completedOrderCount}</td><td className="p-4">{row.awaitingCount}</td><td className="p-4">{row.sentCount}</td><td className="p-4 text-lg font-black text-emerald-700">{formatProductionCredit(row.completedPieceQty)} ຜືນ</td><td className="p-4"><Link href={completedLink(row.userId)} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700">ເບິ່ງອໍເດີ້ສຳເລັດ</Link></td></tr>)}</tbody></table></div></section>}
    {completedOnly&&<section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 p-4"><p className="font-black text-slate-700">ລາຍການສຳເລັດ ({completed.length})</p><input aria-label="ຄົ້ນຫາງານສຳເລັດ" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="ຄົ້ນຫາອໍເດີ້ / ທີມ" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"/></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="text-left text-xs text-slate-500">{["ຄິວ / ອໍເດີ້","ຜູ້ວາງ","ວັນສຳເລັດ","ຈຳນວນອໍເດີ້","ຜູ້ຮ່ວມວາງ","ຍອດທີ່ໄດ້","ສະຖານະ"].map(label=><th key={label} className="px-4 py-3 font-black">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{loading?<tr><td colSpan={7} className="p-10 text-center">ກຳລັງໂຫຼດ...</td></tr>:visible.length?visible.map(row=><tr key={`${row.id}:${row.userId}`}><td className="p-4"><Link href={`/factory-production-queue/records/${row.id}`} className="font-black text-sky-700">{row.orderCode}</Link><p className="mt-1 text-xs text-slate-500">#{row.queueNumber} • {row.customerName}</p></td><td className="p-4 font-bold">{row.fullName}</td><td className="p-4">{formatProductionDate(row.completedAt)}</td><td className="p-4 font-bold">{formatProductionCredit(row.totalPieceQty)} ຜືນ</td><td className="p-4">{row.participantCount} ຄົນ</td><td className="p-4 font-black text-emerald-700">{formatProductionCredit(row.creditedPieceQty)} ຜືນ <span className="text-xs text-slate-500">(1/{row.participantCount})</span></td><td className="p-4 text-xs font-bold">{labels[row.status]}</td></tr>):<tr><td colSpan={7} className="p-10 text-center text-slate-500">ຍັງບໍ່ມີງານວາງສຳເລັດ</td></tr>}</tbody></table></div><div className="flex justify-end gap-2 border-t border-slate-100 p-4"><button type="button" disabled={activePage<=1} onClick={()=>setPage(activePage-1)} className="rounded-xl border px-3 py-2 text-sm disabled:opacity-40">ໜ້າກ່ອນໜ້າ</button><button type="button" disabled={activePage>=pageCount} onClick={()=>setPage(activePage+1)} className="rounded-xl border px-3 py-2 text-sm disabled:opacity-40">ໜ້າຖັດໄປ</button></div></section>}
  </div>;
}
