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
import { WhatsappMessageModal } from "../../_components/whatsapp-message-modal";
import { buildProductionCompletedWhatsappMessage, getWhatsappContactOptions } from "@/lib/whatsapp";

type ReceiptRow = { id: string; received_at: string; received_by: string; note: string | null };
type ReceiptItemRow = { receipt_id: string; order_id: string };
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

type ImportedOrderRow = {
  receiptId: string;
  orderId: string;
  receivedAt: string;
  receivedBy: string;
  receiptNote: string | null;
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

function formatDateTime(value: string) {
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

export default function FactoryReceiptOrdersPage() {
  const today = useMemo(() => toLocalDateInputValue(), []);
  const [rows, setRows] = useState<ImportedOrderRow[]>([]);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeWhatsappRow, setActiveWhatsappRow] = useState<ImportedOrderRow | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [requestMap, setRequestMap] = useState<Record<string, OrderChangeRequestRow>>({});
  const [requestingOrderId, setRequestingOrderId] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [receivedBy, setReceivedBy] = useState("");
  const [phoneFilter, setPhoneFilter] = useState<PhoneFilter>("all");
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

    let receiptQuery = supabase.from("factory_receipts").select("id,received_at,received_by,note").order("received_at", { ascending: false });
    const fromDateUtc = getUtcIsoRangeForLocalDate(fromDate, "start");
    const toDateUtc = getUtcIsoRangeForLocalDate(toDate, "end");
    if (fromDateUtc) receiptQuery = receiptQuery.gte("received_at", fromDateUtc);
    if (toDateUtc) receiptQuery = receiptQuery.lte("received_at", toDateUtc);

    const { data: receiptData, error: receiptError } = await receiptQuery;
    if (receiptError) {
      setErr(receiptError.message);
      setRows([]);
      setFilteredTotal(0);
      setLoading(false);
      return;
    }

    const receiptRows = ((receiptData ?? []) as ReceiptRow[]).filter((receipt) => {
      const keyword = receivedBy.trim().toLowerCase();
      return !keyword || receipt.received_by.toLowerCase().includes(keyword);
    });

    if (receiptRows.length === 0) {
      setRows([]);
      setFilteredTotal(0);
      setLoading(false);
      return;
    }

    const receiptIds = receiptRows.map((receipt) => receipt.id);
    const { data: itemData, error: itemError } = await supabase.from("factory_receipt_items").select("receipt_id,order_id").in("receipt_id", receiptIds);
    if (itemError) {
      setErr(itemError.message);
      setRows([]);
      setFilteredTotal(0);
      setLoading(false);
      return;
    }

    const itemRows = (itemData ?? []) as ReceiptItemRow[];
    if (itemRows.length === 0) {
      setRows([]);
      setFilteredTotal(0);
      setLoading(false);
      return;
    }

    const orderIds = [...new Set(itemRows.map((item) => item.order_id))];
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

    const receiptById = new Map(receiptRows.map((receipt) => [receipt.id, receipt]));
    const orderById = new Map(((orderData ?? []) as OrderRow[]).map((order) => [order.id, order]));
    const search = query.trim().toLowerCase();

    const mergedRows = itemRows
      .map((item) => {
        const receipt = receiptById.get(item.receipt_id);
        const order = orderById.get(item.order_id);
        if (!receipt || !order) return null;

        return {
          receiptId: receipt.id,
          orderId: order.id,
          receivedAt: receipt.received_at,
          receivedBy: receipt.received_by,
          receiptNote: receipt.note,
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
          totalQty:
            (Number(order.short_qty) || 0) +
            (Number(order.long_qty) || 0) +
            (Number(order.free_qty) || 0) +
            (Number(order.qty_3xl) || 0) +
            (Number(order.qty_4xl) || 0) +
            (Number(order.qty_5xl) || 0),
        } satisfies ImportedOrderRow;
      })
      .filter((row): row is ImportedOrderRow => row !== null)
      .filter((row) => {
        const hasPhone = getWhatsappContactOptions(row.customerPhone, row.customerWhatsapp).length > 0;
        if (phoneFilter === "has_phone" && !hasPhone) return false;
        if (phoneFilter === "no_phone" && hasPhone) return false;
        if (!search) return true;
        return [row.orderCode, row.factoryBillCode ?? "", row.customerPhone ?? "", row.customerWhatsapp ?? "", row.receivedBy, row.receiptNote ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

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
      .eq("request_type", "cancel_factory_receipt")
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
    setReceivedBy("");
    setPhoneFilter("all");
    setQuery("");
    setPage(1);
    setTimeout(() => void load(), 0);
  };

  const displayStatusBadge = (row: ImportedOrderRow) => {
    if (row.status === "completed" || row.closedAt) return <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">ສຳເລັດແລ້ວ</span>;
    if (row.shipmentStatus === "shipped" || row.shipmentCompletedAt) return <span className="px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-bold border border-sky-200">ຈັດສົ່ງແລ້ວ</span>;
    if (row.productionCompletedAt) return <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200">ນຳເຂົ້າແລ້ວ</span>;
    return <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">ລໍຖ້າດຳເນີນການ</span>;
  };

  const activeWhatsappOptions = activeWhatsappRow
    ? getWhatsappContactOptions(activeWhatsappRow.customerPhone, activeWhatsappRow.customerWhatsapp)
    : [];

  const handleSubmitRequest = async (row: ImportedOrderRow) => {
    if (!viewerRole || !viewerUserId || !canSubmitOrderChangeRequest(viewerRole)) {
      toast.error("ທ່ານບໍ່ມີສິດສົ່ງຄຳຂໍ");
      return;
    }
    const reason = window.prompt(`ລະບຸເຫດຜົນຂໍຍົກເລີກນຳເຂົ້າ ${row.orderCode}`, "")?.trim();
    if (!reason) return;

    setRequestingOrderId(row.orderId);
    try {
      const { error } = await supabase.from("order_change_requests").insert({
        order_id: row.orderId,
        request_type: "cancel_factory_receipt",
        target_receipt_id: row.receiptId,
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
            <ClipboardCheck size={24} className="text-emerald-600" />
            ລາຍການອໍເດີທີ່ນຳເຂົ້າແລ້ວ
          </h1>
          <div className="text-sm font-medium text-slate-500">ເບິ່ງອໍເດີທີ່ສະແກນຮັບເຂົ້າແລ້ວ ເພື່ອຕິດຕາມ ແລະ ແຈ້ງລູກຄ້າ</div>
        </div>
        <Link href="/factory-receipts" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700">
          ໄປໜ້າຮັບສິນຄ້າເຂົ້າ
        </Link>
      </div>

      {err ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

      <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-6">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຈາກວັນທີຮັບເຂົ້າ</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຫາວັນທີຮັບເຂົ້າ</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຜູ້ນຳເຂົ້າ</label>
            <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="ຊື່ພະນັກງານ" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-all placeholder-slate-300 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ເບີລູກຄ້າ</label>
            <select value={phoneFilter} onChange={(e) => setPhoneFilter(e.target.value as PhoneFilter)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500">
              <option value="all">ທັງໝົດ</option>
              <option value="has_phone">ມີເບີ</option>
              <option value="no_phone">ບໍ່ມີເບີ</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຄົ້ນຫາ</label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ລະຫັດອໍເດີ / ບິນໂຮງງານ / ເບີ / ໝາຍເຫດ" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-all placeholder-slate-300 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="mt-2 flex gap-2 md:col-span-6">
            <button onClick={runSearch} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700">ຄົ້ນຫາ</button>
            <button onClick={resetAll} className="rounded-lg border border-slate-200 bg-slate-100 px-6 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-200">ລ້າງ</button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-50 bg-slate-50/50 p-4">
          <div className="text-sm font-bold uppercase tracking-widest text-slate-700">ລາຍການອໍເດີທີ່ນຳເຂົ້າແລ້ວ</div>
          <div className="text-xs font-bold text-slate-500">{loading ? "ກຳລັງໂຫຼດ..." : `ສະແດງ ${rows.length} / ${filteredTotal} ລາຍການ`}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-700">
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ວັນທີຮັບເຂົ້າ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ຜູ້ນຳເຂົ້າ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ລະຫັດອໍເດີ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ບິນໂຮງງານ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ເບີໂທ / WhatsApp</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ຜ້າ</th>
                <th className="p-4 text-right text-[14px] font-bold uppercase tracking-widest">ຍອດສຸດທິ</th>
                <th className="p-4 text-right text-[14px] font-bold uppercase tracking-widest">ຄ້າງ</th>
                <th className="p-4 text-left text-[14px] font-bold uppercase tracking-widest">ໝາຍເຫດ</th>
                <th className="p-4 text-center text-[14px] font-bold uppercase tracking-widest">ສະຖານະ</th>
                <th className="p-4 text-center text-[14px] font-bold uppercase tracking-widest">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="p-10 text-center font-medium text-slate-400" colSpan={11}>
                    ບໍ່ພົບອໍເດີທີ່ນຳເຂົ້າໃນເງື່ອນໄຂນີ້
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={`${row.receiptId}-${row.orderId}`} className="transition-colors hover:bg-slate-50/80">
                    <td className="whitespace-nowrap p-4 font-medium text-slate-600">{formatDateTime(row.receivedAt)}</td>
                    <td className="p-4 font-semibold text-slate-700">{row.receivedBy}</td>
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
                    <td className="p-4 text-right font-bold text-slate-600">{row.netTotal.toLocaleString()}</td>
                    <td className="bg-rose-50/30 p-4 text-right font-bold text-rose-600">{row.balance.toLocaleString()}</td>
                    <td className="max-w-48 truncate p-4 text-slate-500" title={row.receiptNote ?? ""}>{row.receiptNote?.trim() ? row.receiptNote : "-"}</td>
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
                        ) : viewerRole && canSubmitOrderChangeRequest(viewerRole) && viewerUserId && row.productionCompletedAt && row.status !== "completed" && row.shipmentStatus !== "shipped" ? (
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
          <div className="text-xs font-bold uppercase tracking-tighter text-slate-400">ຊ່ວງວັນທີຮັບເຂົ້າ: {fromDate || "-"} - {toDate || "-"}</div>
          <div className="flex gap-2">
            <button className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← ກ່ອນໜ້າ</button>
            <button className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)}>ຖັດໄປ →</button>
          </div>
        </div>
      </div>

      <WhatsappMessageModal
        key={activeWhatsappRow ? `${activeWhatsappRow.receiptId}-${activeWhatsappRow.orderId}-${activeWhatsappRow.balance}` : "closed"}
        open={Boolean(activeWhatsappRow)}
        title={activeWhatsappRow ? `ແຈ້ງລູກຄ້າອໍເດີ ${activeWhatsappRow.orderCode}` : undefined}
        message={
          activeWhatsappRow
            ? buildProductionCompletedWhatsappMessage({
                orderCode: activeWhatsappRow.orderCode,
                totalQty: activeWhatsappRow.totalQty,
                balance: activeWhatsappRow.balance,
              })
            : ""
        }
        phoneOptions={activeWhatsappOptions}
        initialPhone={activeWhatsappOptions[0]?.value}
        onClose={() => setActiveWhatsappRow(null)}
      />
    </div>
  );
}
