"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import {
  canApproveOrderChangeRequest,
  ORDER_CHANGE_REQUEST_STATUS_LABELS,
  ORDER_CHANGE_REQUEST_STATUS_STYLES,
  ORDER_CHANGE_REQUEST_TYPE_LABELS,
  type OrderChangeRequestRow,
  type OrderChangeRequestStatus,
} from "@/lib/order-change-requests";

type UserRow = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  role: AppRole;
};

type OrderRow = {
  id: string;
  order_code: string;
  factory_bill_code: string | null;
  status: "in_progress" | "completed";
  closed_at?: string | null;
  production_completed_at: string | null;
  shipment_status?: "pending" | "shipped";
  shipment_completed_at?: string | null;
  balance: number;
};

type ReceiptItemRow = {
  receipt_id: string;
};

type ShipmentRecordRow = {
  id: string;
  shipped_at: string;
  shipped_by: string;
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

export default function OrderChangeRequestsPage() {
  const [rows, setRows] = useState<OrderChangeRequestRow[]>([]);
  const [ordersById, setOrdersById] = useState<Record<string, OrderRow>>({});
  const [usersById, setUsersById] = useState<Record<string, UserRow>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderChangeRequestStatus | "all">("submitted");
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [{ data: requestData, error: requestError }, { data: usersData, error: usersError }, { data: sessionData }] = await Promise.all([
        supabase.from("order_change_requests").select("*").order("requested_at", { ascending: false }),
        supabase.from("users").select("id,auth_user_id,full_name,role").eq("is_active", true),
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

      const requestRows = (requestData ?? []) as OrderChangeRequestRow[];
      setRows(requestRows);

      const orderIds = [...new Set(requestRows.map((row) => row.order_id))];
      if (orderIds.length === 0) {
        setOrdersById({});
        setLoading(false);
        return;
      }

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id,order_code,factory_bill_code,status,closed_at,production_completed_at,shipment_status,shipment_completed_at,balance")
        .in("id", orderIds);

      if (orderError) throw orderError;
      setOrdersById(Object.fromEntries(((orderData ?? []) as OrderRow[]).map((order) => [order.id, order])));
    } catch (error) {
      setErr(error instanceof Error ? error.message : "ໂຫຼດຄຳຂໍບໍ່ສຳເລັດ");
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

  const executeCancelFactoryReceipt = async (request: OrderChangeRequestRow) => {
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id,order_code,production_completed_at,shipment_status,shipment_completed_at,status")
      .eq("id", request.order_id)
      .maybeSingle();
    if (orderError) throw orderError;

    const order = orderData as Pick<OrderRow, "id" | "order_code" | "production_completed_at" | "shipment_status" | "shipment_completed_at" | "status"> | null;
    if (!order) throw new Error("ບໍ່ພົບຂໍ້ມູນອໍເດີ");
    if (order.status === "completed") throw new Error("ອໍເດີນີ້ຖືກປິດງານແລ້ວ");
    if (order.shipment_status === "shipped" || order.shipment_completed_at) throw new Error("ອໍເດີນີ້ຖືກຈັດສົ່ງແລ້ວ");

    const { data: labelData, error: labelError } = await supabase
      .from("order_qr_labels")
      .select("id,label_status")
      .eq("order_id", request.order_id)
      .maybeSingle();
    if (labelError) throw labelError;
    const label = (labelData as { id: string; label_status?: string } | null) ?? null;
    if (label?.label_status === "shipped") throw new Error("QR ນີ້ຖືກຈັດສົ່ງແລ້ວ");

    const { data: receiptItems, error: receiptItemsError } = await supabase
      .from("factory_receipt_items")
      .select("receipt_id")
      .eq("order_id", request.order_id);
    if (receiptItemsError) throw receiptItemsError;

    const receiptIds = Array.from(
      new Set(
        [
          request.target_receipt_id,
          ...((receiptItems ?? []) as ReceiptItemRow[]).map((item) => item.receipt_id),
        ].filter((value): value is string => Boolean(value))
      )
    );

    if ((receiptItems ?? []).length > 0) {
      const { error: deleteReceiptItemsError } = await supabase.from("factory_receipt_items").delete().eq("order_id", request.order_id);
      if (deleteReceiptItemsError) throw deleteReceiptItemsError;
    }

    for (const receiptId of receiptIds) {
      const { count, error: countError } = await supabase
        .from("factory_receipt_items")
        .select("id", { count: "exact", head: true })
        .eq("receipt_id", receiptId);
      if (countError) throw countError;
      if ((count || 0) === 0) {
        const { error: deleteReceiptError } = await supabase.from("factory_receipts").delete().eq("id", receiptId);
        if (deleteReceiptError) throw deleteReceiptError;
      }
    }

    if (label?.id) {
      const { error: revertLabelError } = await supabase
        .from("order_qr_labels")
        .update({
          label_status: "created",
          received_at: null,
          received_by: null,
          last_scanned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", label.id);
      if (revertLabelError) throw revertLabelError;
    }

    if (order.production_completed_at) {
      const { error: revertOrderError } = await supabase
        .from("orders")
        .update({ production_completed_at: null })
        .eq("id", request.order_id)
        .eq("production_completed_at", order.production_completed_at);
      if (revertOrderError) throw revertOrderError;
    }

    await safeInsertOrderAction(request.order_id, "cancel_factory_receipt_approved", `Approved request ${request.id}`);
  };

  const executeCancelShipment = async (request: OrderChangeRequestRow) => {
    if (!request.target_shipment_id) throw new Error("ບໍ່ພົບ shipment ທີ່ຈະຍົກເລີກ");

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id,order_code,status,closed_at,balance,customer_paid_full_at")
      .eq("id", request.order_id)
      .maybeSingle();
    if (orderError) throw orderError;
    const order = (orderData as (OrderRow & { customer_paid_full_at?: string | null }) | null) ?? null;
    if (!order) throw new Error("ບໍ່ພົບຂໍ້ມູນອໍເດີ");
    if (order.status === "completed" || order.closed_at) throw new Error("ອໍເດີນີ້ຖືກປິດງານແລ້ວ");

    const { data: latestShipmentData, error: latestShipmentError } = await supabase
      .from("shipment_records")
      .select("id,shipped_at,shipped_by")
      .eq("order_id", request.order_id)
      .order("shipped_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestShipmentError) throw latestShipmentError;
    const latestShipment = (latestShipmentData as ShipmentRecordRow | null) ?? null;
    if (!latestShipment || latestShipment.id !== request.target_shipment_id) {
      throw new Error("ສາມາດຍົກເລີກໄດ້ສະເພາະ shipment ລ່າສຸດ");
    }

    const { data: shipmentPayments, error: shipmentPaymentsError } = await supabase
      .from("shipment_payments")
      .select("amount")
      .eq("shipment_id", request.target_shipment_id);
    if (shipmentPaymentsError) throw shipmentPaymentsError;

    const rollbackAmount = ((shipmentPayments ?? []) as Array<{ amount: number }>).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const nextBalance = Math.max(0, Number(order.balance || 0) + rollbackAmount);

    const { data: labelData, error: labelError } = await supabase
      .from("order_qr_labels")
      .select("id,received_at")
      .eq("order_id", request.order_id)
      .maybeSingle();
    if (labelError) throw labelError;
    const label = (labelData as { id: string; received_at: string | null } | null) ?? null;
    const revertedLabelStatus = label?.received_at ? "received" : "created";

    const { error: deleteShipmentPaymentsError } = await supabase.from("shipment_payments").delete().eq("shipment_id", request.target_shipment_id);
    if (deleteShipmentPaymentsError) throw deleteShipmentPaymentsError;

    const { error: deletePaymentTransactionsError } = await supabase.from("payment_transactions").delete().eq("shipment_id", request.target_shipment_id);
    if (deletePaymentTransactionsError) throw deletePaymentTransactionsError;

    const { error: deleteShipmentError } = await supabase.from("shipment_records").delete().eq("id", request.target_shipment_id);
    if (deleteShipmentError) throw deleteShipmentError;

    if (label?.id) {
      const { error: updateLabelError } = await supabase
        .from("order_qr_labels")
        .update({
          label_status: revertedLabelStatus,
          shipped_at: null,
          shipped_by: null,
          last_scanned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", label.id);
      if (updateLabelError) throw updateLabelError;
    }

    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({
        balance: nextBalance,
        customer_paid_full_at: nextBalance === 0 ? order.customer_paid_full_at || null : null,
        shipment_status: "pending",
        shipment_completed_at: null,
      })
      .eq("id", request.order_id);
    if (updateOrderError) throw updateOrderError;

    await safeInsertOrderAction(request.order_id, "cancel_shipment_approved", `Approved request ${request.id}; rollback_amount=${rollbackAmount}`);
  };

  const handleApprove = async (request: OrderChangeRequestRow) => {
    if (!viewerRole || !canApproveOrderChangeRequest(viewerRole) || !viewerUserId) {
      toast.error("ທ່ານບໍ່ມີສິດອະນຸມັດ");
      return;
    }
    if (request.status !== "submitted") {
      toast.error("ອະນຸມັດໄດ້ສະເພາະລາຍການທີ່ລໍຖ້າອະນຸມັດ");
      return;
    }

    const confirmed = window.confirm(`ຢືນຢັນອະນຸມັດ ${ORDER_CHANGE_REQUEST_TYPE_LABELS[request.request_type]} ຫຼື ບໍ່?`);
    if (!confirmed) return;

    setWorkingId(request.id);
    try {
      if (request.request_type === "cancel_factory_receipt") {
        await executeCancelFactoryReceipt(request);
      } else {
        await executeCancelShipment(request);
      }

      const { error: updateError } = await supabase
        .from("order_change_requests")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by_user_id: viewerUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.id);
      if (updateError) throw updateError;

      toast.success("ອະນຸມັດຄຳຂໍສຳເລັດ");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ອະນຸມັດຄຳຂໍບໍ່ສຳເລັດ");
    } finally {
      setWorkingId(null);
    }
  };

  const handleReject = async (request: OrderChangeRequestRow) => {
    if (!viewerRole || !canApproveOrderChangeRequest(viewerRole) || !viewerUserId) {
      toast.error("ທ່ານບໍ່ມີສິດປະຕິເສດ");
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
        .from("order_change_requests")
        .update({
          status: "rejected",
          rejected_at: new Date().toISOString(),
          rejected_by_user_id: viewerUserId,
          decision_note: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.id);
      if (error) throw error;
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
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!keyword) return true;
      return [
        order?.order_code || "",
        order?.factory_bill_code || "",
        ORDER_CHANGE_REQUEST_TYPE_LABELS[row.request_type],
        row.request_reason,
        usersById[row.requested_by_user_id || ""]?.full_name || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [ordersById, query, rows, statusFilter, usersById]);

  return (
    <div className="space-y-6 text-slate-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight text-slate-900">
            <ClipboardCheck size={24} className="text-amber-600" />
            ລາຍການຄຳຂໍລໍຖ້າອະນຸມັດ
          </h1>
          <div className="mt-2 text-sm font-medium text-slate-500">ອະນຸມັດ ຫຼື ປະຕິເສດ ການຂໍຍົກເລີກນຳເຂົ້າ ແລະ ການຂໍຍົກເລີກຈັດສົ່ງ</div>
        </div>
        <Link href="/orders" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
          ກັບໄປລາຍການອໍເດີ
        </Link>
      </div>

      {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px,1fr]">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ສະຖານະ</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OrderChangeRequestStatus | "all")} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
              <option value="all">ທັງໝົດ</option>
              <option value="submitted">ລໍຖ້າອະນຸມັດ</option>
              <option value="approved">ອະນຸມັດແລ້ວ</option>
              <option value="rejected">ປະຕິເສດ</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຄົ້ນຫາ</label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ລະຫັດອໍເດີ / ບິນໂຮງງານ / ຜູ້ຂໍ / ເຫດຜົນ" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-50 bg-slate-50/50 p-4">
          <div className="text-sm font-bold uppercase tracking-widest text-slate-700">ລາຍການຄຳຂໍ</div>
          <div className="text-xs font-bold text-slate-500">{loading ? "ກຳລັງໂຫຼດ..." : `${filteredRows.length} ລາຍການ`}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-700">
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ວັນທີຂໍ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ປະເພດ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ອໍເດີ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ຜູ້ຂໍ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ເຫດຜົນ</th>
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
                  const approver = usersById[row.approved_by_user_id || row.rejected_by_user_id || ""];
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="p-4 font-medium text-slate-600">{formatDateTime(row.requested_at)}</td>
                      <td className="p-4 font-bold text-slate-700">{ORDER_CHANGE_REQUEST_TYPE_LABELS[row.request_type]}</td>
                      <td className="p-4">
                        <div className="font-black text-slate-900">{order?.order_code || "-"}</div>
                        <div className="text-xs font-medium text-slate-500">{order?.factory_bill_code?.trim() || "-"}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-700">{requester?.full_name || "-"}</div>
                        <div className="text-xs text-slate-500">{requester?.role || "-"}</div>
                      </td>
                      <td className="p-4">
                        <div className="max-w-[320px] whitespace-pre-wrap font-medium text-slate-600">{row.request_reason}</div>
                        {row.decision_note ? <div className="mt-2 text-xs font-bold text-rose-600">ໝາຍເຫດຜູ້ອະນຸມັດ: {row.decision_note}</div> : null}
                        {approver ? <div className="mt-2 text-xs font-medium text-slate-400">ຜູ້ຕັດສິນ: {approver.full_name}</div> : null}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${ORDER_CHANGE_REQUEST_STATUS_STYLES[row.status]}`}>
                          {ORDER_CHANGE_REQUEST_STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {viewerRole && canApproveOrderChangeRequest(viewerRole) && row.status === "submitted" ? (
                            <>
                              <button onClick={() => void handleApprove(row)} disabled={workingId === row.id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
                                <CheckCircle2 size={14} />
                                {workingId === row.id ? "ກຳລັງອະນຸມັດ..." : "ອະນຸມັດ"}
                              </button>
                              <button onClick={() => void handleReject(row)} disabled={workingId === row.id} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">
                                <XCircle size={14} />
                                ປະຕິເສດ
                              </button>
                            </>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">{row.status === "submitted" ? "ລໍຖ້າຜູ້ອະນຸມັດ" : "ດຳເນີນການແລ້ວ"}</span>
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
