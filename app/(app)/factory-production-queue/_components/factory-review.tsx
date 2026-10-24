"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { SendToFactoryPreviewModal } from "./send-to-factory-preview-modal";
import { callProductionQueueApi } from "./queue-client";

type ReviewRow = ComponentProps<typeof SendToFactoryPreviewModal>["row"];
export default function FactoryReview({ queueId, userNameMap, onClose, onConfirm }: {
  queueId: string; userNameMap: Map<string, string>; onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const [row, setRow] = useState<ReviewRow | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    let current = true;
    void callProductionQueueApi<{ row: ReviewRow }>(`/api/factory-production/queue/${queueId}`).then(payload => {
      if (current) setRow(payload.row);
    }).catch(err => { if (current) setError(err instanceof Error ? err.message : "ໂຫຼດໃບງານບໍ່ສຳເລັດ"); });
    return () => { current = false; };
  }, [queueId]);
  if (!row) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="ກວດກ່ອນສົ່ງໂຮງງານ">
    <div className="rounded-2xl bg-white p-6"><p role="status">{error || "ກຳລັງໂຫຼດໃບງານເພື່ອກວດກ່ອນສົ່ງ..."}</p><button type="button" onClick={onClose} className="mt-4 rounded-xl border px-4 py-2">ປິດ</button></div>
  </div>;
  return <SendToFactoryPreviewModal row={row} userNameMap={userNameMap} confirming={confirming} onClose={() => { if (!confirming) onClose(); }} onConfirm={async () => {
    setConfirming(true);
    try { await onConfirm(); } finally { setConfirming(false); }
  }} />;
}
