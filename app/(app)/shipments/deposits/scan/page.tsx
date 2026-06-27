"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCheck, ScanLine, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { MobileQrScanner } from "../../../_components/mobile-qr-scanner";
import type { ShipmentDeliveryRequestRow } from "@/lib/shipment-delivery-requests";
import {
  buildTransportNoteQrCode,
  getTransportNoteDisplayNo,
  isTransportNoteDeposited,
  isTransportNotePrinted,
  parseTransportNoteQrInput,
  type TransportNoteRow,
} from "@/lib/transport-notes";

type OrderRow = {
  id: string;
  order_code: string;
  factory_bill_code: string | null;
  shipment_status: "pending" | "shipped";
  shipment_completed_at: string | null;
};

type QueueItem = TransportNoteRow & {
  order_code: string;
  factory_bill_code: string | null;
  request_status: ShipmentDeliveryRequestRow["status"];
  delivery_person_name: string;
};

function toLocalDateTimeInputValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function ShipmentDepositScanPage() {
  const [scannerInput, setScannerInput] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [confirmedAt, setConfirmedAt] = useState(() => toLocalDateTimeInputValue());
  const [confirmedBy, setConfirmedBy] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadCurrentUser = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id;
    if (!authUserId) return;

    const { data } = await supabase.from("users").select("full_name").eq("auth_user_id", authUserId).maybeSingle();
    if (data?.full_name) setConfirmedBy(data.full_name);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCurrentUser();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const resolveTransportNote = async (rawValue: string) => {
    const parsed = parseTransportNoteQrInput(rawValue);
    if (!parsed.normalized) return null;

    let noteQuery = supabase.from("transport_notes").select("*").limit(1);
    if (parsed.kind === "transport_note_qr" && parsed.noteId) {
      noteQuery = noteQuery.eq("id", parsed.noteId);
    } else if (parsed.noteNo) {
      noteQuery = noteQuery.eq("note_no", parsed.noteNo);
    } else {
      return null;
    }

    const { data: noteRows, error: noteError } = await noteQuery;
    if (noteError) throw new Error(noteError.message);

    const transportNote = (((noteRows ?? [])[0] as TransportNoteRow | undefined) || null);
    if (!transportNote) return null;
    if (!transportNote.order_id || !transportNote.delivery_request_id) {
      throw new Error("ໃບນີ້ບໍ່ແມ່ນໃບຝາກຂອງ flow shipments");
    }
    if (!isTransportNotePrinted(transportNote)) {
      throw new Error("ໃບນີ້ຍັງບໍ່ຖືກຢືນຢັນການພິມ");
    }
    if (isTransportNoteDeposited(transportNote)) {
      throw new Error("ໃບນີ້ຖືກຢືນຢັນຝາກຂົນສົ່ງແລ້ວ");
    }

    const [{ data: requestData, error: requestError }, { data: orderData, error: orderError }] = await Promise.all([
      supabase.from("shipment_delivery_requests").select("*").eq("id", transportNote.delivery_request_id).maybeSingle(),
      supabase
        .from("orders")
        .select("id,order_code,factory_bill_code,shipment_status,shipment_completed_at")
        .eq("id", transportNote.order_id)
        .maybeSingle(),
    ]);

    if (requestError) throw new Error(requestError.message);
    if (orderError) throw new Error(orderError.message);

    const request = (requestData as ShipmentDeliveryRequestRow | null) ?? null;
    const order = (orderData as OrderRow | null) ?? null;

    if (!request) throw new Error("ບໍ່ພົບຄຳຂໍຈັດສົ່ງຂອງໃບນີ້");
    if (!order) throw new Error("ບໍ່ພົບຂໍ້ມູນອໍເດີ");
    if (request.delivery_method !== "transport") {
      throw new Error("ໃບນີ້ບໍ່ແມ່ນການຝາກຂົນສົ່ງ");
    }
    if (request.status === "delivered" || request.status === "cancelled") {
      throw new Error("ຄຳຂໍນີ້ຖືກປິດໄປແລ້ວ");
    }
    if (request.status === "rejected") {
      throw new Error("ຄຳຂໍນີ້ຖືກປະຕິເສດຢູ່, ກະລຸນາແກ້ໄຂກ່ອນ");
    }
    if (order.shipment_status === "shipped" || order.shipment_completed_at) {
      throw new Error("ອໍເດີນີ້ຖືກຈັດສົ່ງສຳເລັດແລ້ວ");
    }

    return { transportNote, order, request };
  };

  const lookupTransportNote = async (rawValue: string) => {
    const input = rawValue.trim();
    if (!input) return;

    try {
      const resolved = await resolveTransportNote(input);
      if (!resolved) {
        toast.error("ບໍ່ພົບໃບຝາກທີ່ກົງກັນ");
        return;
      }

      if (queue.some((item) => item.id === resolved.transportNote.id || item.delivery_request_id === resolved.transportNote.delivery_request_id)) {
        toast("ໃບນີ້ຢູ່ໃນລາຍການແລ້ວ");
        setScannerInput("");
        return;
      }

      setQueue((prev) => [
        ...prev,
        {
          ...resolved.transportNote,
          order_code: resolved.order.order_code,
          factory_bill_code: resolved.order.factory_bill_code || null,
          request_status: resolved.request.status,
          delivery_person_name: resolved.request.delivery_person_name,
        },
      ]);
      setConfirmedAt(toLocalDateTimeInputValue());
      setScannerInput("");
      toast.success(`ເພີ່ມ ${resolved.order.order_code} ເຂົ້າລາຍການຝາກແລ້ວ`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ກວດສອບໃບຝາກບໍ່ສຳເລັດ");
    }
  };

  const submitDepositReceipt = async () => {
    if (queue.length === 0) {
      toast.error("ກະລຸນາສະແກນ QR ຢ່າງໜ້ອຍ 1 ລາຍການກ່ອນ");
      return;
    }
    if (!confirmedBy.trim()) {
      toast.error("ກະລຸນາປ້ອນຊື່ຜູ້ຢືນຢັນການຝາກ");
      return;
    }

    setSaving(true);
    try {
      const confirmedAtIso = new Date(confirmedAt).toISOString();

      const { data: latestNotes, error: latestNotesError } = await supabase
        .from("transport_notes")
        .select("*")
        .in("id", queue.map((item) => item.id));

      if (latestNotesError) throw latestNotesError;

      const blockedNote = ((latestNotes ?? []) as TransportNoteRow[]).find(
        (row) => !isTransportNotePrinted(row) || isTransportNoteDeposited(row)
      );
      if (blockedNote) {
        throw new Error("ມີບາງໃບບໍ່ພ້ອມສຳລັບການຢືນຢັນຝາກ");
      }

      const { data: receipt, error: receiptError } = await supabase
        .from("transport_deposit_receipts")
        .insert({
          confirmed_at: confirmedAtIso,
          confirmed_by: confirmedBy.trim(),
          note: note.trim() || null,
        })
        .select("id")
        .single();
      if (receiptError || !receipt) throw receiptError || new Error("ບໍ່ສາມາດສ້າງບັນທຶກຝາກໄດ້");

      const itemPayload = queue.map((item) => ({
        receipt_id: receipt.id,
        transport_note_id: item.id,
        delivery_request_id: item.delivery_request_id as string,
        order_id: item.order_id as string,
        qr_code: buildTransportNoteQrCode(item),
      }));

      const { error: itemError } = await supabase.from("transport_deposit_receipt_items").insert(itemPayload);
      if (itemError) throw itemError;

      const { error: noteUpdateError } = await supabase
        .from("transport_notes")
        .update({
          transport_deposited_at: confirmedAtIso,
          transport_deposited_by: confirmedBy.trim(),
          transport_deposit_receipt_id: receipt.id,
          updated_at: new Date().toISOString(),
        })
        .in("id", queue.map((item) => item.id));
      if (noteUpdateError) throw noteUpdateError;

      const { error: requestUpdateError } = await supabase
        .from("shipment_delivery_requests")
        .update({
          status: "submitted",
          approved_at: null,
          approved_by_user_id: null,
          delivered_at: null,
          delivered_by_user_id: null,
          rejected_at: null,
          rejected_by_user_id: null,
          rejection_note: null,
          updated_at: new Date().toISOString(),
        })
        .in(
          "id",
          queue.map((item) => String(item.delivery_request_id))
        );
      if (requestUpdateError) throw requestUpdateError;

      setQueue([]);
      setNote("");
      setScannerInput("");
      setConfirmedAt(toLocalDateTimeInputValue());
      toast.success(`ຢືນຢັນຝາກຂົນສົ່ງ ${itemPayload.length} ລາຍການສຳເລັດ`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ບັນທຶກການຝາກບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em]">
              <Truck size={14} />
              ສະແກນຢືນຢັນຝາກ
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">ສະແກນຢືນຢັນການຝາກເຄື່ອງກັບຂົນສົ່ງ</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium text-emerald-50">
              ເປີດກ້ອງຄ້າງໄວ້ ແລະ ສະແກນ QR ຈາກໃບຝາກໄດ້ຕໍ່ເນື່ອງຫຼາຍບິນ. ສະແກນໃຫ້ຄົບທຸກໃບ ແລ້ວຄ່ອຍກົດຢຸດສະແກນ ແລະ ຢືນຢັນການຝາກ.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/shipments/deposits" className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20">
              ລາຍການຝາກສຳເລັດ
            </Link>
            <Link href="/shipments/notes" className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20">
              ລາຍການໃບຝາກ
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <MobileQrScanner
            onDetected={(value) => lookupTransportNote(value)}
            continuous
            collapseOnDetect={false}
            dedupeMs={2200}
          />

          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-black text-slate-900">
              <ScanLine size={20} />
              ສະແກນ QR ໃບຝາກ
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={scannerInput}
                onChange={(e) => setScannerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void lookupTransportNote(scannerInput);
                }}
                placeholder="ວາງ QR ຫຼື ລະຫັດໃບຝາກ"
                className="min-w-0 w-full flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => void lookupTransportNote(scannerInput)}
                className="w-full rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 sm:w-auto"
              >
                ເພີ່ມເຂົ້າລາຍການ
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-black text-slate-900">ລາຍການລໍຖ້າຢືນຢັນຝາກ</div>
              <div className="mt-1 text-sm font-medium text-slate-500">{queue.length} ລາຍການ</div>
            </div>
            {queue.length > 0 ? (
              <button
                type="button"
                onClick={() => setQueue([])}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50"
              >
                ລ້າງທັງໝົດ
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-bold text-slate-700">ວັນທີຢືນຢັນຝາກ</span>
              <input
                type="datetime-local"
                value={confirmedAt}
                onChange={(e) => setConfirmedAt(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-bold text-slate-700">ຜູ້ຢືນຢັນຝາກ</span>
              <input
                value={confirmedBy}
                onChange={(e) => setConfirmedBy(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
          </div>

          <label className="mt-3 block space-y-1">
            <span className="text-sm font-bold text-slate-700">ໝາຍເຫດ</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="ບັນທຶກເພີ່ມເຕີມ..."
            />
          </label>

          <div className="mt-4 space-y-3">
            {queue.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm font-medium text-slate-500">
                ສະແກນ QR ຈາກໃບຝາກເພື່ອເພີ່ມມາທີ່ນີ້
              </div>
            ) : (
              queue.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-lg font-black text-slate-900">{item.order_code}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        ໃບຝາກ: {getTransportNoteDisplayNo(item, item.order_code)} • ບິນໂຮງງານ: {item.factory_bill_code?.trim() || "-"}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-700">
                        {item.receiver_name} • {item.receiver_phone}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{item.transporters.join(", ") || "-"}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQueue((prev) => prev.filter((row) => row.id !== item.id))}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100"
                    >
                      ລຶບອອກ
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={() => void submitDepositReceipt()}
            disabled={saving || queue.length === 0}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCheck size={18} />
            {saving ? "ກຳລັງບັນທຶກ..." : "ຢືນຢັນການຝາກເຄື່ອງ"}
          </button>
        </div>
      </section>
    </div>
  );
}
