"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Banknote, PackageCheck, RotateCcw, ScanLine, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import {
  buildOrderQrCode,
  formatCurrency,
  formatDateOnly,
  formatDateTime,
  getTotalUnits,
  ORDER_QR_LABEL_SELECT,
  ORDER_QR_ORDER_SELECT,
  parseQrInput,
  type OrderSummary,
  type QrLabelRow,
} from "@/lib/inventory-qr";
import { MobileQrScanner } from "../_components/mobile-qr-scanner";

type PaymentMethod = "cash" | "transfer";

type ShipmentInfo = {
  label: QrLabelRow;
  order: OrderSummary;
  existingShipmentId: string | null;
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
  const [cancelReason, setCancelReason] = useState("");
  const [active, setActive] = useState<ShipmentInfo | null>(null);
  const [recentShipments, setRecentShipments] = useState<ShipmentRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);

  const safeInsertAction = async (orderId: string, action: string, detail: string) => {
    const { error } = await supabase.from("order_status_history").insert({
      order_id: orderId,
      action,
      detail,
      action_at: new Date().toISOString(),
    });
    if (error && !error.message.includes("Could not find the table")) {
      toast.error(`ບັນທຶກປະຫວັດບໍ່ສຳເລັດ: ${error.message}`);
    }
  };

  const loadCurrentUser = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id;
    if (!authUserId) return;

    const { data } = await supabase.from("users").select("full_name,role").eq("auth_user_id", authUserId).maybeSingle();
    if (data?.full_name) setShippedBy(data.full_name);
    if (data?.role) setViewerRole(data.role as AppRole);
  };

  const loadRecentShipments = async () => {
    const { data, error } = await supabase
      .from("shipment_records")
      .select("id,shipped_at,shipped_by,collected_amount,payment_method")
      .order("shipped_at", { ascending: false })
      .limit(8);

    if (error) {
      toast.error(`ໂຫຼດປະຫວັດຈັດສົ່ງບໍ່ສຳເລັດ: ${error.message}`);
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

  const findOrderAndLabel = async (rawValue: string) => {
    const parsed = parseQrInput(rawValue);
    if (!parsed.normalized) return null;

    let existingLabel: QrLabelRow | null = null;
    let order: OrderSummary | null = null;

    if (parsed.kind === "shop_qr") {
      const { data, error } = await supabase
        .from("order_qr_labels")
        .select(ORDER_QR_LABEL_SELECT)
        .eq("qr_code", parsed.normalized)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      existingLabel = data as QrLabelRow;

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(ORDER_QR_ORDER_SELECT)
        .eq("id", existingLabel.order_id)
        .maybeSingle();
      if (orderError) throw new Error(orderError.message);
      order = (orderData as OrderSummary | null) || null;
    } else {
      let orderQuery = supabase.from("orders").select(ORDER_QR_ORDER_SELECT).limit(1);
      if ((parsed.kind === "factory_qr" || parsed.kind === "factory_bill_code") && parsed.factoryBillCode) {
        orderQuery = orderQuery.eq("factory_bill_code", parsed.factoryBillCode);
      } else {
        orderQuery = orderQuery.eq("order_code", parsed.normalized);
      }

      const { data: orders, error: orderError } = await orderQuery;
      if (orderError) throw new Error(orderError.message);
      order = (((orders ?? [])[0] as OrderSummary | undefined) || null);
      if (!order) return null;

      const { data: labelData, error: labelError } = await supabase
        .from("order_qr_labels")
        .select(ORDER_QR_LABEL_SELECT)
        .eq("order_id", order.id)
        .maybeSingle();
      if (labelError) throw new Error(labelError.message);
      existingLabel = (labelData as QrLabelRow | null) || null;
    }

    if (!order) return null;

    if (!existingLabel) {
      if (!order.factory_bill_code?.trim()) {
        throw new Error(`ອໍເດີ ${order.order_code} ຍັງບໍ່ມີລະຫັດບິນໂຮງງານ`);
      }

      const qrCode = buildOrderQrCode(order);
      const { data, error } = await supabase
        .from("order_qr_labels")
        .upsert(
          {
            order_id: order.id,
            qr_code: qrCode,
            order_code: order.order_code,
            factory_bill_code: order.factory_bill_code.trim(),
            label_status: "created",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "order_id" }
        )
        .select(ORDER_QR_LABEL_SELECT)
        .single();

      if (error) throw new Error(error.message);
      existingLabel = data as QrLabelRow;
    }

    return { order, label: existingLabel };
  };

  const openShipmentByCode = async (rawValue: string) => {
    try {
      const resolved = await findOrderAndLabel(rawValue);
      if (!resolved) {
        toast.error("ບໍ່ພົບອໍເດີທີ່ກົງກັນ");
        return;
      }

      const { data: existingShipmentData, error: existingShipmentError } = await supabase
        .from("shipment_records")
        .select("id,shipped_at,shipped_by")
        .eq("order_id", resolved.order.id)
        .order("shipped_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingShipmentError) {
        toast.error(`ກວດສອບປະຫວັດຈັດສົ່ງບໍ່ສຳເລັດ: ${existingShipmentError.message}`);
        return;
      }

      setActive({
        label: resolved.label,
        order: resolved.order,
        existingShipmentId: existingShipmentData?.id || null,
        existingShipmentAt: existingShipmentData?.shipped_at || resolved.label.shipped_at || null,
        existingShipmentBy: existingShipmentData?.shipped_by || resolved.label.shipped_by || null,
      });
      setScanValue("");
      setPaymentAmount(0);
      setNote("");
      setCancelReason("");

      if (existingShipmentData?.shipped_at || resolved.label.label_status === "shipped") {
        toast.error(`ອໍເດີ ${resolved.order.order_code} ຖືກຈັດສົ່ງແລ້ວ`);
        return;
      }

      toast.success(`ໂຫຼດ ${resolved.order.order_code} ສຳເລັດ`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ກວດສອບຂໍ້ມູນບໍ່ສຳເລັດ");
    }
  };

  const customerOutstanding = useMemo(() => Math.max(0, Number(active?.order.balance || 0)), [active]);
  const hasOutstandingBalance = customerOutstanding > 0;
  const shipmentLocked = Boolean(active?.existingShipmentAt || active?.label.label_status === "shipped");
  const canCancelShipment = viewerRole === "superadmin" || viewerRole === "accountant";

  const submitShipment = async () => {
    if (!active) {
      toast.error("ກະລຸນາສະແກນ QR ກ່ອນ");
      return;
    }
    if (shipmentLocked) {
      toast.error("ອໍເດີນີ້ຖືກຈັດສົ່ງແລ້ວ");
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
              existingShipmentId: duplicateShipment.id,
              existingShipmentAt: duplicateShipment.shipped_at,
            }
          : prev
      );
      toast.error(`ອໍເດີ ${active.order.order_code} ຖືກຈັດສົ່ງແລ້ວ`);
      return;
    }

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update({
        balance: nextBalance,
        customer_paid_full_at: nextBalance === 0 ? paymentAtIso || active.order.customer_paid_full_at : active.order.customer_paid_full_at,
        production_completed_at: active.order.production_completed_at || shippedAtIso,
        shipment_status: "shipped",
        shipment_completed_at: shippedAtIso,
      })
      .eq("id", active.order.id);

    if (orderUpdateError) {
      setSaving(false);
      toast.error(`ອັບເດດຂໍ້ມູນອໍເດີບໍ່ສຳເລັດ: ${orderUpdateError.message}`);
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
      toast.error(`ບັນທຶກການຈັດສົ່ງບໍ່ສຳເລັດ: ${shipmentError?.message || "ບໍ່ຮູ້ສາເຫດ"}`);
      return;
    }

    if (paymentAmount > 0 && paymentAtIso) {
      const { error: paymentTxnError } = await supabase.from("payment_transactions").insert({
        order_id: active.order.id,
        shipment_id: shipment.id,
        amount: paymentAmount,
        paid_at: paymentAtIso,
        note: `ຮັບເງິນຕອນຈັດສົ່ງ #SHIPMENT:${shipment.id} ຜ່ານ ${paymentMethod} ໂດຍ ${shippedBy.trim()}${note.trim() ? ` - ${note.trim()}` : ""}`,
      });

      if (paymentTxnError) {
        setSaving(false);
        toast.error(`ບັນທຶກຈັດສົ່ງແລ້ວ ແຕ່ບັນທຶກການຊຳລະບໍ່ສຳເລັດ: ${paymentTxnError.message}`);
        return;
      }

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
        toast.error(`ບັນທຶກຈັດສົ່ງແລ້ວ ແຕ່ບັນທຶກ payment log ບໍ່ສຳເລັດ: ${shipmentPaymentError.message}`);
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
      toast.error(`ບັນທຶກຈັດສົ່ງແລ້ວ ແຕ່ອັບເດດສະຖານະ QR ບໍ່ສຳເລັດ: ${labelUpdateError.message}`);
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
              shipment_status: "shipped",
              shipment_completed_at: shippedAtIso,
              customer_paid_full_at: nextBalance === 0 && paymentAtIso ? paymentAtIso : prev.order.customer_paid_full_at,
            },
            existingShipmentId: shipment.id,
            existingShipmentAt: shippedAtIso,
            existingShipmentBy: shippedBy.trim(),
          }
        : prev
    );
    await loadRecentShipments();
    toast.success(`ຈັດສົ່ງ ${active.order.order_code} ສຳເລັດ`);
  };

  const cancelShipment = async () => {
    if (!canCancelShipment) {
      toast.error("ສິດນີ້ສຳລັບ accountant ຫຼື superadmin ເທົ່ານັ້ນ");
      return;
    }
    if (!cancelReason.trim()) {
      toast.error("ກະລຸນາລະບຸເຫດຜົນການຍົກເລີກກ່ອນ");
      return;
    }
    if (!active?.existingShipmentId) {
      toast.error("ບໍ່ພົບລາຍການຈັດສົ່ງທີ່ຈະຍົກເລີກ");
      return;
    }

    const ok = confirm(`ຢືນຢັນຍົກເລີກຈັດສົ່ງ ${active.order.order_code}?`);
    if (!ok) return;

    const { data: latestShipment, error: latestShipmentError } = await supabase
      .from("shipment_records")
      .select("id,shipped_at")
      .eq("order_id", active.order.id)
      .order("shipped_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestShipmentError) {
      toast.error(`ກວດສອບລາຍການຈັດສົ່ງລ່າສຸດບໍ່ສຳເລັດ: ${latestShipmentError.message}`);
      return;
    }

    if (!latestShipment || latestShipment.id !== active.existingShipmentId) {
      toast.error("ສາມາດຍົກເລີກໄດ້ສະເພາະລາຍການຈັດສົ່ງລ່າສຸດເທົ່ານັ້ນ");
      return;
    }

    setSaving(true);

    const { data: shipmentPayments, error: shipmentPaymentsError } = await supabase
      .from("shipment_payments")
      .select("id,amount")
      .eq("shipment_id", active.existingShipmentId);

    if (shipmentPaymentsError) {
      setSaving(false);
      toast.error(`ໂຫຼດລາຍການຮັບເງິນຕອນຈັດສົ່ງບໍ່ສຳເລັດ: ${shipmentPaymentsError.message}`);
      return;
    }

    const rollbackAmount = ((shipmentPayments ?? []) as Array<{ amount: number }>).reduce(
      (sum, row) => sum + (Number(row.amount) || 0),
      0
    );
    const nextBalance = Math.max(0, Number(active.order.balance || 0) + rollbackAmount);
    const revertedLabelStatus = active.label.received_at ? "received" : "created";

    const confirmedDetail = confirm(
      [
        `ກຳລັງຍົກເລີກ ${active.order.order_code}`,
        `ວັນທີຈັດສົ່ງ: ${formatDateTime(active.existingShipmentAt)}`,
        `ຜູ້ຈັດສົ່ງ: ${active.existingShipmentBy || "-"}`,
        `ຈະຍ້ອນການຮັບເງິນຈາກ shipment ຈຳນວນ ${formatCurrency(rollbackAmount)}`,
        `ເຫດຜົນ: ${cancelReason.trim()}`,
      ].join("\n")
    );
    if (!confirmedDetail) {
      setSaving(false);
      return;
    }

    const { error: deleteShipmentPaymentsError } = await supabase
      .from("shipment_payments")
      .delete()
      .eq("shipment_id", active.existingShipmentId);

    if (deleteShipmentPaymentsError) {
      setSaving(false);
      toast.error(`ລຶບບັນທຶກການຮັບເງິນຕອນຈັດສົ່ງບໍ່ສຳເລັດ: ${deleteShipmentPaymentsError.message}`);
      return;
    }

    const { error: deletePaymentTransactionsError } = await supabase
      .from("payment_transactions")
      .delete()
      .eq("shipment_id", active.existingShipmentId);

    if (deletePaymentTransactionsError) {
      setSaving(false);
      toast.error(`ລຶບ payment log ຂອງການຈັດສົ່ງບໍ່ສຳເລັດ: ${deletePaymentTransactionsError.message}`);
      return;
    }

    const { error: deleteShipmentError } = await supabase
      .from("shipment_records")
      .delete()
      .eq("id", active.existingShipmentId);

    if (deleteShipmentError) {
      setSaving(false);
      toast.error(`ລຶບປະຫວັດຈັດສົ່ງບໍ່ສຳເລັດ: ${deleteShipmentError.message}`);
      return;
    }

    const { error: updateLabelError } = await supabase
      .from("order_qr_labels")
      .update({
        label_status: revertedLabelStatus,
        shipped_at: null,
        shipped_by: null,
        last_scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.label.id);

    if (updateLabelError) {
      setSaving(false);
      toast.error(`ຍ້ອນສະຖານະ QR ບໍ່ສຳເລັດ: ${updateLabelError.message}`);
      return;
    }

    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({
        balance: nextBalance,
        customer_paid_full_at: nextBalance === 0 ? active.order.customer_paid_full_at : null,
        shipment_status: "pending",
        shipment_completed_at: null,
      })
      .eq("id", active.order.id);

    setSaving(false);

    if (updateOrderError) {
      toast.error(`ຍ້ອນສະຖານະອໍເດີບໍ່ສຳເລັດ: ${updateOrderError.message}`);
      return;
    }

    setActive((prev) =>
      prev
        ? {
            ...prev,
            label: {
              ...prev.label,
              label_status: revertedLabelStatus,
              shipped_at: null,
              shipped_by: null,
            },
            order: {
              ...prev.order,
              balance: nextBalance,
              shipment_status: "pending",
              shipment_completed_at: null,
              customer_paid_full_at: nextBalance === 0 ? prev.order.customer_paid_full_at : null,
            },
            existingShipmentId: null,
            existingShipmentAt: null,
            existingShipmentBy: null,
          }
        : prev
    );

    await safeInsertAction(
      active.order.id,
      "cancel_shipment",
      `Canceled shipment ${active.existingShipmentId}; rollback_amount=${rollbackAmount}; reason=${cancelReason.trim()}`
    );
    setCancelReason("");

    await loadRecentShipments();
    toast.success(`ຍົກເລີກຈັດສົ່ງ ${active.order.order_code} ສຳເລັດ`);
  };

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-[2rem] bg-gradient-to-br from-orange-950 via-orange-900 to-amber-900 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em]">
              <Truck size={14} />
              ຈັດສົ່ງ
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">ຈັດສົ່ງດ້ວຍ QR ໂຮງງານ ຫຼື QR ຂອງຮ້ານ</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-orange-50">
              ໜ້າຈັດສົ່ງຍັງໃຊ້ລະບົບການຊຳລະແບບເກົ່າ ແຕ່ຮອງຮັບທັງ QR ໂຮງງານ, QR ຂອງຮ້ານ, ລະຫັດບິນໂຮງງານ ແລະ ລະຫັດອໍເດີ.
            </p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-orange-50">
            ກຳໄລຈະນັບຕາມວັນຈັດສົ່ງສຳເລັດ
          </div>
          <Link
            href="/shipments/orders"
            className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20"
          >
            ເບິ່ງລາຍການອໍເດີຈັດສົ່ງ
          </Link>
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
                placeholder="ວາງ QR ໂຮງງານ, QR ຂອງຮ້ານ, ລະຫັດບິນໂຮງງານ ຫຼື ລະຫັດອໍເດີ"
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
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ສະຖານະຈັດສົ່ງ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">
                    {active.order.shipment_status === "shipped" ? "ຈັດສົ່ງສຳເລັດ" : "ຍັງບໍ່ສຳເລັດ"}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ຈຳນວນ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{getTotalUnits(active.order)}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ວັນທີຈັດສົ່ງສຳເລັດ</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{formatDateTime(active.order.shipment_completed_at)}</div>
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
                    ອໍເດີ {active.order.order_code} ຖືກຈັດສົ່ງແລ້ວ
                    {active.existingShipmentAt ? ` ໃນວັນທີ ${formatDateTime(active.existingShipmentAt)}` : ""}.
                  </div>
                ) : null}

                {shipmentLocked ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    {canCancelShipment
                      ? "ຖ້າກົດຜິດ ຫຼື ສະແກນຜິດ ສາມາດຍົກເລີກໄດ້ ແຕ່ຕ້ອງລະບຸເຫດຜົນ."
                      : "ການຍົກເລີກການຈັດສົ່ງສະຫງວນໃຫ້ accountant ຫຼື superadmin ເທົ່ານັ້ນ."}
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
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </label>

                {shipmentLocked ? (
                  <label className="mt-4 block text-sm font-bold text-slate-700">
                    ເຫດຜົນການຍົກເລີກ
                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      rows={3}
                      placeholder="ຕົວຢ່າງ: ສະແກນຜິດ, ກົດຈັດສົ່ງຜິດ, ລູກຄ້າຍັງບໍ່ຮັບສິນຄ້າ"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void submitShipment()}
                    disabled={saving || shipmentLocked}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    <PackageCheck size={18} />
                    {saving ? "ກຳລັງບັນທຶກ..." : shipmentLocked ? "ອໍເດີນີ້ສົ່ງແລ້ວ" : "ຢືນຢັນການຈັດສົ່ງ"}
                  </button>

                  {shipmentLocked ? (
                    <button
                      type="button"
                      onClick={() => void cancelShipment()}
                      disabled={saving || !canCancelShipment || !cancelReason.trim()}
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-5 py-3 text-sm font-black text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      <RotateCcw size={18} />
                      ຍົກເລີກຈັດສົ່ງ
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-16 text-center text-sm font-medium text-slate-500">
              ສະແກນ QR ໂຮງງານ, QR ຂອງຮ້ານ, ລະຫັດບິນໂຮງງານ ຫຼື ລະຫັດອໍເດີ ເພື່ອເປີດໜ້າຈັດສົ່ງ.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-black text-slate-900">
          <Truck size={20} />
          ປະຫວັດຈັດສົ່ງລ່າສຸດ
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {recentShipments.map((shipment) => (
            <div key={shipment.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ຈັດສົ່ງແລ້ວ</div>
              <div className="mt-2 text-lg font-black text-slate-900">{formatDateTime(shipment.shipped_at)}</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">{shipment.shipped_by}</div>
              <div className="mt-3 text-sm font-black text-slate-900">{formatCurrency(shipment.collected_amount)}</div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                {shipment.payment_method === "cash" ? "ເງິນສົດ" : shipment.payment_method === "transfer" ? "ໂອນເງິນ" : "ບໍ່ມີການຮັບເງິນ"}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
