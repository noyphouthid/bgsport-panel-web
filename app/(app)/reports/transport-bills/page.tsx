"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileDown, Printer, ReceiptText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import {
  getTransportNoteDisplayNo,
  type TransportNoteRow,
  type TransportNoteSourceType,
} from "@/lib/transport-notes";
import { exportReportDocumentAsPdf, openReportPrintWindow } from "../_lib";

type OrderRow = {
  id: string;
  order_code: string;
  factory_bill_code: string | null;
};

type UserRow = {
  id: string;
  full_name: string;
  role: AppRole;
};

type SourceFilter = TransportNoteSourceType | "all";
type PrintFilter = "all" | "printed" | "unprinted";

type ReportRow = TransportNoteRow & {
  order_code: string | null;
  factory_bill_code: string | null;
  created_by_name: string;
  display_no: string;
  transporter_summary: string;
};

function toLocalDateInputValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function toMonthStartInputValue(date = new Date()) {
  return toLocalDateInputValue(new Date(date.getFullYear(), date.getMonth(), 1));
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

function toDateOnlyLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function normalizeDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function isPrinted(row: Pick<TransportNoteRow, "print_count" | "printed_at" | "last_printed_at">) {
  return (Number(row.print_count) || 0) > 0 || Boolean(row.printed_at) || Boolean(row.last_printed_at);
}

function getPrintStatusLabel(row: Pick<TransportNoteRow, "print_count" | "printed_at" | "last_printed_at">) {
  return isPrinted(row) ? `ພິມແລ້ວ ${Math.max(1, Number(row.print_count) || 0)} ຄັ້ງ` : "ຍັງບໍ່ພິມ";
}

function getSourceLabel(source: TransportNoteSourceType) {
  return source === "shipment_request" ? "ຈາກຄຳຂໍຈັດສົ່ງ" : "ສ້າງເອງ";
}

function matchesSearch(row: ReportRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const queryDigits = normalizeDigits(query);

  const textHaystacks = [
    row.note_no,
    row.display_no,
    row.order_code || "",
    row.factory_bill_code || "",
    row.receiver_name,
    row.receiver_phone,
    row.branch || "",
    row.city || "",
    row.province || "",
    row.transporters.join(" "),
    row.created_by_name,
    row.printed_by || "",
  ].map((value) => String(value || "").toLowerCase());

  if (textHaystacks.some((value) => value.includes(normalizedQuery))) return true;
  if (!queryDigits) return false;

  const digitHaystacks = [row.note_no, row.order_code, row.factory_bill_code, row.receiver_phone].map(normalizeDigits);
  return digitHaystacks.some((value) => value.includes(queryDigits));
}

export default function TransportBillsReportPage() {
  const today = useMemo(() => toLocalDateInputValue(), []);
  const monthStart = useMemo(() => toMonthStartInputValue(), []);

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [creatorOptions, setCreatorOptions] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [printFilter, setPrintFilter] = useState<PrintFilter>("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [transporterFilter, setTransporterFilter] = useState("all");
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setErr(null);

    const [{ data: noteData, error: noteError }, { data: userData, error: userError }] = await Promise.all([
      supabase.from("transport_notes").select("*").order("created_at", { ascending: false }),
      supabase.from("users").select("id,full_name,role").order("full_name", { ascending: true }),
    ]);

    if (noteError) {
      setErr(noteError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    if (userError) {
      setErr(userError.message);
      setCreatorOptions([]);
    } else {
      setCreatorOptions((userData ?? []) as UserRow[]);
    }

    const userMap = new Map(((userData ?? []) as UserRow[]).map((user) => [user.id, user]));
    const noteRows = (noteData ?? []) as TransportNoteRow[];
    const orderIds = [...new Set(noteRows.map((row) => row.order_id).filter(Boolean))];

    let ordersById = new Map<string, OrderRow>();
    if (orderIds.length > 0) {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id,order_code,factory_bill_code")
        .in("id", orderIds);

      if (orderError) {
        setErr(orderError.message);
        setRows([]);
        setLoading(false);
        return;
      }

      ordersById = new Map(((orderData ?? []) as OrderRow[]).map((order) => [order.id, order]));
    }

    const mergedRows = noteRows.map((row) => {
      const order = row.order_id ? ordersById.get(row.order_id) : null;
      return {
        ...row,
        order_code: order?.order_code || null,
        factory_bill_code: order?.factory_bill_code || null,
        created_by_name: (row.created_by_user_id ? userMap.get(row.created_by_user_id)?.full_name : null) || "-",
        display_no: getTransportNoteDisplayNo(row, order?.order_code || null),
        transporter_summary: row.transporters.join(", ") || "-",
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

  const transporterOptions = useMemo(() => {
    return Array.from(new Set(rows.flatMap((row) => row.transporters).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const eventDate = toDateOnlyLocal(row.last_printed_at || row.created_at);
      if (fromDate && (!eventDate || eventDate < fromDate)) return false;
      if (toDate && (!eventDate || eventDate > toDate)) return false;
      if (sourceFilter !== "all" && row.source_type !== sourceFilter) return false;
      if (printFilter === "printed" && !isPrinted(row)) return false;
      if (printFilter === "unprinted" && isPrinted(row)) return false;
      if (creatorFilter !== "all" && row.created_by_user_id !== creatorFilter) return false;
      if (transporterFilter !== "all" && !row.transporters.includes(transporterFilter)) return false;
      if (!matchesSearch(row, query)) return false;
      return true;
    });
  }, [creatorFilter, fromDate, printFilter, query, rows, sourceFilter, toDate, transporterFilter]);

  const summary = useMemo(() => {
    const printed = filteredRows.filter((row) => isPrinted(row)).length;
    const shipmentLinked = filteredRows.filter((row) => row.source_type === "shipment_request").length;
    const standalone = filteredRows.length - shipmentLinked;
    const totalPrintCount = filteredRows.reduce((sum, row) => sum + (Number(row.print_count) || 0), 0);

    return {
      total: filteredRows.length,
      printed,
      unprinted: filteredRows.length - printed,
      shipmentLinked,
      standalone,
      totalPrintCount,
    };
  }, [filteredRows]);

  const dateSummary = `${fromDate || "-"} -> ${toDate || "-"}`;
  const printSummary = [
    { label: "ໃບບິນທັງໝົດ", value: summary.total.toLocaleString() },
    { label: "ພິມແລ້ວ", value: summary.printed.toLocaleString() },
    { label: "ຍັງບໍ່ພິມ", value: summary.unprinted.toLocaleString() },
    { label: "ຈາກຄຳຂໍຈັດສົ່ງ", value: summary.shipmentLinked.toLocaleString() },
  ];

  const exportRows = useMemo(
    () =>
      filteredRows.map((row) => ({
        display_no: row.display_no,
        note_no: row.note_no,
        order_code: row.order_code || "",
        factory_bill_code: row.factory_bill_code || "",
        receiver_name: row.receiver_name,
        receiver_phone: row.receiver_phone,
        branch: row.branch || "",
        city: row.city || "",
        province: row.province || "",
        transporters: row.transporter_summary,
        shipping_charge_mode: row.shipping_charge_mode === "origin" ? "ຈ່າຍຕົ້ນທາງ" : "ຈ່າຍປາຍທາງ",
        source_type: getSourceLabel(row.source_type),
        creator: row.created_by_name,
        created_at: formatDateTime(row.created_at),
        print_status: getPrintStatusLabel(row),
        printed_by: row.printed_by || "",
        last_printed_at: formatDateTime(row.last_printed_at),
      })),
    [filteredRows]
  );

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, "transport_bills_report");
    XLSX.writeFile(wb, `transport-bills-report-${fromDate || "all"}-${toDate || "all"}.xlsx`);
  };

  const handlePrint = () => {
    openReportPrintWindow({
      title: "ລາຍງານໃບບິນຂົນສົ່ງ",
      subtitle: `ໄລຍະ: ${dateSummary} | ປະເພດໃບບິນ: ${sourceFilter === "all" ? "ທັງໝົດ" : getSourceLabel(sourceFilter)} | ສະຖານະການພິມ: ${printFilter === "all" ? "ທັງໝົດ" : printFilter === "printed" ? "ພິມແລ້ວ" : "ຍັງບໍ່ພິມ"} | ຄົ້ນຫາ: ${query || "-"}`,
      summary: printSummary,
      headers: ["ເລກສະແດງ", "ອໍເດີ", "ຜູ້ຮັບ", "ຂົນສົ່ງ", "ຈ່າຍຄ່າຂົນສົ່ງ", "ແຫຼ່ງທີ່ມາ", "ຜູ້ສ້າງ", "ສ້າງເມື່ອ", "ສະຖານະພິມ"],
      rows: filteredRows.map((row) => [
        row.display_no,
        row.order_code || "-",
        `${row.receiver_name} (${row.receiver_phone})`,
        row.transporter_summary,
        row.shipping_charge_mode === "origin" ? "ຈ່າຍຕົ້ນທາງ" : "ຈ່າຍປາຍທາງ",
        getSourceLabel(row.source_type),
        row.created_by_name,
        formatDateTime(row.created_at),
        getPrintStatusLabel(row),
      ]),
    });
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportReportDocumentAsPdf(
        {
          title: "ລາຍງານໃບບິນຂົນສົ່ງ",
          subtitle: `ໄລຍະ: ${dateSummary} | ປະເພດໃບບິນ: ${sourceFilter === "all" ? "ທັງໝົດ" : getSourceLabel(sourceFilter)} | ສະຖານະການພິມ: ${printFilter === "all" ? "ທັງໝົດ" : printFilter === "printed" ? "ພິມແລ້ວ" : "ຍັງບໍ່ພິມ"} | ຄົ້ນຫາ: ${query || "-"}`,
          summary: printSummary,
          headers: ["ເລກສະແດງ", "ອໍເດີ", "ຜູ້ຮັບ", "ຂົນສົ່ງ", "ຈ່າຍຄ່າຂົນສົ່ງ", "ແຫຼ່ງທີ່ມາ", "ຜູ້ສ້າງ", "ສ້າງເມື່ອ", "ສະຖານະພິມ"],
          rows: filteredRows.map((row) => [
            row.display_no,
            row.order_code || "-",
            `${row.receiver_name} (${row.receiver_phone})`,
            row.transporter_summary,
            row.shipping_charge_mode === "origin" ? "ຈ່າຍຕົ້ນທາງ" : "ຈ່າຍປາຍທາງ",
            getSourceLabel(row.source_type),
            row.created_by_name,
            formatDateTime(row.created_at),
            getPrintStatusLabel(row),
          ]),
        },
        `transport-bills-report-${fromDate || "all"}-${toDate || "all"}.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
          <ReceiptText size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">ລາຍງານໃບບິນຂົນສົ່ງ</h1>
          <div className="text-sm font-medium text-slate-500">ສະຫຼຸບໃບຝາກຂົນສົ່ງ, ຜູ້ຮັບ, ບໍລິສັດຂົນສົ່ງ ແລະ ສະຖານະການພິມ</div>
        </div>
      </div>

      {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

      <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" />
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ປະເພດໃບບິນທັງໝົດ</option>
            <option value="shipment_request">ຈາກຄຳຂໍຈັດສົ່ງ</option>
            <option value="standalone">ສ້າງເອງ</option>
          </select>
          <select value={printFilter} onChange={(e) => setPrintFilter(e.target.value as PrintFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ສະຖານະພິມທັງໝົດ</option>
            <option value="printed">ພິມແລ້ວ</option>
            <option value="unprinted">ຍັງບໍ່ພິມ</option>
          </select>
          <select value={creatorFilter} onChange={(e) => setCreatorFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ຜູ້ສ້າງທັງໝົດ</option>
            {creatorOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </select>
          <select value={transporterFilter} onChange={(e) => setTransporterFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ຂົນສົ່ງທັງໝົດ</option>
            {transporterOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.6fr_1fr]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ຄົ້ນຫາເລກໃບບິນ, ອໍເດີ, ເບີຜູ້ຮັບ, ຂົນສົ່ງ"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none"
          />
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">ໄລຍະລາຍງານ: {dateSummary}</div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ໃບບິນທັງໝົດ</div>
            <div className="text-xl font-black text-slate-900">{summary.total.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ພິມແລ້ວ / ຍັງບໍ່ພິມ</div>
            <div className="text-xl font-black text-slate-900">
              {summary.printed.toLocaleString()} / {summary.unprinted.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ຈາກຄຳຂໍ / ສ້າງເອງ</div>
            <div className="text-xl font-black text-slate-900">
              {summary.shipmentLinked.toLocaleString()} / {summary.standalone.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ຈຳນວນຄັ້ງພິມລວມ</div>
            <div className="text-xl font-black text-slate-900">{summary.totalPrintCount.toLocaleString()}</div>
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
                <th className="p-3 text-left text-xs font-black uppercase">ເລກສະແດງ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ອໍເດີ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ຜູ້ຮັບ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ຂົນສົ່ງ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ຄ່າຂົນສົ່ງ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ແຫຼ່ງທີ່ມາ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ຜູ້ສ້າງ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ສ້າງເມື່ອ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ສະຖານະພິມ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center font-bold text-slate-500" colSpan={9}>
                    ບໍ່ມີຂໍ້ມູນ
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="p-3 font-black text-slate-900">
                      <div>{row.display_no}</div>
                      <div className="text-xs font-medium text-slate-500">{row.note_no}</div>
                    </td>
                    <td className="p-3 text-slate-800">
                      <div className="font-bold">{row.order_code || "-"}</div>
                      <div className="text-xs text-slate-500">{row.factory_bill_code || "-"}</div>
                    </td>
                    <td className="p-3 text-slate-800">
                      <div>{row.receiver_name}</div>
                      <div className="text-xs text-slate-500">{row.receiver_phone}</div>
                    </td>
                    <td className="p-3 text-slate-800">{row.transporter_summary}</td>
                    <td className="p-3 text-slate-800">{row.shipping_charge_mode === "origin" ? "ຈ່າຍຕົ້ນທາງ" : "ຈ່າຍປາຍທາງ"}</td>
                    <td className="p-3 text-slate-800">{getSourceLabel(row.source_type)}</td>
                    <td className="p-3 text-slate-800">{row.created_by_name}</td>
                    <td className="p-3 text-slate-800">{formatDateTime(row.created_at)}</td>
                    <td className="p-3 text-slate-800">
                      <div>{getPrintStatusLabel(row)}</div>
                      <div className="text-xs text-slate-500">{row.last_printed_at ? formatDateTime(row.last_printed_at) : "-"}</div>
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
