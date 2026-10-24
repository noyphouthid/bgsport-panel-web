"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pencil, X } from "lucide-react";
import toast from "react-hot-toast";
import { isProductionRole } from "@/lib/role-groups";
import { formatProductionCredit, type ProductionStageAssignments } from "@/lib/factory-production-queue";
import { callProductionQueueApi } from "./queue-client";

type Planner = { id: string; full_name: string; role: string; is_active?: boolean };
type Props = { queueId: string; orderLabel: string; plannerUserId: string | null; assignments?: ProductionStageAssignments; pieceQty?: number;
  users: Planner[]; onSaved: (assignments: ProductionStageAssignments) => void | Promise<void>; compact?: boolean };
const fields = [
  { key: "patternUserId", label: "ຜູ້ວາງ Pattern" }, { key: "printUserId", label: "ຜູ້ວາງພ້ອມພິມ" }, { key: "dispatchUserId", label: "ຜູ້ສົ່ງໂຮງງານ" },
] as const;

function AssignmentDialog({ queueId, orderLabel, plannerUserId, assignments, pieceQty, users, onSaved, onClose }: Props & { onClose: () => void }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const eligibleUsers = users.filter(user => user.is_active && isProductionRole(user.role));
  const initial = assignments || { patternUserId: plannerUserId, printUserId: plannerUserId, dispatchUserId: plannerUserId };
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const participants = [...new Set([draft.patternUserId, draft.printUserId].filter((id): id is string => Boolean(id)))];
  const changed = fields.some(field => draft[field.key] !== initial[field.key]);
  const valid = fields.every(field => eligibleUsers.some(user => user.id === draft[field.key]));
  useEffect(() => { const dialog = dialogRef.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  const save = async () => {
    setSaving(true); setError("");
    try {
      await callProductionQueueApi("/api/factory-production/queue", { method: "PATCH", body: JSON.stringify({ action: "assign_stages", id: queueId, assignments: draft, expectedAssignments: initial }) });
    } catch (err) { setError(err instanceof Error ? err.message : "ບັນທຶກບໍ່ສຳເລັດ"); setSaving(false); return; }
    toast.success("ບັນທຶກຜູ້ຮັບຜິດຊອບທັງ 3 ໜ້າວຽກແລ້ວ"); onClose(); await onSaved(draft);
  };
  return <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-xl overflow-x-hidden overflow-y-auto whitespace-normal rounded-3xl border border-slate-200 bg-white p-5 text-left text-slate-900 shadow-xl backdrop:bg-slate-900/40 sm:p-6">
    <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h2 id={titleId} className="break-words text-lg font-black">ແກ້ໄຂຜູ້ຮັບຜິດຊອບ</h2><p className="mt-1 break-words text-sm font-bold text-slate-500">{orderLabel}</p></div>
      <button type="button" aria-label="ປິດ" disabled={saving} onClick={onClose} className="shrink-0 rounded-lg p-1 text-slate-500 disabled:opacity-50"><X size={20} /></button></div>
    <form className="mt-5 min-w-0 space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      {fields.map((field,index) => <label key={field.key} className="block min-w-0 text-sm font-black"><span className="block break-words">{field.label}</span>
        <select autoFocus={index === 0} value={valid || eligibleUsers.some(user => user.id === draft[field.key]) ? draft[field.key] || "" : ""}
          onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value || null }))} disabled={saving || !eligibleUsers.length}
          className="mt-2 block w-full min-w-0 max-w-full truncate rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-sky-400">
          <option value="" disabled>ເລືອກພະນັກງານທີ່ເປີດໃຊ້ງານ</option>{eligibleUsers.map(user => <option key={user.id} value={user.id}>{user.full_name}</option>)}
        </select></label>)}
      <div className="rounded-xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900"><p className="font-black">ຜູ້ຮ່ວມວາງ {participants.length} ຄົນ • ແຕ່ລະໄອດີນັບຄັ້ງດຽວ</p>
        {pieceQty !== undefined && participants.length > 0 && <p className="mt-1">{formatProductionCredit(pieceQty)} ຜືນ ÷ {participants.length} = {formatProductionCredit(pieceQty / participants.length)} ຜືນ/ຄົນ</p>}
        <p className="mt-2 text-xs leading-5">ນັບສະເພາະຜູ້ວາງ Pattern ແລະ ຜູ້ວາງພ້ອມພິມ: ຄົນດຽວໄດ້ 100%, ສອງຄົນໄດ້ຄົນລະ 50%. ຜູ້ສົ່ງໂຮງງານບໍ່ນັບໃນການຫານຍອດ.</p></div>
      {error && <p role="alert" className="break-words rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black disabled:opacity-50">ຍົກເລີກ</button>
        <button type="submit" disabled={saving || !valid || !changed} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກ"}</button></div>
    </form>
  </dialog>;
}
export function PlannerAssignmentButton({ compact = false, ...props }: Props) {
  const [open,setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)} aria-label="ແກ້ໄຂຜູ້ຮັບຜິດຊອບ" className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 font-black text-sky-700 transition hover:bg-sky-100 ${compact ? "text-xs" : "text-sm"}`}><Pencil size={14} />{compact ? "ແກ້ໄຂ" : "ແກ້ໄຂຜູ້ຮັບຜິດຊອບ"}</button>
    {open && <AssignmentDialog {...props} onClose={() => setOpen(false)} />}</>;
}
