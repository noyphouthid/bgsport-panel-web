"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS as labels, FACTORY_PRODUCTION_QUEUE_STATUS_STYLES as styles,
  getFactoryProductionQueueListHref, getFactoryProductionQueuePreviousStatus, getFactoryProductionQueueStatusIndex,
  getProductionQueueDeposit, getProductionStageAssignments, getProductionCreditParticipants, getProductionCredit, formatProductionCredit, normalizeFactoryProductionQueueStatus, type ProductionQueueRow, type ProductionQueueUser,
} from "@/lib/factory-production-queue";
import { ProductionQueueNav } from "./production-queue-nav";
import { PlannerAssignmentButton } from "./planner-assignment-button";
import { callProductionQueueApi, formatProductionDate } from "./queue-client";

type Payload = { row: ProductionQueueRow; users: ProductionQueueUser[]; profile: { id: string; role: string } };

export function QueueRecordPage({ queueId }: { queueId: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setPayload(await callProductionQueueApi<Payload>(`/api/factory-production/queue/${queueId}?view=record`)); }
    catch (err) { setError(err instanceof Error ? err.message : "ໂຫຼດບໍ່ສຳເລັດ"); setPayload(null); }
    finally { setLoading(false); }
  }, [queueId]);
  useEffect(() => { void load(); }, [load]);
  const row = payload?.row;
  const deposit = row ? getProductionQueueDeposit(row) : null;
  const names = new Map((payload?.users || []).map(user => [user.id, user.full_name]));
  const name = (id?: string | null) => id ? names.get(id) || "-" : "-";
  const status = row ? normalizeFactoryProductionQueueStatus(row.status) : "queued";
  const index = row ? getFactoryProductionQueueStatusIndex(row.status) : 0;
  const assigned = row ? getProductionStageAssignments(row) : null;
  const previous = row ? getFactoryProductionQueuePreviousStatus(row.status) : null;
  const steps = row ? [
    { title: "ວາງ Pattern", time: row.pattern_completed_at, actor: row.pattern_completed_by_user_id, assigned: assigned?.patternUserId },
    { title: "ວາງພ້ອມພິມ", time: row.production_completed_at, actor: row.production_completed_by_user_id, assigned: assigned?.printUserId },
    { title: "ສົ່ງໂຮງງານ", time: row.sent_to_factory_at, actor: row.sent_to_factory_by_user_id, assigned: assigned?.dispatchUserId },
  ] : [];
  const revert = async () => {
    if (!row || !previous) return;
    setSaving(true);
    try {
      await callProductionQueueApi("/api/factory-production/queue", { method: "PATCH", body: JSON.stringify({ action: "update_status", id: row.id, targetStatus: previous }) });
      toast.success("ຍ້ອນສະຖານະສຳເລັດ"); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ອັບເດດບໍ່ສຳເລັດ"); }
    finally { setSaving(false); }
  };
  return <div className="space-y-5">
    <header><Link href="/factory-production-queue/records" className="text-sm font-bold text-sky-700">← ລາຍການວາງຜະລິດ</Link><h1 className="mt-3 text-3xl font-extrabold text-slate-900">ລາຍລະອຽດການວາງຜະລິດ</h1></header>
    <ProductionQueueNav active="records" />
    {error && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</p>}
    {loading ? <p role="status" className="rounded-2xl bg-white p-8 text-center text-slate-500">ກຳລັງໂຫຼດ...</p> : row && deposit && <>
      <section aria-labelledby="production-order-info" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="production-order-info" className="text-lg font-black text-slate-900">ຂໍ້ມູນອໍເດີ້</h2><p className="mt-2 text-xl font-black">{deposit.order_code || deposit.deposit_no}</p><p className="mt-1 text-sm text-slate-500">ຄິວ #{row.queue_number} • {deposit.team_name || deposit.customer_name}</p></div><span className={`rounded-full px-3 py-1 text-sm font-bold ${styles[status]}`}>{labels[status]}</span></div>
        <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[
          ["ລູກຄ້າ", deposit.customer_name], ["ເບີໂທ", deposit.customer_phone || "-"], ["ຜ້າ", deposit.fabric_name || "-"],
          ["ຈຳນວນລວມ", `${Number(row.workload_piece_qty).toLocaleString()} ຜືນ`], ["ຜູ້ວາງ Pattern", name(assigned?.patternUserId)], ["ຜູ້ວາງພ້ອມພິມ", name(assigned?.printUserId)], ["ຜູ້ສົ່ງໂຮງງານ", name(assigned?.dispatchUserId)],
          ["ຜູ້ມອບໝາຍ", name(row.assigned_by_user_id || deposit.admin_user_id)], ["Graphic", name(deposit.graphic_user_id)],
          ["ວັນເຂົ້າຄິວ", formatProductionDate(row.queue_date)], ["ວັນສົ່ງຜະລິດ", formatProductionDate(deposit.production_sent_date)],
          ["ກຳນົດສົ່ງລູກຄ້າ", formatProductionDate(deposit.delivery_date)], ["Factory Bill", deposit.factory_bill_code || "-"],
          ["ປະເພດງານ", deposit.production_priority === "urgent" ? "ງານດ່ວນ" : "ງານປົກກະຕິ"],
        ].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-words font-bold text-slate-900">{value}</dd></div>)}</dl>
        {(deposit.notes || deposit.warning_note || row.notes) && <div className="mt-5 space-y-2 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-800">{deposit.notes && <p>{deposit.notes}</p>}{deposit.warning_note && <p>{deposit.warning_note}</p>}{row.notes && <p>{row.notes}</p>}</div>}
        {payload?.profile.role === "superadmin" && <div className="mt-5"><PlannerAssignmentButton queueId={row.id} orderLabel={deposit.order_code || deposit.deposit_no} plannerUserId={row.planner_user_id} assignments={assigned || undefined} pieceQty={Number(row.workload_piece_qty)} users={payload.users} onSaved={load} /></div>}
        <p className="mt-4 rounded-xl bg-sky-50 p-4 text-sm font-bold text-sky-900">ຜູ້ຮ່ວມວາງ {getProductionCreditParticipants(row).length} ຄົນ • {payload?.profile.role === "superadmin" ? `ຄົນລະ ${formatProductionCredit(Number(row.workload_piece_qty) / Math.max(1,getProductionCreditParticipants(row).length))}` : `ສ່ວນຂອງທ່ານ ${formatProductionCredit(getProductionCredit(row,payload?.profile.id || ""))}`} ຜືນ • ບໍ່ນັບຜູ້ສົ່ງໂຮງງານໃນການຫານຍອດ</p>
      </section>
      <section aria-labelledby="production-status-info" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 id="production-status-info" className="text-lg font-black text-slate-900">ຂໍ້ມູນການລົງສະຖານະ</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">{steps.map(step => <div key={step.title} className="rounded-xl bg-slate-50 p-4 text-sm"><h3 className="font-black text-slate-700">{step.title}</h3><p className="mt-3">ຜູ້ຮັບຜິດຊອບ: <strong>{name(step.assigned)}</strong></p><p className="mt-2">ຜູ້ລົງສະຖານະ: <strong>{step.time ? name(step.actor) : "-"}</strong></p><p className="mt-2 text-slate-500">{formatProductionDate(step.time)}</p></div>)}</div>
        {row.planner_reassigned_at && <p className="mt-4 text-sm text-slate-500">ປ່ຽນຜູ້ຮັບຜິດຊອບໂດຍ {name(row.planner_reassigned_by_user_id)} • {formatProductionDate(row.planner_reassigned_at)}</p>}
      </section>
      <section aria-labelledby="production-workflow" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 id="production-workflow" className="text-lg font-black text-slate-900">ຂະບວນການ 3 ຂັ້ນຕອນ</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">{steps.map((step, stepIndex) => <li key={step.title} className={`rounded-xl border p-4 ${Boolean(step.time) ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><div className="text-sm font-black">{stepIndex + 1}. {step.title}</div><p className="mt-2 text-xs text-slate-500">{Boolean(step.time) ? "ດຳເນີນການແລ້ວ" : "ລໍຖ້າດຳເນີນການ"}</p></li>)}</ol>
        <div className="mt-5 flex flex-wrap gap-3"><Link href={getFactoryProductionQueueListHref(status)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white">ໄປໜ້າຄິວ{labels[status]}</Link>
          {payload?.profile.role === "superadmin" && previous && <button type="button" disabled={saving} onClick={() => void revert()} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-700 disabled:opacity-50">ຍ້ອນກັບ: {labels[previous]}</button>}
        </div>
      </section>
    </>}
  </div>;
}
