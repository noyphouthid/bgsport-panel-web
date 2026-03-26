"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import {
  SHIPMENT_DELIVERY_METHOD_LABELS,
  SHIPMENT_DELIVERY_STATUS_LABELS,
  SHIPMENT_DELIVERY_STATUS_STYLES,
  type ShipmentDeliveryRequestRow,
  type ShipmentDeliveryStatus,
} from "@/lib/shipment-delivery-requests";

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

export default function ShipmentApprovalsPage() {
  const [rows, setRows] = useState<ShipmentDeliveryRequestRow[]>([]);
  const [ordersById, setOrdersById] = useState<Record<string, OrderRow>>({});
  const [usersById, setUsersById] = useState<Record<string, UserRow>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ShipmentDeliveryStatus | "all">("submitted");
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [{ data: requestData, error: requestError }, { data: usersData, error: usersError }, { data: sessionData }] = await Promise.all([
        supabase.from("shipment_delivery_requests").select("*").order("updated_at", { ascending: false }),
        supabase.from("users").select("id,auth_user_id,full_name,role,is_active").eq("is_active", true),
        supabase.auth.getSession(),
      ]);

      if (requestError) throw requestError;
      if (usersError) throw usersError;

      const userRows = (usersData ?? []) as UserRow[];
      const authUserId = sessionData.session?.user.id ?? null;
      const currentUser = userRows.find((item) => item.auth_user_id === authUserId) || null;
      setViewerRole(currentUser?.role ?? null);
      setViewerUserId(currentUser?.id ?? null);
      setUsersById(Object.fromEntries(userRows.map((user) => [user.id, user])));

      const requestRows = (requestData ?? []) as ShipmentDeliveryRequestRow[];
      setRows(requestRows);

      const orderIds = [...new Set(requestRows.map((row) => row.order_id))];
      if (orderIds.length === 0) {
        setOrdersById({});
        setLoading(false);
        return;
      }

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id,order_code,factory_bill_code,status,shipment_status,shipment_completed_at,production_completed_at,balance,customer_paid_full_at")
        .in("id", orderIds);
      if (orderError) throw orderError;

      setOrdersById(Object.fromEntries(((orderData ?? []) as OrderRow[]).map((order) => [order.id, order])));
    } catch (error) {
      setErr(error instanceof Error ? error.message : "ໂຫຼດຄຳຂໍຈັດສົ່ງບໍ່ສຳເລັດ");
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

  const handleApprove = async (request: ShipmentDeliveryRequestRow) => {
    if (viewerRole !== "superadmin" || !viewerUserId) {
      toast.error("ສິດນີ້ສຳລັບ super admin ເທົ່ານັ້ນ");
      return;
    }
    if (request.status !== "submitted") {
      toast.error("ອະນຸມັດໄດ້ສະເພາະລາຍການທີ່ລໍຖ້າອະນຸມັດ");
      return;
    }

    const confirmed = window.confirm(`ຢືນຢັນສົ່ງມອບ ${request.request_no} ໃຫ້ລູກຄ້າແລ້ວ ຫຼື ບໍ່?`);
    if (!confirmed) return;

    setWorkingId(request.id);
    try {
      const [{ data: orderData, error: orderError }, { data: labelData, error: labelError }, { data: existingShipment, error: existingShipmentError }] =
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

      if (!order) throw new Error("ບໍ່ພົບຂໍ້ມູນອໍເດີ");
      if (!label) throw new Error("ບໍ່ພົບຂໍ້ມູນ QR");
      if (order.status === "completed") throw new Error("ອໍເດີນີ້ຖືກປິດງານແລ້ວ");
      if (order.shipment_status === "shipped" || order.shipment_completed_at || label.label_status === "shipped" || label.shipped_at || existingShipment?.id) {
        throw new Error("ອໍເດີນີ້ຖືກຈັດສົ່ງແລ້ວ");
      }

      const paymentAmount = Number(request.payment_amount) || 0;
      const currentBalance = Number(order.balance) || 0;
      if (paymentAmount > currentBalance) {
        throw new Error("ຍອດຮັບເງິນເກີນຍອດຄ້າງຂອງອໍເດີນີ້ ກະລຸນາກັບໄປແກ້ draft");
      }

      const approvedAtIso = new Date().toISOString();
      const shippedAtIso = request.delivery_scheduled_at || approvedAtIso;

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
          shipment_completed_at: approvedAtIso,
        })
        .eq("id", request.order_id);
      if (orderUpdateError) throw orderUpdateError;

      const { error: labelUpdateError } = await supabase
        .from("order_qr_labels")
        .update({
          label_status: "shipped",
          shipped_at: approvedAtIso,
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
          delivered_at: approvedAtIso,
          delivered_by_user_id: viewerUserId,
          updated_at: approvedAtIso,
        })
        .eq("id", request.id);
      if (requestUpdateError) throw requestUpdateError;

      await safeInsertOrderAction(
        request.order_id,
        "approve_shipment_delivery_request",
        `Approved delivery request ${request.id}; method=${request.delivery_method}; payment_amount=${paymentAmount}`
      );

      toast.success(`ຢືນຢັນສົ່ງມອບ ${order.order_code} ສຳເລັດ`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ອະນຸມັດການສົ່ງມອບບໍ່ສຳເລັດ");
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

    const reason = window.prompt("ລະບຸເຫດຜົນການປະຕິເສດ", "")?.trim();
    if (!reason) return;

    setWorkingId(request.id);
    try {
      const { error } = await supabase
        .from("shipment_delivery_requests")
        .update({
          status: "rejected",
          rejected_at: new Date().toISOString(),
          rejected_by_user_id: viewerUserId,
          rejection_note: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.id);
      if (error) throw error;

      await safeInsertOrderAction(request.order_id, "reject_shipment_delivery_request", `Rejected delivery request ${request.id}; reason=${reason}`);
      toast.success("ປະຕິເສດຄຳຂໍແລ້ວ");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ປະຕິເສດຄຳຂໍບໍ່ສຳເລັດ");
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

  if (!loading && viewerRole !== "superadmin") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">
        ໜ້ານີ້ສະຫງວນໃຫ້ super admin ເທົ່ານັ້ນ
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight text-slate-900">
            <ClipboardCheck size={24} className="text-amber-600" />
            ອະນຸມັດການສົ່ງມອບສິນຄ້າ
          </h1>
          <div className="mt-2 text-sm font-medium text-slate-500">super admin ຈະເປັນຜູ້ຢືນຢັນປິດງານສົ່ງມອບ ແລະ ບັນທຶກລົງ order ຈິງ</div>
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
          <div className="text-xs font-bold text-slate-500">{loading ? "ກຳລັງໂຫຼດ..." : `${filteredRows.length} ລາຍການ`}</div>
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
                              <button onClick={() => void handleApprove(row)} disabled={workingId === row.id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
                                <CheckCircle2 size={14} />
                                {workingId === row.id ? "ກຳລັງອະນຸມັດ..." : "ຢືນຢັນສົ່ງມອບ"}
                              </button>
                              <button onClick={() => void handleReject(row)} disabled={workingId === row.id} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">
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
