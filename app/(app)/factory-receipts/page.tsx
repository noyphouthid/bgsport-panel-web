"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCheck, Factory, PackagePlus, ScanLine } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDateTime, normalizeQrCode, type QrLabelRow } from "@/lib/inventory-qr";
import { MobileQrScanner } from "../_components/mobile-qr-scanner";

type QueueItem = QrLabelRow;

type ReceiptRow = {
  id: string;
  received_at: string;
  received_by: string;
  note: string | null;
  created_at: string;
};

export default function FactoryReceiptsPage() {
  const [scannerInput, setScannerInput] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [receivedBy, setReceivedBy] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [recentReceipts, setRecentReceipts] = useState<ReceiptRow[]>([]);

  const loadCurrentUser = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id;
    if (!authUserId) return;

    const { data } = await supabase.from("users").select("full_name").eq("auth_user_id", authUserId).maybeSingle();
    if (data?.full_name) setReceivedBy(data.full_name);
  };

  const loadRecentReceipts = async () => {
    const { data, error } = await supabase
      .from("factory_receipts")
      .select("id,received_at,received_by,note,created_at")
      .order("received_at", { ascending: false })
      .limit(8);

    if (error) {
      toast.error(`ໂຫຼດລາຍການນຳເຂົ້າບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }
    setRecentReceipts((data ?? []) as ReceiptRow[]);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCurrentUser();
      void loadRecentReceipts();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const lookupLabel = async (rawValue: string) => {
    const qrCode = normalizeQrCode(rawValue);
    if (!qrCode) return;
    if (queue.some((item) => item.qr_code === qrCode)) {
      toast("QR ນີ້ຢູ່ໃນລາຍການນຳເຂົ້າແລ້ວ");
      setScannerInput("");
      return;
    }

    const { data, error } = await supabase
      .from("order_qr_labels")
      .select("id,order_id,qr_code,order_code,factory_bill_code,label_status,received_at,received_by,shipped_at,shipped_by,last_scanned_at,created_at,updated_at")
      .eq("qr_code", qrCode)
      .maybeSingle();

    if (error) {
      toast.error(`ກວດສອບ QR ບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }
    if (!data) {
      toast.error("ບໍ່ພົບ QR ນີ້");
      return;
    }

    const label = data as QrLabelRow;
    if (label.label_status === "shipped") {
      toast.error("ລາຍການນີ້ຖືກຈັດສົ່ງແລ້ວ");
      return;
    }

    setQueue((prev) => [...prev, label]);
    setScannerInput("");
    toast.success(`ເພີ່ມ ${label.order_code} ເຂົ້າລາຍການນຳເຂົ້າແລ້ວ`);
  };

  const submitImport = async () => {
    if (queue.length === 0) {
      toast.error("ກະລຸນາສະແກນ QR ຢ່າງໜ້ອຍ 1 ລາຍການກ່ອນ");
      return;
    }
    if (!receivedBy.trim()) {
      toast.error("ກະລຸນາປ້ອນຊື່ຜູ້ນຳເຂົ້າ");
      return;
    }

    setSaving(true);
    const isoReceivedAt = new Date(receivedAt).toISOString();
    const { data: receipt, error: receiptError } = await supabase
      .from("factory_receipts")
      .insert({
        received_at: isoReceivedAt,
        received_by: receivedBy.trim(),
        note: note.trim() || null,
      })
      .select("id")
      .single();

    if (receiptError || !receipt) {
      setSaving(false);
      toast.error(`ສ້າງຮອບນຳເຂົ້າບໍ່ສຳເລັດ: ${receiptError?.message || "ຂໍ້ຜິດພາດບໍ່ຮູ້ສາເຫດ"}`);
      return;
    }

    const itemPayload = queue.map((item) => ({
      receipt_id: receipt.id,
      qr_label_id: item.id,
      order_id: item.order_id,
      qr_code: item.qr_code,
    }));

    const { error: itemError } = await supabase.from("factory_receipt_items").insert(itemPayload);
    if (itemError) {
      setSaving(false);
      toast.error(`ບັນທຶກລາຍການນຳເຂົ້າບໍ່ສຳເລັດ: ${itemError.message}`);
      return;
    }

    const { error: labelError } = await supabase
      .from("order_qr_labels")
      .update({
        label_status: "received",
        received_at: isoReceivedAt,
        received_by: receivedBy.trim(),
        last_scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", queue.map((item) => item.id));

    setSaving(false);

    if (labelError) {
      toast.error(`ນຳເຂົ້າສຳເລັດ ແຕ່ອັບເດດສະຖານະ QR ບໍ່ສຳເລັດ: ${labelError.message}`);
      return;
    }

    setQueue([]);
    setNote("");
    setScannerInput("");
    await loadRecentReceipts();
    toast.success(`ນຳເຂົ້າ ${itemPayload.length} ລາຍການເຂົ້າຄັງຮ້ານສຳເລັດ`);
  };

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em]">
              <Factory size={14} />
              ຮັບສິນຄ້າເຂົ້າ
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">ຮັບສິນຄ້າຈາກໂຮງງານເຂົ້າຮ້ານ</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-emerald-50">
              ສະແກນ QR ໄດ້ຫຼາຍລາຍການ, ກວດສອບລາຍການນຳເຂົ້າ ແລ້ວ ນຳເຂົ້າເຂົ້າຄັງຮ້ານໃນຄັ້ງດຽວ.
            </p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-emerald-50">
            ອອກແບບສຳລັບໃຊ້ງານຜ່ານມືຖືເວລາໄປຮັບສິນຄ້າ
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <MobileQrScanner onDetected={(value) => void lookupLabel(value)} />

          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-black text-slate-900">
              <ScanLine size={20} />
              ສະແກນ ຫຼື ວາງຄ່າ QR
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={scannerInput}
                onChange={(e) => setScannerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void lookupLabel(scannerInput);
                }}
                placeholder="ວາງ ຫຼື ສະແກນຄ່າ QR"
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => void lookupLabel(scannerInput)}
                className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
              >
                ເພີ່ມເຂົ້າລາຍການ
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold text-slate-700">
                ວັນທີ/ເວລານຳເຂົ້າ
                <input
                  type="datetime-local"
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="text-sm font-bold text-slate-700">
                ຜູ້ນຳເຂົ້າ
                <input
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  placeholder="ຊື່ແອດມິນ ຫຼື ພະນັກງານ"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
            </div>

            <label className="mt-4 block text-sm font-bold text-slate-700">
              ໝາຍເຫດ
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="ໝາຍເຫດສຳລັບຮອບນຳເຂົ້ານີ້"
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-black text-slate-900">ລາຍການນຳເຂົ້າ</div>
              <div className="text-sm font-medium text-slate-500">ສະແກນຫຼາຍລາຍການ ແລ້ວ ນຳເຂົ້າໃນຄັ້ງດຽວ</div>
            </div>
            <button
              type="button"
              onClick={() => void submitImport()}
              disabled={saving || queue.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
            >
              <PackagePlus size={16} />
              {saving ? "ກຳລັງນຳເຂົ້າ..." : "ນຳເຂົ້າທັງໝົດ"}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {queue.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm font-medium text-slate-500">
                ຍັງບໍ່ມີລາຍການທີ່ສະແກນ.
              </div>
            ) : (
              queue.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-lg font-black text-slate-900">{item.order_code}</div>
                    <div className="text-sm font-medium text-slate-500">ລະຫັດບິນໂຮງງານ: {item.factory_bill_code?.trim() || "-"}</div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">ສະຖານະ QR: {item.label_status}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQueue((prev) => prev.filter((row) => row.id !== item.id))}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100"
                  >
                    ລຶບອອກ
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-black text-slate-900">
          <CheckCheck size={20} />
          ຮອບນຳເຂົ້າລ່າສຸດ
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {recentReceipts.map((receipt) => (
            <div key={receipt.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ນຳເຂົ້າແລ້ວ</div>
              <div className="mt-2 text-lg font-black text-slate-900">{formatDateTime(receipt.received_at)}</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">{receipt.received_by}</div>
              <div className="mt-3 text-sm font-medium text-slate-500">{receipt.note?.trim() || "ບໍ່ມີໝາຍເຫດ"}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
