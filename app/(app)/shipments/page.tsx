"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Banknote, PackageCheck, ScanLine, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDateOnly, formatDateTime, getTotalUnits, normalizeQrCode, type OrderSummary, type QrLabelRow } from "@/lib/inventory-qr";
import { MobileQrScanner } from "../_components/mobile-qr-scanner";

type PaymentMethod = "cash" | "transfer";

type ShipmentInfo = {
  label: QrLabelRow;
  order: OrderSummary;
  existingShipmentAt: string | null;
  existingShipmentBy: string | null;
};

type ShipmentRow = {
  id: string;
  shipped_at: string;
  shipped_by: string;
  collected_amount: number;
  payment_method: PaymentMethod | null;
};

export default function ShipmentsPage() {
  const [scanValue, setScanValue] = useState("");
  const [shippedBy, setShippedBy] = useState("");
  const [shippedAt, setShippedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("transfer");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [note, setNote] = useState("");
  const [active, setActive] = useState<ShipmentInfo | null>(null);
  const [recentShipments, setRecentShipments] = useState<ShipmentRow[]>([]);
  const [saving, setSaving] = useState(false);

  const loadCurrentUser = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id;
    if (!authUserId) return;

    const { data } = await supabase.from("users").select("full_name").eq("auth_user_id", authUserId).maybeSingle();
    if (data?.full_name) setShippedBy(data.full_name);
  };

  const loadRecentShipments = async () => {
    const { data, error } = await supabase
      .from("shipment_records")
      .select("id,shipped_at,shipped_by,collected_amount,payment_method")
      .order("shipped_at", { ascending: false })
      .limit(8);

    if (error) {
      toast.error(`ໂຫຼດລາຍການຈັດສົ່ງບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }
    setRecentShipments((data ?? []) as ShipmentRow[]);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCurrentUser();
      void loadRecentShipments();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const openShipmentByCode = async (rawValue: string) => {
    const qrCode = normalizeQrCode(rawValue);
    if (!qrCode) return;

    const { data: labelData, error: labelError } = await supabase
      .from("order_qr_labels")
      .select("id,order_id,qr_code,order_code,factory_bill_code,label_status,received_at,received_by,shipped_at,shipped_by,last_scanned_at,created_at,updated_at")
      .eq("qr_code", qrCode)
      .maybeSingle();

    if (labelError) {
      toast.error(`ກວດສອບ QR ບໍ່ສຳເລັດ: ${labelError.message}`);
      return;
    }
    if (!labelData) {
      toast.error("ບໍ່ພົບ QR ນີ້");
      return;
    }

    const label = labelData as QrLabelRow;
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id,order_code,factory_bill_code,order_date,production_completed_at,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl,net_total,initial_deposit,balance,factory_cost,customer_paid_full_at,factory_paid_full_at,status")
      .eq("id", label.order_id)
      .single();
    const { data: existingShipmentData, error: existingShipmentError } = await supabase
      .from("shipment_records")
      .select("shipped_at,shipped_by")
      .eq("order_id", label.order_id)
      .order("shipped_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderError || !orderData) {
      toast.error(`ໂຫຼດລາຍລະອຽດອໍເດີບໍ່ສຳເລັດ: ${orderError?.message || "ຂໍ້ຜິດພາດບໍ່ຮູ້ສາເຫດ"}`);
      return;
    }
    if (existingShipmentError) {
      toast.error(`ກວດສອບປະຫວັດຈັດສົ່ງບໍ່ສຳເລັດ: ${existingShipmentError.message}`);
      return;
    }

    setActive({
      label,
      order: orderData as OrderSummary,
      existingShipmentAt: existingShipmentData?.shipped_at || label.shipped_at || null,
      existingShipmentBy: existingShipmentData?.shipped_by || label.shipped_by || null,
    });
    setScanValue("");
    setPaymentAmount(0);
    setNote("");
    if (existingShipmentData?.shipped_at || label.label_status === "shipped") {
      toast.error(`ອໍເດີ ${label.order_code} ເຄີຍຈັດສົ່ງສຳເລັດແລ້ວ ບໍ່ສາມາດສົ່ງຊ້ຳໄດ້`);
      return;
    }
    toast.success(`ໂຫຼດ ${label.order_code} ສຳເລັດ`);
  };

  const customerOutstanding = useMemo(() => Math.max(0, Number(active?.order.balance || 0)), [active]);
  const hasOutstandingBalance = customerOutstanding > 0;
  const shipmentLocked = Boolean(active?.existingShipmentAt || active?.label.label_status === "shipped");

  const submitShipment = async () => {
    if (!active) {
      toast.error("ກະລຸນາສະແກນ QR ກ່ອນ");
      return;
    }
    if (shipmentLocked) {
      toast.error("ອໍເດີນີ້ເຄີຍຈັດສົ່ງສຳເລັດແລ້ວ ບໍ່ສາມາດຈັດສົ່ງຊ້ຳໄດ້");
      return;
    }
    if (!shippedBy.trim()) {
      toast.error("ກະລຸນາປ້ອນຊື່ຜູ້ຈັດສົ່ງ");
      return;
    }
    if (paymentAmount < 0) {
      toast.error("ຈຳນວນເງິນຕ້ອງບໍ່ຕິດລົບ");
      return;
    }
    if (paymentAmount > customerOutstanding) {
      toast.error("ຈຳນວນເງິນເກີນຍອດຄ້າງຊຳລະ");
      return;
    }

    setSaving(true);
    const shippedAtIso = new Date(shippedAt).toISOString();
    const paymentAtIso = hasOutstandingBalance ? new Date(paymentDate).toISOString() : null;
    const nextBalance = Math.max(0, customerOutstanding - paymentAmount);
    const { data: duplicateShipment, error: duplicateShipmentError } = await supabase
      .from("shipment_records")
      .select("id,shipped_at")
      .eq("order_id", active.order.id)
      .order("shipped_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (duplicateShipmentError) {
      setSaving(false);
      toast.error(`ກວດສອບການຈັດສົ່ງຊ້ຳບໍ່ສຳເລັດ: ${duplicateShipmentError.message}`);
      return;
    }
    if (duplicateShipment) {
      setSaving(false);
      setActive((prev) =>
        prev
          ? {
              ...prev,
              existingShipmentAt: duplicateShipment.shipped_at,
              existingShipmentBy: prev.existingShipmentBy || null,
            }
          : prev
      );
      toast.error(`ອໍເດີ ${active.order.order_code} ເຄີຍຈັດສົ່ງສຳເລັດແລ້ວ ບໍ່ສາມາດສົ່ງຊ້ຳໄດ້`);
      return;
    }

    if (paymentAmount > 0 && paymentAtIso) {
      const { error: paymentTxnError } = await supabase.from("payment_transactions").insert({
        order_id: active.order.id,
        amount: paymentAmount,
        paid_at: paymentAtIso,
        note: `ຮັບເງິນຕອນຈັດສົ່ງຜ່ານ ${paymentMethod} ໂດຍ ${shippedBy.trim()}${note.trim() ? ` - ${note.trim()}` : ""}`,
      });

      if (paymentTxnError) {
        setSaving(false);
        toast.error(`ບັນທຶກການຊຳລະບໍ່ສຳເລັດ: ${paymentTxnError.message}`);
        return;
      }
    }

    const orderUpdatePayload = {
      balance: nextBalance,
      customer_paid_full_at: nextBalance === 0 ? paymentAtIso || active.order.customer_paid_full_at : active.order.customer_paid_full_at,
      production_completed_at: active.order.production_completed_at || shippedAtIso,
    };

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update(orderUpdatePayload)
      .eq("id", active.order.id);

    if (orderUpdateError) {
      setSaving(false);
      toast.error(`ອັບເດດອໍເດີຫຼັງຈັດສົ່ງບໍ່ສຳເລັດ: ${orderUpdateError.message}`);
      return;
    }

    const { data: shipment, error: shipmentError } = await supabase
      .from("shipment_records")
      .insert({
        qr_label_id: active.label.id,
        order_id: active.order.id,
        shipped_at: shippedAtIso,
        shipped_by: shippedBy.trim(),
        note: note.trim() || null,
        collected_amount: paymentAmount,
        payment_method: paymentAmount > 0 ? paymentMethod : null,
      })
      .select("id")
      .single();

    if (shipmentError || !shipment) {
      setSaving(false);
      toast.error(`ບັນທຶກການຈັດສົ່ງບໍ່ສຳເລັດ: ${shipmentError?.message || "ຂໍ້ຜິດພາດບໍ່ຮູ້ສາເຫດ"}`);
      return;
    }

    if (paymentAmount > 0 && paymentAtIso) {
      const { error: shipmentPaymentError } = await supabase.from("shipment_payments").insert({
        shipment_id: shipment.id,
        order_id: active.order.id,
        amount: paymentAmount,
        payment_method: paymentMethod,
        paid_at: paymentAtIso,
        note: note.trim() || null,
      });

      if (shipmentPaymentError) {
        setSaving(false);
        toast.error(`ບັນທຶກການຈັດສົ່ງແລ້ວ ແຕ່ບັນທຶກ payment log ບໍ່ສຳເລັດ: ${shipmentPaymentError.message}`);
        return;
      }
    }

    const { error: labelUpdateError } = await supabase
      .from("order_qr_labels")
      .update({
        label_status: "shipped",
        shipped_at: shippedAtIso,
        shipped_by: shippedBy.trim(),
        last_scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.label.id);

    setSaving(false);

    if (labelUpdateError) {
      toast.error(`ບັນທຶກການຈັດສົ່ງແລ້ວ ແຕ່ອັບເດດສະຖານະ QR ບໍ່ສຳເລັດ: ${labelUpdateError.message}`);
      return;
    }

    setActive((prev) =>
      prev
        ? {
            label: {
              ...prev.label,
              label_status: "shipped",
              shipped_at: shippedAtIso,
              shipped_by: shippedBy.trim(),
            },
            order: {
              ...prev.order,
              balance: nextBalance,
              production_completed_at: prev.order.production_completed_at || shippedAtIso,
              customer_paid_full_at: nextBalance === 0 && paymentAtIso ? paymentAtIso : prev.order.customer_paid_full_at,
            },
            existingShipmentAt: shippedAtIso,
            existingShipmentBy: shippedBy.trim(),
          }
        : prev
    );
    await loadRecentShipments();
    toast.success(`ຈັດສົ່ງ ${active.order.order_code} ສຳເລັດ`);
  };

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-[2rem] bg-gradient-to-br from-orange-950 via-orange-900 to-amber-900 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em]">
              <Truck size={14} />
              ຈັດສົ່ງສິນຄ້າ
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">ສະແກນ QR ແລະ ບັນທຶກການຈັດສົ່ງ</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-orange-50">
              ໃຊ້ QR ເດີມຫຼັງຈາກນຳເຂົ້າຮ້ານແລ້ວ, ສະແດງລາຍລະອຽດອໍເດີແບບໃບບິນ ແລະ ຮັບຊຳລະຍອດຄົງເຫຼືອກ່ອນຈັດສົ່ງ.
            </p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-orange-50">
            ອອກແບບສຳລັບໃຊ້ງານຜ່ານມືຖືໃນຕອນສົ່ງມອບ
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <MobileQrScanner onDetected={(value) => void openShipmentByCode(value)} />

          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-black text-slate-900">
              <ScanLine size={20} />
              ສະແກນ ຫຼື ວາງຄ່າ QR
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void openShipmentByCode(scanValue);
                }}
                placeholder="ວາງ ຫຼື ສະແກນຄ່າ QR"
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="button"
                onClick={() => void openShipmentByCode(scanValue)}
                className="rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-orange-700"
              >
                ເປີດອໍເດີ
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          {active ? (
            <>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{active.label.label_status}</div>
                  <div className="mt-2 text-3xl font-black tracking-tight text-slate-900">{active.order.order_code}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">ລະຫັດບິນໂຮງງານ: {active.order.factory_bill_code?.trim() || "-"}</div>
                </div>
                <div className="rounded-3xl border border-amber-100 bg-amber-50 px-4 py-3 text-right">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">ຍອດຄ້າງຊຳລະ</div>
                  <div className="mt-1 text-2xl font-black text-amber-900">{formatCurrency(active.order.balance)}</div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ວັນທີອໍເດີ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{formatDateOnly(active.order.order_date)}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ຜະລິດສຳເລັດ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{formatDateTime(active.order.production_completed_at)}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ຈຳນວນ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{getTotalUnits(active.order)}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ຊຳລະໂຮງງານ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{active.order.factory_paid_full_at ? "ຊຳລະແລ້ວ" : "ຍັງຄ້າງ"}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ຍອດສຸດທິ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{formatCurrency(active.order.net_total)}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ເງິນມັດຈຳທີ່ຮັບແລ້ວ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{formatCurrency(active.order.initial_deposit)}</div>
                </div>
              </div>

                <div className="mt-5 rounded-[2rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-lg font-black text-slate-900">
                    <Banknote size={18} />
                    {hasOutstandingBalance ? "ຮັບຊຳລະຍອດຄົງເຫຼືອ ແລະ ຈັດສົ່ງ" : "ພ້ອມຈັດສົ່ງ"}
                  </div>

                  {shipmentLocked ? (
                    <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                      ອໍເດີ {active.order.order_code} ເຄີຍຈັດສົ່ງສຳເລັດແລ້ວ
                      {active.existingShipmentAt ? ` ໃນວັນທີ ${formatDateTime(active.existingShipmentAt)}` : ""}{" "}
                      ຈຶ່ງບໍ່ສາມາດສົ່ງຊ້ຳໄດ້ ເພື່ອປ້ອງກັນກຳໄລເພີ້ຍນ.
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-bold text-slate-700">
                    ວັນທີ/ເວລາຈັດສົ່ງ
                    <input
                      type="datetime-local"
                      value={shippedAt}
                      onChange={(e) => setShippedAt(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </label>
                  <label className="text-sm font-bold text-slate-700">
                    ຜູ້ຈັດສົ່ງ
                    <input
                      value={shippedBy}
                      onChange={(e) => setShippedBy(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </label>
                  </div>

                  {hasOutstandingBalance ? (
                    <>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-bold text-slate-700">
                          ຈຳນວນເງິນທີ່ຮັບຕອນນີ້
                          <input
                            type="number"
                            min={0}
                            max={customerOutstanding}
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(Number(e.target.value))}
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </label>
                        <label className="text-sm font-bold text-slate-700">
                          ຮູບແບບການຊຳລະ
                          <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                          >
                            <option value="transfer">ໂອນເງິນ</option>
                            <option value="cash">ເງິນສົດ</option>
                          </select>
                        </label>
                      </div>

                      <label className="mt-4 block text-sm font-bold text-slate-700">
                        ວັນທີ/ເວລາຊຳລະ
                        <input
                          type="datetime-local"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </label>
                    </>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                      ອໍເດີນີ້ບໍ່ມີຍອດຄ້າງຊຳລະແລ້ວ ສາມາດກົດຈັດສົ່ງໄດ້ເລີຍ.
                    </div>
                  )}

                  <label className="mt-4 block text-sm font-bold text-slate-700">
                    ໝາຍເຫດ
                    <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="ເລກອ້າງອີງການໂອນ, ໝາຍເຫດການຈັດສົ່ງ, ຫຼື ຂໍ້ສັງເກດ"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void submitShipment()}
                  disabled={saving || shipmentLocked}
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                >
                  <PackageCheck size={18} />
                  {saving ? "ກຳລັງບັນທຶກ..." : shipmentLocked ? "ອໍເດີນີ້ສົ່ງແລ້ວ" : "ຢືນຢັນການຈັດສົ່ງ"}
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-16 text-center text-sm font-medium text-slate-500">
              ສະແກນ QR ເພື່ອເປີດລາຍລະອຽດອໍເດີແບບໃບບິນ.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-black text-slate-900">
          <Truck size={20} />
          ລາຍການຈັດສົ່ງລ່າສຸດ
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {recentShipments.map((shipment) => (
            <div key={shipment.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ຈັດສົ່ງແລ້ວ</div>
              <div className="mt-2 text-lg font-black text-slate-900">{formatDateTime(shipment.shipped_at)}</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">{shipment.shipped_by}</div>
              <div className="mt-3 text-sm font-black text-slate-900">{formatCurrency(shipment.collected_amount)}</div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{shipment.payment_method === "cash" ? "ເງິນສົດ" : shipment.payment_method === "transfer" ? "ໂອນເງິນ" : "ບໍ່ມີການຮັບເງິນ"}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
