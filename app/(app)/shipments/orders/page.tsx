"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ClipboardCheck, MessageCircleMore } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { canAccessPath, type AppRole } from "@/lib/access-control";
import {
  canSubmitOrderChangeRequest,
  ORDER_CHANGE_REQUEST_STATUS_LABELS,
  ORDER_CHANGE_REQUEST_STATUS_STYLES,
  type OrderChangeRequestRow,
} from "@/lib/order-change-requests";
import { getTotalShirtQty } from "@/lib/order-quantities";
import { WhatsappMessageModal } from "../../_components/whatsapp-message-modal";
import { buildShipmentCompletedWhatsappMessage, getWhatsappContactOptions } from "@/lib/whatsapp";

type ShipmentRecordRow = {
  id: string;
  order_id: string;
  shipped_at: string;
  shipped_by: string;
  note: string | null;
  collected_amount: number | null;
  payment_method: "cash" | "transfer" | null;
};

type OrderRow = {
  id: string;
  order_code: string;
  customer_phone: string | null;
  customer_whatsapp: string | null;
  factory_bill_code: string | null;
  fabric_name: string;
  net_total: number;
  balance: number;
  status: "in_progress" | "completed";
  production_completed_at: string | null;
  shipment_status: "pending" | "shipped";
  shipment_completed_at: string | null;
  closed_at: string | null;
  short_qty: number;
  long_qty: number;
  free_qty: number;
  qty_3xl: number;
  qty_4xl: number;
  qty_5xl: number;
};

type ShippedOrderRow = {
  shipmentId: string;
  orderId: string;
  shippedAt: string;
  shippedBy: string;
  shipmentNote: string | null;
  collectedAmount: number;
  paymentMethod: ShipmentRecordRow["payment_method"];
  orderCode: string;
  customerPhone: string | null;
  customerWhatsapp: string | null;
  factoryBillCode: string | null;
  fabricName: string;
  netTotal: number;
  balance: number;
  status: OrderRow["status"];
  productionCompletedAt: string | null;
  shipmentStatus: OrderRow["shipment_status"];
  shipmentCompletedAt: string | null;
  closedAt: string | null;
  totalQty: number;
};

type PhoneFilter = "all" | "has_phone" | "no_phone";
type PaymentFilter = "all" | "cash" | "transfer" | "none";

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

function formatMoney(value: number) {
  return (Number(value) || 0).toLocaleString();
}

function getPaymentLabel(method: ShipmentRecordRow["payment_method"]) {
  if (method === "cash") return "ເງິນສົດ";
  if (method === "transfer") return "ໂອນເງິນ";
  return "ບໍ່ມີການຮັບເງິນ";
}

function toLocalDateInputValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function getUtcIsoRangeForLocalDate(dateInput: string, boundary: "start" | "end") {
  if (!dateInput) return null;
  const time = boundary === "start" ? "T00:00:00.000" : "T23:59:59.999";
  const localDate = new Date(`${dateInput}${time}`);
  if (Number.isNaN(localDate.getTime())) return null;
  return localDate.toISOString();
}

export default function ShipmentOrdersPage() {
  const today = useMemo(() => toLocalDateInputValue(), []);
  const [rows, setRows] = useState<ShippedOrderRow[]>([]);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeWhatsappRow, setActiveWhatsappRow] = useState<ShippedOrderRow | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [requestMap, setRequestMap] = useState<Record<string, OrderChangeRequestRow>>({});
  const [requestingOrderId, setRequestingOrderId] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [shippedBy, setShippedBy] = useState("");
  const [phoneFilter, setPhoneFilter] = useState<PhoneFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = async () => {
    setLoading(true);
    setErr(null);

    const [{ data: sessionData }, { data: userData, error: userError }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from("users").select("id,auth_user_id,email,role").eq("is_active", true),
    ]);

    if (userError) {
      setErr(userError.message);
      setRows([]);
      setFilteredTotal(0);
      setLoading(false);
      return;
    }

    const authUserId = sessionData.session?.user.id ?? null;
    const sessionEmail = String(sessionData.session?.user.email || "").trim().toLowerCase();
    const currentUser =
      (((userData ?? []) as Array<{ id: string; auth_user_id: string | null; email?: string | null; role: AppRole }>).find(
        (item) =>
          item.auth_user_id === authUserId ||
          (!!sessionEmail && String(item.email || "").trim().toLowerCase() === sessionEmail)
      ) as
        | { id: string; role: AppRole }
        | undefined) || null;
    setViewerRole(currentUser?.role ?? null);
    setViewerUserId(currentUser?.id ?? null);

    let shipmentQuery = supabase
      .from("shipment_records")
      .select("id,order_id,shipped_at,shipped_by,note,collected_amount,payment_method")
      .order("shipped_at", { ascending: false });

    const fromDateUtc = getUtcIsoRangeForLocalDate(fromDate, "start");
    const toDateUtc = getUtcIsoRangeForLocalDate(toDate, "end");
    if (fromDateUtc) shipmentQuery = shipmentQuery.gte("shipped_at", fromDateUtc);
    if (toDateUtc) shipmentQuery = shipmentQuery.lte("shipped_at", toDateUtc);

    const { data: shipmentData, error: shipmentError } = await shipmentQuery;
    if (shipmentError) {
      setErr(shipmentError.message);
      setRows([]);
      setFilteredTotal(0);
      setLoading(false);
      return;
    }

    const shipmentRows = ((shipmentData ?? []) as ShipmentRecordRow[]).filter((shipment) => {
      const keyword = shippedBy.trim().toLowerCase();
      return !keyword || shipment.shipped_by.toLowerCase().includes(keyword);
    });

    if (shipmentRows.length === 0) {
      setRows([]);
      setFilteredTotal(0);
      setLoading(false);
      return;
    }

    const orderIds = [...new Set(shipmentRows.map((shipment) => shipment.order_id))];
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id,order_code,customer_phone,customer_whatsapp,factory_bill_code,fabric_name,net_total,balance,status,production_completed_at,shipment_status,shipment_completed_at,closed_at,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl")
      .in("id", orderIds);

    if (orderError) {
      setErr(orderError.message);
      setRows([]);
      setFilteredTotal(0);
      setLoading(false);
      return;
    }

    const orderById = new Map(((orderData ?? []) as OrderRow[]).map((order) => [order.id, order]));
    const search = query.trim().toLowerCase();

    const mergedRows = shipmentRows
      .map((shipment) => {
        const order = orderById.get(shipment.order_id);
        if (!order) return null;

        return {
          shipmentId: shipment.id,
          orderId: order.id,
          shippedAt: shipment.shipped_at,
          shippedBy: shipment.shipped_by,
          shipmentNote: shipment.note,
          collectedAmount: Number(shipment.collected_amount) || 0,
          paymentMethod: shipment.payment_method,
          orderCode: order.order_code,
          customerPhone: order.customer_phone,
          customerWhatsapp: order.customer_whatsapp,
          factoryBillCode: order.factory_bill_code,
          fabricName: order.fabric_name,
          netTotal: Number(order.net_total) || 0,
          balance: Number(order.balance) || 0,
          status: order.status,
          productionCompletedAt: order.production_completed_at,
          shipmentStatus: order.shipment_status,
          shipmentCompletedAt: order.shipment_completed_at,
          closedAt: order.closed_at,
          totalQty: getTotalShirtQty(order),
        } satisfies ShippedOrderRow;
      })
      .filter((row): row is ShippedOrderRow => row !== null)
      .filter((row) => {
        const hasPhone = getWhatsappContactOptions(row.customerPhone, row.customerWhatsapp).length > 0;
        if (phoneFilter === "has_phone" && !hasPhone) return false;
        if (phoneFilter === "no_phone" && hasPhone) return false;
        if (paymentFilter === "cash" && row.paymentMethod !== "cash") return false;
        if (paymentFilter === "transfer" && row.paymentMethod !== "transfer") return false;
        if (paymentFilter === "none" && row.collectedAmount > 0) return false;
        if (!search) return true;
        return [
          row.orderCode,
          row.factoryBillCode ?? "",
          row.customerPhone ?? "",
          row.customerWhatsapp ?? "",
          row.shippedBy,
          row.shipmentNote ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .sort((a, b) => new Date(b.shippedAt).getTime() - new Date(a.shippedAt).getTime());

    const from = (page - 1) * pageSize;
    const pagedRows = mergedRows.slice(from, from + pageSize);
    setFilteredTotal(mergedRows.length);
    setRows(pagedRows);

    const pagedOrderIds = [...new Set(pagedRows.map((row) => row.orderId))];
    if (pagedOrderIds.length === 0) {
      setRequestMap({});
      setLoading(false);
      return;
    }

    const { data: requestData, error: requestError } = await supabase
      .from("order_change_requests")
      .select("*")
      .eq("request_type", "cancel_shipment")
      .in("order_id", pagedOrderIds)
      .order("requested_at", { ascending: false });

    if (requestError) {
      setErr(requestError.message);
      setLoading(false);
      return;
    }

    const nextRequestMap: Record<string, OrderChangeRequestRow> = {};
    ((requestData ?? []) as OrderChangeRequestRow[]).forEach((request) => {
      if (!nextRequestMap[request.order_id]) nextRequestMap[request.order_id] = request;
    });
    setRequestMap(nextRequestMap);
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const hasNextPage = page * pageSize < filteredTotal;

  const runSearch = () => {
    setPage(1);
    setTimeout(() => void load(), 0);
  };

  const resetAll = () => {
    setFromDate(today);
    setToDate(today);
    setShippedBy("");
    setPhoneFilter("all");
    setPaymentFilter("all");
    setQuery("");
    setPage(1);
    setTimeout(() => void load(), 0);
  };

  const displayStatusBadge = (row: ShippedOrderRow) => {
    if (row.status === "completed" || row.closedAt) {
      return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">ສຳເລັດແລ້ວ</span>;
    }
    if (row.shipmentStatus === "shipped" || row.shipmentCompletedAt) {
      return <span className="rounded-full border border-orange-200 bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">ຈັດສົ່ງແລ້ວ</span>;
    }
    if (row.productionCompletedAt) {
      return <span className="rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">ນຳເຂົ້າແລ້ວ</span>;
    }
    return <span className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">ລໍຖ້າດຳເນີນການ</span>;
  };

  const activeWhatsappOptions = activeWhatsappRow
    ? getWhatsappContactOptions(activeWhatsappRow.customerPhone, activeWhatsappRow.customerWhatsapp)
    : [];

  const activeWhatsappMessage = activeWhatsappRow
    ? buildShipmentCompletedWhatsappMessage({
        orderCode: activeWhatsappRow.orderCode,
        totalQty: activeWhatsappRow.totalQty,
        balance: activeWhatsappRow.balance,
      })
    : "";

  const handleSubmitRequest = async (row: ShippedOrderRow) => {
    if (!viewerRole || !viewerUserId || !canSubmitOrderChangeRequest(viewerRole)) {
      toast.error("ທ່ານບໍ່ມີສິດສົ່ງຄຳຂໍ");
      return;
    }
    const reason = window.prompt(`ລະບຸເຫດຜົນຂໍຍົກເລີກຈັດສົ່ງ ${row.orderCode}`, "")?.trim();
    if (!reason) return;

    setRequestingOrderId(row.orderId);
    try {
      const { error } = await supabase.from("order_change_requests").insert({
        order_id: row.orderId,
        request_type: "cancel_shipment",
        target_shipment_id: row.shipmentId,
        request_reason: reason,
        requested_by_user_id: viewerUserId,
      });
      if (error) throw error;
      toast.success("ສົ່ງຄຳຂໍອະນຸມັດແລ້ວ");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ສົ່ງຄຳຂໍບໍ່ສຳເລັດ");
    } finally {
      setRequestingOrderId(null);
    }
  };

  return (
    <div className="text-slate-900 antialiased">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-800">
            <ClipboardCheck size={24} className="text-orange-600" />
            ລາຍການອໍເດີຈັດສົ່ງແລ້ວ
          </h1>
          <div className="text-sm font-medium text-slate-500">ເບິ່ງອໍເດີທີ່ຖືກຈັດສົ່ງແລ້ວ ເພື່ອຕິດຕາມ, ຄົ້ນຫາ, ແລະ ແຈ້ງລູກຄ້າ</div>
        </div>
        <Link href="/shipments" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700">
          ໄປໜ້າຈັດສົ່ງ
        </Link>
      </div>

      {err ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

      <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-6">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຈາກວັນທີຈັດສົ່ງ</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຫາວັນທີຈັດສົ່ງ</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຜູ້ຈັດສົ່ງ</label>
            <input value={shippedBy} onChange={(e) => setShippedBy(e.target.value)} placeholder="ຊື່ພະນັກງານ" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-all placeholder-slate-300 focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ເບີລູກຄ້າ</label>
            <select value={phoneFilter} onChange={(e) => setPhoneFilter(e.target.value as PhoneFilter)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-orange-500">
              <option value="all">ທັງໝົດ</option>
              <option value="has_phone">ມີເບີ</option>
              <option value="no_phone">ບໍ່ມີເບີ</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ການຮັບເງິນ</label>
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-orange-500">
              <option value="all">ທັງໝົດ</option>
              <option value="cash">ເງິນສົດ</option>
              <option value="transfer">ໂອນເງິນ</option>
              <option value="none">ບໍ່ມີການຮັບເງິນ</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຄົ້ນຫາ</label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ລະຫັດອໍເດີ / ບິນໂຮງງານ / ເບີ / ໝາຍເຫດ" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-all placeholder-slate-300 focus:ring-2 focus:ring-orange-500" />
          </div>
          <div className="mt-2 flex gap-2 md:col-span-6">
            <button onClick={runSearch} className="rounded-lg bg-orange-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700">ຄົ້ນຫາ</button>
            <button onClick={resetAll} className="rounded-lg border border-slate-200 bg-slate-100 px-6 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-200">ລ້າງ</button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-50 bg-slate-50/50 p-4">
          <div className="text-sm font-bold uppercase tracking-widest text-slate-700">ລາຍການອໍເດີຈັດສົ່ງແລ້ວ</div>
          <div className="text-xs font-bold text-slate-500">{loading ? "ກຳລັງໂຫຼດ..." : `ສະແດງ ${rows.length} / ${filteredTotal} ລາຍການ`}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-700">
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ວັນທີຈັດສົ່ງ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ຜູ້ຈັດສົ່ງ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ລະຫັດອໍເດີ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ບິນໂຮງງານ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ເບີໂທ / WhatsApp</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ຜ້າ</th>
                <th className="p-4 text-right text-[14px] font-bold uppercase tracking-widest">ຍອດຮັບເງິນ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ວິທີຮັບເງິນ</th>
                <th className="p-4 text-right text-[14px] font-bold uppercase tracking-widest">ຍອດຄ້າງ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ໝາຍເຫດ</th>
                <th className="p-4 text-center text-[14px] font-bold uppercase tracking-widest">ສະຖານະ</th>
                <th className="p-4 text-center text-[14px] font-bold uppercase tracking-widest">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="p-10 text-center font-medium text-slate-400" colSpan={12}>
                    ບໍ່ພົບອໍເດີທີ່ຈັດສົ່ງໃນເງື່ອນໄຂນີ້
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={`${row.shipmentId}-${row.orderId}`} className="transition-colors hover:bg-slate-50/80">
                    <td className="whitespace-nowrap p-4 font-medium text-slate-600">{formatDateTime(row.shippedAt)}</td>
                    <td className="p-4 font-semibold text-slate-700">{row.shippedBy}</td>
                    <td className="p-4 font-bold text-slate-700">{row.orderCode}</td>
                    <td className="p-4 text-slate-500">{row.factoryBillCode?.trim() ? row.factoryBillCode : "-"}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-700">
                          {row.customerPhone?.trim() ? row.customerPhone : row.customerWhatsapp?.trim() ? row.customerWhatsapp : "-"}
                        </span>
                        {getWhatsappContactOptions(row.customerPhone, row.customerWhatsapp).length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setActiveWhatsappRow(row)}
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                          >
                            <MessageCircleMore size={14} />
                            ເປີດແຊັດ
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">ບໍ່ມີເບີ</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 font-medium text-slate-600">{row.fabricName}</td>
                    <td className="p-4 text-right font-bold text-emerald-700">{formatMoney(row.collectedAmount)}</td>
                    <td className="p-4 text-slate-500">{getPaymentLabel(row.paymentMethod)}</td>
                    <td className="bg-rose-50/30 p-4 text-right font-bold text-rose-600">{formatMoney(row.balance)}</td>
                    <td className="max-w-48 truncate p-4 text-slate-500" title={row.shipmentNote ?? ""}>{row.shipmentNote?.trim() ? row.shipmentNote : "-"}</td>
                    <td className="p-4 text-center">{displayStatusBadge(row)}</td>
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center gap-2">
                        {viewerRole && canAccessPath(`/orders/${row.orderId}/edit`, viewerRole) ? (
                          <Link href={`/orders/${row.orderId}/edit`} className="font-bold text-blue-600 underline-offset-4 transition-all hover:text-blue-800 hover:underline">
                            ເປີດອໍເດີ
                          </Link>
                        ) : null}
                        {requestMap[row.orderId] ? (
                          <span className={`rounded-full px-3 py-1 text-[11px] font-black ${ORDER_CHANGE_REQUEST_STATUS_STYLES[requestMap[row.orderId].status]}`}>
                            {ORDER_CHANGE_REQUEST_STATUS_LABELS[requestMap[row.orderId].status]}
                          </span>
                        ) : viewerRole && canSubmitOrderChangeRequest(viewerRole) && viewerUserId && row.shipmentStatus === "shipped" && row.status !== "completed" && !row.closedAt ? (
                          <button
                            type="button"
                            onClick={() => void handleSubmitRequest(row)}
                            disabled={requestingOrderId === row.orderId}
                            className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                          >
                            {requestingOrderId === row.orderId ? "ກຳລັງສົ່ງ..." : "ສົ່ງຄຳຂໍຍົກເລີກ"}
                          </button>
                        ) : (
                          <span className="text-[11px] font-bold text-slate-400">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 p-4">
          <div className="text-xs font-bold uppercase tracking-tighter text-slate-400">ຊ່ວງວັນທີຈັດສົ່ງ: {fromDate || "-"} - {toDate || "-"}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ກ່ອນໜ້າ
            </button>
            <div className="min-w-[90px] text-center text-sm font-bold text-slate-500">ໜ້າ {page}</div>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNextPage}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ໜ້າຕໍ່ໄປ
            </button>
          </div>
        </div>
      </div>

      <WhatsappMessageModal
        open={Boolean(activeWhatsappRow)}
        title={activeWhatsappRow ? `ແຈ້ງລູກຄ້າອໍເດີ ${activeWhatsappRow.orderCode}` : ""}
        phoneOptions={activeWhatsappOptions}
        initialPhone={activeWhatsappOptions[0]?.value || ""}
        message={activeWhatsappMessage}
        onClose={() => setActiveWhatsappRow(null)}
      />
    </div>
  );
}
