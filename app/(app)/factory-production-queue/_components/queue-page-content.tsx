"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardList, Play, RefreshCw, Send } from "lucide-react";
import toast from "react-hot-toast";
import {
  FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS as labels,
  FACTORY_PRODUCTION_QUEUE_STATUS_STYLES as styles,
  getFactoryProductionQueueListHref, getProductionQueueDeposit, normalizeFactoryProductionQueueStatus, compareProductionQueuePriority,
  getProductionStageAssignments, getProductionParticipants, getProductionTaskWorker, getProductionActiveWorker, getProductionReadyWorker,
  type FactoryProductionQueueVisibleStatus, type ProductionQueueRow, type ProductionQueueUser,
} from "@/lib/factory-production-queue";
import { parseOrderCode } from "@/lib/order-code";
import { isProductionRole } from "@/lib/role-groups";
import { PlannerAssignmentButton } from "./planner-assignment-button";
import { ProductionQueueNav } from "./production-queue-nav";
import { callProductionQueueApi, formatProductionDate } from "./queue-client";
import { useProductionRefresh } from "./use-production-refresh";

const FactoryReview = dynamic(() => import("./factory-review"), { ssr: false });
type View = FactoryProductionQueueVisibleStatus | "records";
type Payload = { rows: ProductionQueueRow[]; users: ProductionQueueUser[]; profile: { id: string; role: string }; startedAt: string | null };
const actionLabels = { queued: "ເລີ່ມວາງຜະລິດ", in_production: "ວາງຜະລິດສຳເລັດແລ້ວ", awaiting_factory: "ກວດກ່ອນສົ່ງໂຮງງານ" };

export function FactoryProductionQueuePageContent({ statusView = "queued" }: { statusView?: View }) {
  const router = useRouter();
  const requestVersion = useRef(0);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [planner, setPlanner] = useState("");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("ALL");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ key: "", page: 1 });
  const [reviewId, setReviewId] = useState<string | null>(null);
  const isSuperadmin = payload?.profile.role === "superadmin";

  const load = useCallback(async (background = false) => {
    const version = ++requestVersion.current;
    if (!background) setLoading(true); setError("");
    try {
      // Automatic enrollment runs when the deposit is submitted; opening a page needs no global sync.
      const result = await callProductionQueueApi<Payload>("/api/factory-production/queue");
      if (version !== requestVersion.current) return;
      setPayload(result);
      if (result.profile.role === "superadmin") {
        try { setPlanner(localStorage.getItem(`production-planner:${result.profile.id}:queue`) || ""); } catch {}
      }
    } catch (err) {
      if (version === requestVersion.current) { setError(err instanceof Error ? err.message : "ໂຫຼດຄິວບໍ່ສຳເລັດ"); setPayload(null); }
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, [statusView]);
  useEffect(() => { void load(); return () => { requestVersion.current++; }; }, [load]);
  const refresh = useCallback(() => load(true), [load]);
  useProductionRefresh(refresh);

  const people = useMemo(() => (payload?.users || []).filter(user => user.is_active && isProductionRole(user.role)), [payload?.users]);
  const names = useMemo(() => new Map((payload?.users || []).map(user => [user.id, user.full_name])), [payload?.users]);
  const validPlanner = people.some(user => user.id === planner) || planner === "UNASSIGNED";
  const activePlanner = !isSuperadmin ? payload?.profile.id || "" : validPlanner ? planner : (people.find(user => user.role !== "superadmin") || people[0])?.id || "UNASSIGNED";
  const scoped = useMemo(() => (payload?.rows || []).filter(row => {
    const deposit = getProductionQueueDeposit(row);
    if (!deposit || deposit.production_queue_legacy || !deposit.production_queue_entered_at || !["submitted", "approved", "converted"].includes(deposit.status)) return false;
    if (!isSuperadmin) return getProductionParticipants(row).includes(payload?.profile.id || "");
    return activePlanner === "UNASSIGNED" ? !row.planner_user_id : getProductionParticipants(row).includes(activePlanner);
  }).sort(compareProductionQueuePriority), [activePlanner, isSuperadmin, payload, people, statusView]);
  const inProgress = new Set((payload?.rows || []).map(getProductionActiveWorker).filter(Boolean));
  const readyRows = [...(payload?.rows || [])].filter(row => {
    const d = getProductionQueueDeposit(row);
    return d && !d.production_queue_legacy && d.production_queue_entered_at && ["submitted","approved","converted"].includes(d.status) && getProductionReadyWorker(row);
  }).sort(compareProductionQueuePriority);
  const nextForWorker = (worker: string | null) => readyRows.find(row => getProductionReadyWorker(row) === worker)?.id;
  const periodRows = scoped.filter(row => {
    const d = getProductionQueueDeposit(row)!;
    return (year === "ALL" || row.queue_year === Number(year)) && (month === "ALL" || row.queue_month === Number(month)) &&
      [row.queue_number, row.order_no, d.order_code, d.deposit_no, d.customer_name, d.team_name].join(" ").toLowerCase().includes(search.trim().toLowerCase());
  });
  const filtered = periodRows.filter(row => statusView === "records" || normalizeFactoryProductionQueueStatus(row.status) === statusView);
  const filterKey = JSON.stringify([statusView, activePlanner, search, month, year]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(pagination.key === filterKey ? pagination.page : 1, pageCount);
  const visibleRows = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  const years = Array.from(new Set([new Date().getFullYear(), ...(payload?.rows || []).map(row => row.queue_year)])).sort((a, b) => b - a);

  const changeStatus = async (id: string, targetStatus: FactoryProductionQueueVisibleStatus) => {
    setWorkingId(id); setError("");
    try {
      await callProductionQueueApi("/api/factory-production/queue", { method: "PATCH", body: JSON.stringify({ action: "update_status", id, targetStatus }) });
      toast.success(labels[targetStatus]);
      setReviewId(null);
      router.push(getFactoryProductionQueueListHref(targetStatus));
      await load();
    } catch (err) { const message = err instanceof Error ? err.message : "ອັບເດດບໍ່ສຳເລັດ"; setError(message); toast.error(message); }
    finally { setWorkingId(null); }
  };
  const advanceTask = async (id: string, action: "complete_pattern" | "start_print") => {
    setWorkingId(id);
    try { await callProductionQueueApi("/api/factory-production/queue", { method: "PATCH", body: JSON.stringify({ action, id }) }); await load(); toast.success("ບັນທຶກໜ້າວຽກສຳເລັດ"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "ບັນທຶກບໍ່ສຳເລັດ"); } finally { setWorkingId(null); }
  };
  const heading = statusView === "records" ? "ລາຍການວາງຜະລິດ" : "ຄິວວາງຜະລິດ";

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-extrabold text-slate-900">{heading}</h1>
      <p className="mt-2 text-sm text-slate-500">{statusView === "records" ? "ລາຍການງານທຸກສະຖານະ ພ້ອມຂໍ້ມູນອໍເດີ້ ແລະ ປະຫວັດການລົງສະຖານະ." : "ເຮັດຕາມໃບສັ່ງຜະລິດທີ່ປິ້ນໄວ້ ແລະ ເລີ່ມເທື່ອລະອໍເດີ້. ງານດ່ວນຂຶ້ນກ່ອນ; ງານປະເພດດຽວກັນເຮັດຕາມເລກຄິວ."}</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />ໂຫຼດຄືນ</button>
    </header>
    <ProductionQueueNav active={statusView} />
    {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</p>}
    <section className="grid gap-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm md:grid-cols-4">
      <input aria-label="ຄົ້ນຫາຄິວ" placeholder="ຄົ້ນຫາເລກຄິວ / ອໍເດີ້ / ລູກຄ້າ" value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400" />
      <select aria-label="ຜູ້ວາງຜະລິດ" value={activePlanner} disabled={!isSuperadmin} onChange={e => { setPlanner(e.target.value); try { localStorage.setItem(`production-planner:${payload?.profile.id}:queue`, e.target.value); } catch {} }} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold disabled:bg-slate-50">
        {people.filter(user => isSuperadmin || user.id === payload?.profile.id).map(user => <option key={user.id} value={user.id}>{user.full_name}</option>)}
        {isSuperadmin && <option value="UNASSIGNED">ລໍຖ້າມອບໝາຍ</option>}
      </select>
      <select aria-label="ເດືອນ" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="ALL">ທຸກເດືອນ</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1)}>ເດືອນ {i + 1}</option>)}</select>
      <select aria-label="ປີ" value={year} onChange={e => setYear(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="ALL">ທຸກປີ</option>{years.map(y => <option key={y} value={String(y)}>ປີ {y}</option>)}</select>
    </section>
    <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 text-sm font-black text-slate-700">
        {statusView === "records" ? heading : "ລາຍການຄິວ"} ({filtered.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] min-[1800px]:min-w-[1450px] text-sm">
          <thead className="border-b border-slate-100 bg-white">
            <tr className="text-left text-xs uppercase text-slate-500">
              {["ວັນທີ", "ຄິວ", "ປະເພດ", "ເລກອໍເດີ້", "ຜູ້ວາງຜະລິດ", "ເບີໂທ", "ຮູບແບບວຽກ", "ຈຳນວນ", "ສະຖານະ"].map(title => (
                <th key={title} className={`whitespace-nowrap px-3 py-3 font-black ${title === "ປະເພດ" || title === "ເບີໂທ" ? "hidden min-[1800px]:table-cell" : ""}`}>{title}</th>
              ))}
              <th className="bg-white px-3 py-3 text-right font-black">ຈັດການ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-16 text-center font-bold text-slate-500">ກຳລັງໂຫຼດ...</td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={10} className="px-4 py-16 text-center font-bold text-slate-500">ບໍ່ມີລາຍການໃນຄິວທີ່ເລືອກ</td></tr>
            ) : visibleRows.map(row => {
              const d = getProductionQueueDeposit(row)!;
              const status = normalizeFactoryProductionQueueStatus(row.status);
              const worker = getProductionTaskWorker(row);
              const mayStart = row.id === nextForWorker(worker) && !inProgress.has(worker);
              const canAct = Boolean(worker && (isSuperadmin || worker === payload?.profile.id));
              const pendingPrint = Boolean(status === "in_production" && row.pattern_completed_at && !row.print_started_at);
              const isStarting = status === "queued" || pendingPrint;
              const taskLabel = status === "in_production" ? row.pattern_completed_at ? "ວາງພ້ອມພິມ" : "ວາງ Pattern" : "";
              const assigned = getProductionStageAssignments(row);
              const buttonLabel = status === "in_production" ? !row.pattern_completed_at ? "ວາງ Pattern ສຳເລັດແລ້ວ" : pendingPrint ? "ເລີ່ມວາງພ້ອມພິມ" : "ວາງພ້ອມພິມສຳເລັດແລ້ວ" : status === "sent_to_factory" ? "" : actionLabels[status];
              const urgent = d.production_priority === "urgent";
              const { orderType } = parseOrderCode(d.order_code || "");
              const typeStyle = /^(PK|MK)/.test(orderType) ? "border-violet-200 bg-violet-100 text-violet-800"
                : /^(PM|MM)/.test(orderType) ? "border-amber-200 bg-amber-100 text-amber-900"
                : "border-slate-200 bg-slate-100 text-slate-800";
              const ActionIcon = status === "queued" ? Play : status === "awaiting_factory" ? Send : Check;
              return (
                <tr key={row.id} className={`group align-top transition-colors hover:bg-slate-50/70 ${urgent ? "bg-rose-50/30" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-5 font-bold text-slate-700">{formatProductionDate(row.queue_date)}</td>
                  <td className="whitespace-nowrap px-3 py-5 font-black text-slate-900">#{row.queue_number}</td>
                  <td className="hidden px-3 py-5 min-[1800px]:table-cell"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${typeStyle}`}>{orderType || "-"}</span></td>
                  <td className="px-3 py-5">
                    <div className="font-black text-slate-900">{d.order_code?.trim() || d.deposit_no || row.order_no}</div>
                    <div className="mt-1 text-xs font-bold text-slate-500">{d.team_name || d.customer_name}</div>
                  </td>
                  <td className="px-3 py-5"><div className="min-w-28 font-black text-slate-900">{names.get(worker || assigned.patternUserId || "") || "ລໍຖ້າມອບໝາຍ"}</div></td>
                  <td className="hidden px-3 py-5 min-[1800px]:table-cell">
                    <div className="font-black tabular-nums text-slate-900">{d.customer_phone || "-"}</div>
                    <div className="mt-1 text-xs font-bold text-slate-500">{d.customer_name}</div>
                    {d.team_name && d.team_name !== d.customer_name && <div className="mt-1 text-xs font-bold text-sky-700">{d.team_name}</div>}
                  </td>
                  <td className="px-3 py-5">
                    <span className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-black ${urgent ? "border-rose-200 bg-rose-100 text-rose-700" : "border-sky-200 bg-sky-100 text-sky-700"}`}>{urgent ? "ງານດ່ວນ" : "ງານປົກກະຕິ"}</span>
                    <div className="mt-2 whitespace-nowrap text-xs font-bold text-slate-500">ສົ່ງ: {formatProductionDate(d.delivery_date)}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-5 font-black tabular-nums text-slate-900">{Number(row.workload_piece_qty).toLocaleString()} ຜືນ</td>
                  <td className="px-3 py-5">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${styles[status]}`}>{labels[status]}</span>
                    {taskLabel && <div className="mt-1 text-xs font-bold text-sky-700">{taskLabel}{pendingPrint ? " • ລໍຖ້າເລີ່ມ" : ""}</div>}
                    {statusView !== "records" && status === "queued" && !mayStart && <div className="mt-2 text-xs font-bold text-slate-400">{inProgress.has(worker) ? "ມີງານກຳລັງວາງຢູ່" : "ລໍຖ້າຄິວກ່ອນໜ້າ"}</div>}
                  </td>
                  <td className="bg-white px-3 py-5 transition-colors group-hover:bg-slate-50">
                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                      <Link prefetch={false} href={`/factory-production-queue/records/${row.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50">
                        <ClipboardList size={14} /> ເບິ່ງຂໍ້ມູນງານ
                      </Link>
                      {isSuperadmin && <PlannerAssignmentButton compact queueId={row.id} orderLabel={d.order_code || d.deposit_no} plannerUserId={row.planner_user_id} assignments={assigned} pieceQty={Number(row.workload_piece_qty)} users={payload?.users || []} onSaved={async next => {
                        const updated = { ...row, planner_user_id: next.patternUserId, pattern_user_id: next.patternUserId, print_user_id: next.printUserId, dispatch_user_id: next.dispatchUserId };
                        const recipient = getProductionTaskWorker(updated) || next.patternUserId;
                        if (recipient) {
                          setPlanner(recipient);
                          try { localStorage.setItem(`production-planner:${payload?.profile.id}:queue`, recipient); } catch {}
                        }
                        await load();
                      }} />}
                      {statusView !== "records" && status !== "sent_to_factory" && (
                        <button type="button" disabled={workingId !== null || !canAct || (isStarting && !mayStart)}
                          onClick={() => {
                            if (status === "awaiting_factory") setReviewId(row.id);
                            else if (status === "queued") void changeStatus(row.id, "in_production");
                            else if (!row.pattern_completed_at) void advanceTask(row.id, "complete_pattern");
                            else if (!row.print_started_at) void advanceTask(row.id, "start_print");
                            else void changeStatus(row.id, "awaiting_factory");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
                          {workingId === row.id ? <RefreshCw size={14} className="animate-spin" /> : <ActionIcon size={14} />}
                          {workingId === row.id ? "ກຳລັງບັນທຶກ..." : buttonLabel}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm">
        <span role="status" className="text-slate-500">ສະແດງ {filtered.length ? (currentPage - 1) * 20 + 1 : 0}–{Math.min(currentPage * 20, filtered.length)} ຈາກ {filtered.length} ລາຍການ</span>
        <div className="flex gap-2"><button type="button" disabled={currentPage === 1 || loading} onClick={() => setPagination({ key: filterKey, page: currentPage - 1 })} className="rounded-xl border px-3 py-2 font-bold disabled:opacity-40">ໜ້າກ່ອນໜ້າ</button>
          <button type="button" disabled={currentPage >= pageCount || loading} onClick={() => setPagination({ key: filterKey, page: currentPage + 1 })} className="rounded-xl border px-3 py-2 font-bold disabled:opacity-40">ໜ້າຖັດໄປ</button></div>
      </div>
    </section>
    {payload?.startedAt && <p className="text-xs text-slate-500">ເລີ່ມນັບ: {formatProductionDate(payload.startedAt)} • ບໍ່ນັບອໍເດີ້ທີ່ສົ່ງກ່ອນເປີດໃຊ້ລະບົບ.</p>}
    {reviewId && <FactoryReview queueId={reviewId} userNameMap={names} onClose={() => setReviewId(null)} onConfirm={() => changeStatus(reviewId, "sent_to_factory")} />}
  </div>;
}
