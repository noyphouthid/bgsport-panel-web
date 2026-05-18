"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileDown, Printer, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import {
  SHIPMENT_DELIVERY_METHOD_LABELS,
  SHIPMENT_DELIVERY_STATUS_LABELS,
  SHIPMENT_DELIVERY_STATUS_STYLES,
  type ShipmentDeliveryMethod,
  type ShipmentDeliveryRequestRow,
  type ShipmentDeliveryStatus,
} from "@/lib/shipment-delivery-requests";
import { exportReportDocumentAsPdf, openReportPrintWindow } from "../_lib";

type OrderRow = {
  id: string;
  order_code: string;
  factory_bill_code: string | null;
  customer_phone: string | null;
  customer_whatsapp: string | null;
  admin_user_id: string | null;
};

type UserRow = {
  id: string;
  full_name: string;
  role: AppRole;
};

type StatusFilter = ShipmentDeliveryStatus | "all";
type MethodFilter = ShipmentDeliveryMethod | "all";
type PaymentFilter = "all" | "settled" | "partial" | "unpaid";

type ReportRow = ShipmentDeliveryRequestRow & {
  order_code: string;
  factory_bill_code: string | null;
  customer_phone: string | null;
  customer_whatsapp: string | null;
  admin_user_id: string | null;
  requested_by_name: string;
  admin_name: string;
  receiver_summary: string;
  transporter_summary: string;
};

function toLocalDateInputValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function toMonthStartInputValue(date = new Date()) {
  return toLocalDateInputValue(new Date(date.getFullYear(), date.getMonth(), 1));
}

function getUtcIsoRangeForLocalDate(dateInput: string, boundary: "start" | "end") {
  if (!dateInput) return null;
  const time = boundary === "start" ? "T00:00:00.000" : "T23:59:59.999";
  const localDate = new Date(`${dateInput}${time}`);
  if (Number.isNaN(localDate.getTime())) return null;
  return localDate.toISOString();
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
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

function normalizeDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function getPaymentStatus(row: Pick<ShipmentDeliveryRequestRow, "payment_amount" | "payment_outstanding_amount">): Exclude<PaymentFilter, "all"> {
  const paid = Number(row.payment_amount) || 0;
  const outstanding = Number(row.payment_outstanding_amount) || 0;
  if (outstanding <= 0) return "settled";
  if (paid > 0) return "partial";
  return "unpaid";
}

function getPaymentStatusLabel(status: Exclude<PaymentFilter, "all">) {
  if (status === "settled") return "ຈ່າຍຄົບແລ້ວ";
  if (status === "partial") return "ຈ່າຍບາງສ່ວນ";
  return "ຍັງບໍ່ຮັບເງິນ";
}

function matchesSearch(row: ReportRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const queryDigits = normalizeDigits(query);

  const textHaystacks = [
    row.request_no,
    row.order_code,
    row.factory_bill_code || "",
    row.delivery_person_name,
    row.customer_phone || "",
    row.customer_whatsapp || "",
    row.transport_receiver_name || "",
    row.transport_receiver_phone || "",
    row.transport_branch || "",
    row.transport_city || "",
    row.transport_province || "",
    row.transport_providers.join(" "),
    row.requested_by_name,
    row.admin_name,
    row.note || "",
  ].map((value) => String(value || "").toLowerCase());

  if (textHaystacks.some((value) => value.includes(normalizedQuery))) return true;
  if (!queryDigits) return false;

  const digitHaystacks = [
    row.request_no,
    row.order_code,
    row.factory_bill_code,
    row.customer_phone,
    row.customer_whatsapp,
    row.transport_receiver_phone,
  ].map(normalizeDigits);

  return digitHaystacks.some((value) => value.includes(queryDigits));
}

export default function CustomerDeliveryReportPage() {
  const today = useMemo(() => toLocalDateInputValue(), []);
  const monthStart = useMemo(() => toMonthStartInputValue(), []);

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [requesterOptions, setRequesterOptions] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [requesterFilter, setRequesterFilter] = useState("all");
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setErr(null);

    const [{ data: requestData, error: requestError }, { data: userData, error: userError }] = await Promise.all([
      supabase
        .from("shipment_delivery_requests")
        .select(
          "id,request_no,order_id,qr_label_id,delivery_method,status,requested_by_user_id,delivery_scheduled_at,delivery_person_name,note,payment_outstanding_amount,payment_amount,payment_method,payment_paid_at,transport_receiver_name,transport_receiver_phone,transport_branch,transport_city,transport_province,transport_providers,transport_charge_mode,approved_at,approved_by_user_id,delivered_at,delivered_by_user_id,rejected_at,rejected_by_user_id,rejection_note,created_at,updated_at"
        )
        .order("delivery_scheduled_at", { ascending: false }),
      supabase.from("users").select("id,full_name,role").order("full_name", { ascending: true }),
    ]);

    if (requestError) {
      setErr(requestError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    if (userError) {
      setErr(userError.message);
      setRequesterOptions([]);
    } else {
      setRequesterOptions((userData ?? []) as UserRow[]);
    }

    const requestRows = (requestData ?? []) as ShipmentDeliveryRequestRow[];
    const userMap = new Map(((userData ?? []) as UserRow[]).map((user) => [user.id, user]));
    const orderIds = [...new Set(requestRows.map((row) => row.order_id).filter(Boolean))];

    let ordersById = new Map<string, OrderRow>();
    if (orderIds.length > 0) {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id,order_code,factory_bill_code,customer_phone,customer_whatsapp,admin_user_id")
        .in("id", orderIds);

      if (orderError) {
        setErr(orderError.message);
        setRows([]);
        setLoading(false);
        return;
      }

      ordersById = new Map(((orderData ?? []) as OrderRow[]).map((order) => [order.id, order]));
    }

    const mergedRows = requestRows.map((row) => {
      const order = ordersById.get(row.order_id);
      const requestedBy = row.requested_by_user_id ? userMap.get(row.requested_by_user_id) : null;
      const adminUser = order?.admin_user_id ? userMap.get(order.admin_user_id) : null;
      const receiverSummary =
        row.delivery_method === "transport"
          ? [row.transport_receiver_name, row.transport_receiver_phone].filter(Boolean).join(" • ") || "-"
          : row.delivery_person_name || "-";
      const transporterSummary =
        row.delivery_method === "transport" ? row.transport_providers.join(", ") || "-" : SHIPMENT_DELIVERY_METHOD_LABELS.pickup;

      return {
        ...row,
        order_code: order?.order_code || "-",
        factory_bill_code: order?.factory_bill_code || null,
        customer_phone: order?.customer_phone || null,
        customer_whatsapp: order?.customer_whatsapp || null,
        admin_user_id: order?.admin_user_id || null,
        requested_by_name: requestedBy?.full_name || "-",
        admin_name: adminUser?.full_name || "-",
        receiver_summary: receiverSummary,
        transporter_summary: transporterSummary,
      } satisfies ReportRow;
    });

    setRows(mergedRows);
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const filteredRows = useMemo(() => {
    const fromDateUtc = getUtcIsoRangeForLocalDate(fromDate, "start");
    const toDateUtc = getUtcIsoRangeForLocalDate(toDate, "end");

    return rows.filter((row) => {
      if (fromDateUtc && row.delivery_scheduled_at < fromDateUtc) return false;
      if (toDateUtc && row.delivery_scheduled_at > toDateUtc) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (methodFilter !== "all" && row.delivery_method !== methodFilter) return false;
      if (paymentFilter !== "all" && getPaymentStatus(row) !== paymentFilter) return false;
      if (requesterFilter !== "all" && row.requested_by_user_id !== requesterFilter) return false;
      if (!matchesSearch(row, query)) return false;
      return true;
    });
  }, [fromDate, methodFilter, paymentFilter, query, requesterFilter, rows, statusFilter, toDate]);

  const summary = useMemo(() => {
    const delivered = filteredRows.filter((row) => row.status === "delivered").length;
    const pickup = filteredRows.filter((row) => row.delivery_method === "pickup").length;
    const transport = filteredRows.filter((row) => row.delivery_method === "transport").length;
    const outstandingAmount = filteredRows.reduce((sum, row) => sum + (Number(row.payment_outstanding_amount) || 0), 0);
    const paidAmount = filteredRows.reduce((sum, row) => sum + (Number(row.payment_amount) || 0), 0);

    return {
      total: filteredRows.length,
      delivered,
      pickup,
      transport,
      outstandingAmount,
      paidAmount,
    };
  }, [filteredRows]);

  const dateSummary = `${fromDate || "-"} -> ${toDate || "-"}`;
  const printSummary = [
    { label: "ລາຍການທັງໝົດ", value: summary.total.toLocaleString() },
    { label: "ສົ່ງມອບແລ້ວ", value: summary.delivered.toLocaleString() },
    { label: "ລູກຄ້າຮັບເອງ", value: summary.pickup.toLocaleString() },
    { label: "ຝາກຂົນສົ່ງ", value: summary.transport.toLocaleString() },
  ];

  const exportRows = useMemo(
    () =>
      filteredRows.map((row) => ({
        request_no: row.request_no,
        order_code: row.order_code,
        factory_bill_code: row.factory_bill_code || "",
        customer_phone: row.customer_phone || row.customer_whatsapp || "",
        scheduled_at: formatDateTime(row.delivery_scheduled_at),
        delivery_method: SHIPMENT_DELIVERY_METHOD_LABELS[row.delivery_method],
        receiver: row.receiver_summary,
        transporters: row.transporter_summary,
        paid_amount: Number(row.payment_amount) || 0,
        outstanding_amount: Number(row.payment_outstanding_amount) || 0,
        payment_method:
          row.payment_method === "cash" ? "ເງິນສົດ" : row.payment_method === "transfer" ? "ໂອນເງິນ" : "-",
        payment_status: getPaymentStatusLabel(getPaymentStatus(row)),
        status: SHIPMENT_DELIVERY_STATUS_LABELS[row.status],
        requester: row.requested_by_name,
        note: row.note || "",
      })),
    [filteredRows]
  );

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, "customer_delivery_report");
    XLSX.writeFile(wb, `customer-delivery-report-${fromDate || "all"}-${toDate || "all"}.xlsx`);
  };

  const handlePrint = () => {
    openReportPrintWindow({
      title: "ລາຍງານຈັດສົ່ງລູກຄ້າ",
      subtitle: `ໄລຍະ: ${dateSummary} | ສະຖານະ: ${statusFilter === "all" ? "ທັງໝົດ" : SHIPMENT_DELIVERY_STATUS_LABELS[statusFilter]} | ວິທີສົ່ງ: ${methodFilter === "all" ? "ທັງໝົດ" : SHIPMENT_DELIVERY_METHOD_LABELS[methodFilter]} | ຜູ້ຂໍສົ່ງ: ${requesterFilter === "all" ? "ທັງໝົດ" : requesterOptions.find((item) => item.id === requesterFilter)?.full_name || "-"} | ຄົ້ນຫາ: ${query || "-"}`,
      summary: printSummary,
      headers: ["ເລກຄຳຂໍ", "ອໍເດີ", "ເບີໂທ", "ນັດສົ່ງ", "ວິທີສົ່ງ", "ຜູ້ຮັບ/ຜູ້ມາຮັບ", "ຈ່າຍແລ້ວ", "ຄ້າງ", "ສະຖານະ"],
      rows: filteredRows.map((row) => [
        row.request_no,
        row.order_code,
        row.customer_phone || row.customer_whatsapp || "-",
        formatDateTime(row.delivery_scheduled_at),
        SHIPMENT_DELIVERY_METHOD_LABELS[row.delivery_method],
        row.receiver_summary,
        formatMoney(row.payment_amount),
        formatMoney(row.payment_outstanding_amount),
        SHIPMENT_DELIVERY_STATUS_LABELS[row.status],
      ]),
    });
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportReportDocumentAsPdf(
        {
          title: "ລາຍງານຈັດສົ່ງລູກຄ້າ",
          subtitle: `ໄລຍະ: ${dateSummary} | ສະຖານະ: ${statusFilter === "all" ? "ທັງໝົດ" : SHIPMENT_DELIVERY_STATUS_LABELS[statusFilter]} | ວິທີສົ່ງ: ${methodFilter === "all" ? "ທັງໝົດ" : SHIPMENT_DELIVERY_METHOD_LABELS[methodFilter]} | ສະຖານະການຮັບເງິນ: ${paymentFilter === "all" ? "ທັງໝົດ" : getPaymentStatusLabel(paymentFilter)} | ຄົ້ນຫາ: ${query || "-"}`,
          summary: printSummary,
          headers: ["ເລກຄຳຂໍ", "ອໍເດີ", "ເບີໂທ", "ນັດສົ່ງ", "ວິທີສົ່ງ", "ຜູ້ຮັບ/ຜູ້ມາຮັບ", "ຈ່າຍແລ້ວ", "ຄ້າງ", "ສະຖານະ"],
          rows: filteredRows.map((row) => [
            row.request_no,
            row.order_code,
            row.customer_phone || row.customer_whatsapp || "-",
            formatDateTime(row.delivery_scheduled_at),
            SHIPMENT_DELIVERY_METHOD_LABELS[row.delivery_method],
            row.receiver_summary,
            formatMoney(row.payment_amount),
            formatMoney(row.payment_outstanding_amount),
            SHIPMENT_DELIVERY_STATUS_LABELS[row.status],
          ]),
        },
        `customer-delivery-report-${fromDate || "all"}-${toDate || "all"}.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
          <Truck size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">ລາຍງານຈັດສົ່ງລູກຄ້າ</h1>
          <div className="text-sm font-medium text-slate-500">ສະຫຼຸບຄຳຂໍຈັດສົ່ງ, ວິທີສົ່ງ, ຍອດເງິນ ແລະ ສະຖານະສົ່ງມອບ</div>
        </div>
      </div>

      {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

      <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ສະຖານະທັງໝົດ</option>
            {Object.entries(SHIPMENT_DELIVERY_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as MethodFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ວິທີສົ່ງທັງໝົດ</option>
            {Object.entries(SHIPMENT_DELIVERY_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ການຮັບເງິນທັງໝົດ</option>
            <option value="settled">ຈ່າຍຄົບແລ້ວ</option>
            <option value="partial">ຈ່າຍບາງສ່ວນ</option>
            <option value="unpaid">ຍັງບໍ່ຮັບເງິນ</option>
          </select>
          <select value={requesterFilter} onChange={(e) => setRequesterFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ຜູ້ຂໍສົ່ງທັງໝົດ</option>
            {requesterOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.6fr_1fr]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ຄົ້ນຫາເລກຄຳຂໍ, ອໍເດີ, ເບີໂທ, ຜູ້ຮັບ, ຂົນສົ່ງ"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none"
          />
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">ໄລຍະລາຍງານ: {dateSummary}</div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ລາຍການທັງໝົດ</div>
            <div className="text-xl font-black text-slate-900">{summary.total.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ສົ່ງມອບແລ້ວ</div>
            <div className="text-xl font-black text-emerald-600">{summary.delivered.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ລູກຄ້າຮັບເອງ / ຝາກຂົນສົ່ງ</div>
            <div className="text-xl font-black text-slate-900">
              {summary.pickup.toLocaleString()} / {summary.transport.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ຮັບເງິນ / ຄ້າງຮັບ</div>
            <div className="text-xl font-black text-slate-900">
              {summary.paidAmount.toLocaleString()} / {summary.outstandingAmount.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={handlePrint} disabled={filteredRows.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Printer size={16} />
            ພິມ
          </button>
          <button onClick={handleExportPdf} disabled={filteredRows.length === 0 || exportingPdf} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50">
            <FileDown size={16} />
            {exportingPdf ? "ກຳລັງສ້າງ PDF..." : "ສ້າງ PDF"}
          </button>
          <button onClick={handleExportExcel} disabled={filteredRows.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">
            <Download size={16} />
            ດາວໂຫຼດ XLSX
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b bg-slate-50 p-4 text-sm font-black uppercase text-slate-800">ຕາຕະລາງລາຍງານ ({filteredRows.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-slate-700">
              <tr>
                <th className="p-3 text-left text-xs font-black uppercase">ເລກຄຳຂໍ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ອໍເດີ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ເບີໂທລູກຄ້າ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ນັດສົ່ງ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ວິທີສົ່ງ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ຜູ້ຮັບ/ຜູ້ມາຮັບ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ຂົນສົ່ງ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ຈ່າຍແລ້ວ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ຄ້າງຮັບ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ສະຖານະ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center font-bold text-slate-500" colSpan={10}>
                    ບໍ່ມີຂໍ້ມູນ
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="p-3 font-black text-slate-900">{row.request_no}</td>
                    <td className="p-3 text-slate-800">
                      <div className="font-bold">{row.order_code}</div>
                      <div className="text-xs text-slate-500">{row.factory_bill_code || "-"}</div>
                    </td>
                    <td className="p-3 text-slate-800">{row.customer_phone || row.customer_whatsapp || "-"}</td>
                    <td className="p-3 text-slate-800">{formatDateTime(row.delivery_scheduled_at)}</td>
                    <td className="p-3 text-slate-800">{SHIPMENT_DELIVERY_METHOD_LABELS[row.delivery_method]}</td>
                    <td className="p-3 text-slate-800">
                      <div>{row.receiver_summary}</div>
                      <div className="text-xs text-slate-500">{row.requested_by_name}</div>
                    </td>
                    <td className="p-3 text-slate-800">{row.transporter_summary}</td>
                    <td className="p-3 text-right font-bold text-emerald-600">{formatMoney(row.payment_amount)}</td>
                    <td className="p-3 text-right font-bold text-rose-600">{formatMoney(row.payment_outstanding_amount)}</td>
                    <td className="p-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${SHIPMENT_DELIVERY_STATUS_STYLES[row.status]}`}>
                        {SHIPMENT_DELIVERY_STATUS_LABELS[row.status]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
