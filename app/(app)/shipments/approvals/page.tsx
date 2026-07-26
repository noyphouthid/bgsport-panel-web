"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import { CheckCircle2, ClipboardCheck, LoaderCircle, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import {
  SHIPMENT_DELIVERY_METHOD_LABELS,
  SHIPMENT_DELIVERY_STATUS_LABELS,
  SHIPMENT_DELIVERY_STATUS_STYLES,
  type ShipmentDeliveryRequestRow,
  type ShipmentDeliveryStatus,
} from "@/lib/shipment-delivery-requests";
import { isTransportNoteDeposited, type TransportNoteRow } from "@/lib/transport-notes";

type UserRow = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  role: AppRole;
  is_active?: boolean;
};

type OrderRow = {
  id: string;
  order_code: string;
  factory_bill_code: string | null;
  status: "in_progress" | "completed";
  shipment_status: "pending" | "shipped";
  shipment_completed_at: string | null;
  production_completed_at: string | null;
  balance: number;
  customer_paid_full_at: string | null;
};

type LabelRow = {
  id: string;
  order_id: string;
  label_status: "created" | "received" | "shipped";
  received_at: string | null;
  shipped_at: string | null;
};

type TransportNoteApprovalRow = Pick<
  TransportNoteRow,
  "id" | "delivery_request_id" | "transport_deposited_at" | "transport_deposited_by" | "transport_deposit_receipt_id"
>;

type ShipmentApprovalsApiPayload = {
  ok?: boolean;
  error?: string;
  message?: string;
  viewerRole?: AppRole | null;
  viewerUserId?: string | null;
  rows?: ShipmentDeliveryRequestRow[];
  ordersById?: Record<string, OrderRow>;
  usersById?: Record<string, UserRow>;
  transportNotesByRequestId?: Record<string, TransportNoteApprovalRow>;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: number | null | undefined) {
  return (Number(value) || 0).toLocaleString();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  const raw = String(error ?? "").trim();
  return raw && raw !== "[object Object]" ? raw : fallback;
}

async function fetchShipmentApprovalsViaApi() {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("no_session");
  }

  const response = await fetch("/api/shipments/approvals", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as ShipmentApprovalsApiPayload;
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "load_shipment_approvals_failed");
  }

  return payload;
}

async function confirmAction({
  title,
  text,
  confirmButtonText,
  cancelToast,
  icon = "question",
}: {
  title: string;
  text: string;
  confirmButtonText: string;
  cancelToast: string;
  icon?: "question" | "warning";
}) {
  const result = await Swal.fire({
    icon,
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: "ຍົກເລີກ",
    reverseButtons: true,
  });

  if (!result.isConfirmed) {
    toast(cancelToast);
  }

  return result.isConfirmed;
}

async function promptRejectReason({
  title,
  inputLabel,
  confirmButtonText,
}: {
  title: string;
  inputLabel: string;
  confirmButtonText: string;
}) {
  const result = await Swal.fire({
    icon: "warning",
    title,
    input: "textarea",
    inputLabel,
    inputPlaceholder: "ລະບຸເຫດຜົນ...",
    inputAttributes: {
      "aria-label": inputLabel,
    },
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: "ຍົກເລີກ",
    reverseButtons: true,
    inputValidator: (value) => {
      if (!String(value || "").trim()) {
        return "ກະລຸນາລະບຸເຫດຜົນ";
      }
      return null;
    },
  });

  if (!result.isConfirmed) {
    toast("ຍົກເລີກການປະຕິເສດແລ້ວ");
    return null;
  }

  return String(result.value || "").trim();
}

export default function ShipmentApprovalsPage() {
  const [rows, setRows] = useState<ShipmentDeliveryRequestRow[]>([]);
  const [ordersById, setOrdersById] = useState<Record<string, OrderRow>>({});
  const [usersById, setUsersById] = useState<Record<string, UserRow>>({});
  const [transportNotesByRequestId, setTransportNotesByRequestId] = useState<Record<string, TransportNoteApprovalRow>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<"approve" | "reject" | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ShipmentDeliveryStatus | "all">("submitted");
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const isProcessing = workingId !== null || bulkAction !== null;

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const payload = await fetchShipmentApprovalsViaApi();
      setViewerRole((payload.viewerRole as AppRole | null) ?? null);
      setViewerUserId(payload.viewerUserId ?? null);
      setRows((payload.rows ?? []) as ShipmentDeliveryRequestRow[]);
      setUsersById(payload.usersById ?? {});
      setOrdersById(payload.ordersById ?? {});
      setTransportNotesByRequestId(payload.transportNotesByRequestId ?? {});
    } catch (error) {
      setErr(getErrorMessage(error, "ໂຫຼດຄຳຂໍຈັດສົ່ງບໍ່ສຳເລັດ"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const safeInsertOrderAction = async (orderId: string, action: string, detail: string) => {
    const { error } = await supabase.from("order_status_history").insert({
      order_id: orderId,
      action,
      detail,
      action_at: new Date().toISOString(),
    });
    if (error && !error.message.includes("Could not find the table")) {
      throw error;
    }
  };

  const approveRequest = async (request: ShipmentDeliveryRequestRow) => {
    const [
      { data: orderData, error: orderError },
      { data: labelData, error: labelError },
      { data: existingShipment, error: existingShipmentError },
    ] =
      await Promise.all([
        supabase
          .from("orders")
          .select("id,order_code,factory_bill_code,status,shipment_status,shipment_completed_at,balance,customer_paid_full_at")
          .eq("id", request.order_id)
          .maybeSingle(),
        supabase
          .from("order_qr_labels")
          .select("id,order_id,label_status,received_at,shipped_at")
          .eq("id", request.qr_label_id)
          .maybeSingle(),
        supabase
          .from("shipment_records")
          .select("id")
          .eq("order_id", request.order_id)
          .order("shipped_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (orderError) throw orderError;
    if (labelError) throw labelError;
    if (existingShipmentError) throw existingShipmentError;

    const order = (orderData as OrderRow | null) ?? null;
    const label = (labelData as LabelRow | null) ?? null;
    const transportNote = transportNotesByRequestId[request.id] ?? null;

    if (!order) throw new Error("ບໍ່ພົບຂໍ້ມູນອໍເດີ");
    if (!label) throw new Error("ບໍ່ພົບຂໍ້ມູນ QR");
    if (order.status === "completed") throw new Error("ອໍເດີນີ້ຖືກປິດງານແລ້ວ");
    if (order.shipment_status === "shipped" || order.shipment_completed_at || label.label_status === "shipped" || label.shipped_at || existingShipment?.id) {
      throw new Error("ອໍເດີນີ້ຖືກຈັດສົ່ງແລ້ວ");
    }
    if (request.delivery_method === "transport") {
      if (!transportNote) throw new Error("ບໍ່ພົບໃບຝາກເຄື່ອງຂອງຄຳຂໍນີ້");
      if (!isTransportNoteDeposited(transportNote)) {
        throw new Error("ຄຳຂໍນີ້ຍັງບໍ່ໄດ້ຢືນຢັນຝາກຂົນສົ່ງ");
      }
    }

    const paymentAmount = Number(request.payment_amount) || 0;
    const currentBalance = Number(order.balance) || 0;
    if (paymentAmount > currentBalance) {
      throw new Error("ຍອດຮັບເງິນເກີນຍອດຄ້າງຂອງອໍເດີນີ້ ກະລຸນາກັບໄປແກ້ draft");
    }

    const approvedAtIso = new Date().toISOString();
    const shippedAtIso =
      request.delivery_method === "transport"
        ? transportNote?.transport_deposited_at || approvedAtIso
        : request.delivery_scheduled_at || approvedAtIso;

    const { data: shipmentData, error: shipmentError } = await supabase
      .from("shipment_records")
      .insert({
        qr_label_id: request.qr_label_id,
        order_id: request.order_id,
        shipped_at: shippedAtIso,
        shipped_by: request.delivery_person_name || usersById[request.requested_by_user_id || ""]?.full_name || "System",
        note: request.note || null,
        collected_amount: paymentAmount,
        payment_method: paymentAmount > 0 ? request.payment_method : null,
      })
      .select("id")
      .single();
    if (shipmentError) throw shipmentError;

    const shipmentId = String(shipmentData.id);
    const paymentAtIso = request.payment_paid_at || approvedAtIso;

    if (paymentAmount > 0) {
      const { error: shipmentPaymentError } = await supabase.from("shipment_payments").insert({
        shipment_id: shipmentId,
        order_id: request.order_id,
        amount: paymentAmount,
        payment_method: request.payment_method || "transfer",
        paid_at: paymentAtIso,
        note: request.note || null,
      });
      if (shipmentPaymentError) throw shipmentPaymentError;

      const { error: paymentTransactionError } = await supabase.from("payment_transactions").insert({
        shipment_id: shipmentId,
        order_id: request.order_id,
        amount: paymentAmount,
        paid_at: paymentAtIso,
        note: request.note || null,
      });
      if (paymentTransactionError) throw paymentTransactionError;
    }

    const nextBalance = Math.max(0, currentBalance - paymentAmount);
    const nextCustomerPaidFullAt =
      nextBalance === 0 ? order.customer_paid_full_at || request.payment_paid_at || approvedAtIso : null;

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update({
        balance: nextBalance,
        customer_paid_full_at: nextCustomerPaidFullAt,
        shipment_status: "shipped",
        shipment_completed_at: shippedAtIso,
      })
      .eq("id", request.order_id);
    if (orderUpdateError) throw orderUpdateError;

    const { error: labelUpdateError } = await supabase
      .from("order_qr_labels")
      .update({
        label_status: "shipped",
        shipped_at: shippedAtIso,
        shipped_by: request.delivery_person_name || usersById[request.requested_by_user_id || ""]?.full_name || "System",
        last_scanned_at: approvedAtIso,
        updated_at: approvedAtIso,
      })
      .eq("id", request.qr_label_id);
    if (labelUpdateError) throw labelUpdateError;

    const { error: requestUpdateError } = await supabase
      .from("shipment_delivery_requests")
      .update({
        status: "delivered",
        approved_at: approvedAtIso,
        approved_by_user_id: viewerUserId,
        delivered_at: shippedAtIso,
        delivered_by_user_id: viewerUserId,
        updated_at: approvedAtIso,
      })
      .eq("id", request.id);
    if (requestUpdateError) throw requestUpdateError;

    await safeInsertOrderAction(
      request.order_id,
      "approve_shipment_delivery_request",
      `Approved delivery request ${request.id}; method=${request.delivery_method}; payment_amount=${paymentAmount}; shipped_at=${shippedAtIso}`
    );

    return order;
  };

  const rejectRequest = async (request: ShipmentDeliveryRequestRow, reason: string) => {
    const rejectedAtIso = new Date().toISOString();
    const { error } = await supabase
      .from("shipment_delivery_requests")
      .update({
        status: "rejected",
        rejected_at: rejectedAtIso,
        rejected_by_user_id: viewerUserId,
        rejection_note: reason,
        updated_at: rejectedAtIso,
      })
      .eq("id", request.id);
    if (error) throw error;

    await safeInsertOrderAction(request.order_id, "reject_shipment_delivery_request", `Rejected delivery request ${request.id}; reason=${reason}`);
  };

  const handleApprove = async (request: ShipmentDeliveryRequestRow) => {
    if (viewerRole !== "superadmin" || !viewerUserId) {
      toast.error("ສິດນີ້ສຳລັບ super admin ເທົ່ານັ້ນ");
      return;
    }
    if (request.status !== "submitted") {
      toast.error("ອະນຸມັດໄດ້ສະເພາະລາຍການທີ່ລໍຖ້າອະນຸມັດ");
      return;
    }

    const confirmed = await confirmAction({
      title: "ຢືນຢັນສົ່ງມອບ?",
      text: `ຕ້ອງການຢືນຢັນ ${request.request_no} ໃຫ້ລູກຄ້າແລ້ວ ຫຼື ບໍ່?`,
      confirmButtonText: "ຢືນຢັນ",
      cancelToast: "ຍົກເລີກການຢືນຢັນແລ້ວ",
    });
    if (!confirmed) return;

    setWorkingId(request.id);
    try {
      const order = await approveRequest(request);
      toast.success(`ຢືນຢັນສົ່ງມອບ ${order.order_code} ສຳເລັດ`);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, "ອະນຸມັດການສົ່ງມອບບໍ່ສຳເລັດ"));
    } finally {
      setWorkingId(null);
    }
  };

  const handleReject = async (request: ShipmentDeliveryRequestRow) => {
    if (viewerRole !== "superadmin" || !viewerUserId) {
      toast.error("ສິດນີ້ສຳລັບ super admin ເທົ່ານັ້ນ");
      return;
    }
    if (request.status !== "submitted") {
      toast.error("ປະຕິເສດໄດ້ສະເພາະລາຍການທີ່ລໍຖ້າອະນຸມັດ");
      return;
    }

    const reason = await promptRejectReason({
      title: `ປະຕິເສດ ${request.request_no}`,
      inputLabel: "ເຫດຜົນການປະຕິເສດ",
      confirmButtonText: "ປະຕິເສດ",
    });
    if (!reason) return;

    setWorkingId(request.id);
    try {
      await rejectRequest(request, reason);
      toast.success("ປະຕິເສດຄຳຂໍແລ້ວ");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, "ປະຕິເສດຄຳຂໍບໍ່ສຳເລັດ"));
    } finally {
      setWorkingId(null);
    }
  };

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return rows.filter((row) => {
      const order = ordersById[row.order_id];
      const requester = usersById[row.requested_by_user_id || ""];
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!keyword) return true;
      return [
        row.request_no,
        order?.order_code || "",
        order?.factory_bill_code || "",
        requester?.full_name || "",
        row.delivery_person_name || "",
        row.transport_receiver_name || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [ordersById, query, rows, statusFilter, usersById]);

  const submittedRows = useMemo(() => filteredRows.filter((row) => row.status === "submitted"), [filteredRows]);

  const handleApproveAll = async () => {
    if (viewerRole !== "superadmin" || !viewerUserId) {
      toast.error("ສິດນີ້ສຳລັບ super admin ເທົ່ານັ້ນ");
      return;
    }
    if (submittedRows.length === 0) {
      toast.error("ບໍ່ມີລາຍການລໍຖ້າອະນຸມັດ");
      return;
    }

    const confirmed = await confirmAction({
      title: "ຢືນຢັນທັງໝົດ?",
      text: `ຕ້ອງການອະນຸມັດ ${submittedRows.length} ລາຍການ ຫຼື ບໍ່?`,
      confirmButtonText: "ຢືນຢັນທັງໝົດ",
      cancelToast: "ຍົກເລີກການຢືນຢັນທັງໝົດແລ້ວ",
    });
    if (!confirmed) return;

    setBulkAction("approve");
    let successCount = 0;
    let failCount = 0;

    try {
      for (const row of submittedRows) {
        try {
          await approveRequest(row);
          successCount += 1;
        } catch (error) {
          failCount += 1;
          console.error(error);
        }
      }

      if (successCount > 0) {
        toast.success(`ຢືນຢັນສຳເລັດ ${successCount} ລາຍການ`);
      }
      if (failCount > 0) {
        toast.error(`ບາງລາຍການບໍ່ສຳເລັດ ${failCount} ລາຍການ`);
      }
      await load();
    } finally {
      setBulkAction(null);
    }
  };

  const handleRejectAll = async () => {
    if (viewerRole !== "superadmin" || !viewerUserId) {
      toast.error("ສິດນີ້ສຳລັບ super admin ເທົ່ານັ້ນ");
      return;
    }
    if (submittedRows.length === 0) {
      toast.error("ບໍ່ມີລາຍການລໍຖ້າອະນຸມັດ");
      return;
    }

    const reason = await promptRejectReason({
      title: "ປະຕິເສດທັງໝົດ",
      inputLabel: "ເຫດຜົນການປະຕິເສດທັງໝົດ",
      confirmButtonText: "ປະຕິເສດທັງໝົດ",
    });
    if (!reason) return;

    setBulkAction("reject");
    let successCount = 0;
    let failCount = 0;

    try {
      for (const row of submittedRows) {
        try {
          await rejectRequest(row, reason);
          successCount += 1;
        } catch (error) {
          failCount += 1;
          console.error(error);
        }
      }

      if (successCount > 0) {
        toast.success(`ປະຕິເສດສຳເລັດ ${successCount} ລາຍການ`);
      }
      if (failCount > 0) {
        toast.error(`ບາງລາຍການບໍ່ສຳເລັດ ${failCount} ລາຍການ`);
      }
      await load();
    } finally {
      setBulkAction(null);
    }
  };

  if (!loading && !err && viewerRole !== "superadmin") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">
        ໜ້ານີ້ສະຫງວນໃຫ້ super admin ເທົ່ານັ້ນ
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-900">
      {isProcessing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-sm">
          <div className="rounded-3xl border border-white/40 bg-white px-8 py-6 text-center shadow-2xl">
            <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-amber-600" />
            <div className="mt-4 text-lg font-black text-slate-900">
              {bulkAction === "approve"
                ? "ກຳລັງຢືນຢັນລາຍການ..."
                : bulkAction === "reject"
                  ? "ກຳລັງປະຕິເສດລາຍການ..."
                  : "ກຳລັງດຳເນີນການ..."}
            </div>
            <div className="mt-2 text-sm font-medium text-slate-500">ກະລຸນາລໍຖ້າຈົນກວ່າລະບົບຈະດຳເນີນການສຳເລັດ</div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight text-slate-900">
            <ClipboardCheck size={24} className="text-amber-600" />
            ອະນຸມັດການສົ່ງມອບສິນຄ້າ
          </h1>
          <div className="mt-2 text-sm font-medium text-slate-500">super admin ຈະອະນຸມັດສະເພາະລາຍການທີ່ຜ່ານການຢືນຢັນຝາກຂົນສົ່ງແລ້ວ ຫຼື ລາຍການຮັບເອງທີ່ຖືກສົ່ງເຂົ້າມາ.</div>
        </div>
        <Link href="/shipments" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
          ກັບໄປໜ້າຈັດສົ່ງ
        </Link>
      </div>

      {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px,1fr]">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ສະຖານະ</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ShipmentDeliveryStatus | "all")} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
              <option value="all">ທັງໝົດ</option>
              <option value="submitted">ລໍຖ້າອະນຸມັດ</option>
              <option value="rejected">ຖືກປະຕິເສດ</option>
              <option value="delivered">ສົ່ງມອບແລ້ວ</option>
              <option value="draft">ຮ່າງ</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຄົ້ນຫາ</label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ລະຫັດອໍເດີ / ບິນໂຮງງານ / ຜູ້ຂໍ" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-50 bg-slate-50/50 p-4">
          <div className="text-sm font-bold uppercase tracking-widest text-slate-700">ລາຍການຄຳຂໍສົ່ງມອບ</div>
          <div className="flex items-center gap-2">
            {viewerRole === "superadmin" ? (
              <>
                <button
                  onClick={() => void handleApproveAll()}
                  disabled={loading || submittedRows.length === 0 || bulkAction !== null || workingId !== null}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  {bulkAction === "approve" ? "ກຳລັງຢືນຢັນ..." : "ຢືນຢັນທັງໝົດ"}
                </button>
                <button
                  onClick={() => void handleRejectAll()}
                  disabled={loading || submittedRows.length === 0 || bulkAction !== null || workingId !== null}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <XCircle size={14} />
                  {bulkAction === "reject" ? "ກຳລັງປະຕິເສດ..." : "ປະຕິເສດທັງໝົດ"}
                </button>
              </>
            ) : null}
            <div className="text-xs font-bold text-slate-500">{loading ? "ກຳລັງໂຫຼດ..." : `${filteredRows.length} ລາຍການ`}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-700">
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ລະຫັດອໍເດີ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ລະຫັດບິນໂຮງງານ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ຮູບແບບ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ຜູ້ຂໍ / ຜູ້ສົ່ງ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ລາຍລະອຽດ</th>
                <th className="p-4 text-center text-[14px] font-bold uppercase tracking-widest">ສະຖານະ</th>
                <th className="p-4 text-center text-[14px] font-bold uppercase tracking-widest">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center font-medium text-slate-400">ບໍ່ພົບຄຳຂໍ</td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const order = ordersById[row.order_id];
                  const requester = usersById[row.requested_by_user_id || ""];
                  const approver = usersById[row.approved_by_user_id || row.rejected_by_user_id || row.delivered_by_user_id || ""];
                  const transportNote = transportNotesByRequestId[row.id];
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="p-4">
                        <div className="font-black text-slate-900">{order?.order_code || "-"}</div>
                        <div className="text-xs font-medium text-slate-500">{formatDateTime(row.updated_at)}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-black text-slate-900">{order?.factory_bill_code?.trim() || "-"}</div>
                        <div className="text-xs font-medium text-slate-500">ອັບເດດລ່າສຸດ: {formatDateTime(row.updated_at)}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-700">{SHIPMENT_DELIVERY_METHOD_LABELS[row.delivery_method]}</div>
                        <div className="text-xs text-slate-500">ນັດສົ່ງ: {formatDateTime(row.delivery_scheduled_at)}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-700">{requester?.full_name || "-"}</div>
                        <div className="text-xs text-slate-500">ຜູ້ຈັດສົ່ງ: {row.delivery_person_name || "-"}</div>
                      </td>
                      <td className="p-4">
                        <div className="max-w-[340px] whitespace-pre-wrap font-medium text-slate-600">
                          {row.delivery_method === "pickup"
                            ? `ຮັບເງິນ: ${formatMoney(row.payment_amount)} / ຄ້າງ: ${formatMoney(row.payment_outstanding_amount)}`
                            : `ຜູ້ຮັບ: ${row.transport_receiver_name || "-"} / ເບີ: ${row.transport_receiver_phone || "-"}`}
                        </div>
                        {row.delivery_method === "transport" ? (
                          <div className="mt-1 text-xs text-slate-500">
                            {row.transport_providers.join(", ") || "-"} {row.transport_branch ? `• ${row.transport_branch}` : ""}
                          </div>
                        ) : null}
                        {row.delivery_method === "transport" ? (
                          <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${transportNote && isTransportNoteDeposited(transportNote) ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {transportNote && isTransportNoteDeposited(transportNote)
                              ? `ຝາກຂົນສົ່ງແລ້ວ ${formatDateTime(transportNote.transport_deposited_at)}`
                              : "ຍັງບໍ່ຢືນຢັນຝາກຂົນສົ່ງ"}
                          </div>
                        ) : null}
                        {row.transfer_slip_url ? (
                          <a href={row.transfer_slip_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-bold text-sky-700 underline">
                            ເບິ່ງສະລິບ
                          </a>
                        ) : null}
                        {row.note ? <div className="mt-2 text-xs font-medium text-slate-500">ໝາຍເຫດ: {row.note}</div> : null}
                        {row.rejection_note ? <div className="mt-2 text-xs font-bold text-rose-600">ປະຕິເສດ: {row.rejection_note}</div> : null}
                        {approver ? <div className="mt-2 text-xs font-medium text-slate-400">ຜູ້ຕັດສິນ: {approver.full_name}</div> : null}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${SHIPMENT_DELIVERY_STATUS_STYLES[row.status]}`}>
                          {SHIPMENT_DELIVERY_STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {viewerRole === "superadmin" && row.status === "submitted" ? (
                            <>
                              <button onClick={() => void handleApprove(row)} disabled={workingId === row.id || bulkAction !== null} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
                                <CheckCircle2 size={14} />
                                {workingId === row.id ? "ກຳລັງອະນຸມັດ..." : "ຢືນຢັນສົ່ງມອບ"}
                              </button>
                              <button onClick={() => void handleReject(row)} disabled={workingId === row.id || bulkAction !== null} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">
                                <XCircle size={14} />
                                ປະຕິເສດ
                              </button>
                            </>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">
                              {row.status === "submitted" ? "ລໍຖ້າ super admin" : "ດຳເນີນການແລ້ວ"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
