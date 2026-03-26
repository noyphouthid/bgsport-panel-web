"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Pencil, Printer, Search, Trash2, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getTransportNoteDisplayNo, getTransportNotePrintHtml, type TransportNoteRow } from "@/lib/transport-notes";

type OrderRow = {
  id: string;
  order_code: string;
  factory_bill_code: string | null;
};

type SourceFilter = "all" | "standalone" | "shipment_request";
type PrintFilter = "all" | "printed" | "unprinted";

function toLocalDateInputValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function toDateOnly(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

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

function getPrintStatusLabel(row: Pick<TransportNoteRow, "print_count" | "printed_at" | "last_printed_at">) {
  return (Number(row.print_count) || 0) > 0 || row.printed_at || row.last_printed_at
    ? `ພິມແລ້ວ ${Math.max(1, Number(row.print_count) || 0)} ຄັ້ງ`
    : "ຍັງບໍ່ພິມ";
}

function getPrintStatusStyles(row: Pick<TransportNoteRow, "print_count" | "printed_at" | "last_printed_at">) {
  return (Number(row.print_count) || 0) > 0 || row.printed_at || row.last_printed_at
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

export default function ShipmentNotesPage() {
  const today = useMemo(() => toLocalDateInputValue(), []);
  const [rows, setRows] = useState<TransportNoteRow[]>([]);
  const [ordersById, setOrdersById] = useState<Record<string, OrderRow>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [printFilter, setPrintFilter] = useState<PrintFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [currentPrinter, setCurrentPrinter] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: noteData, error: noteError }, { data: sessionData }, { data: userData }] = await Promise.all([
      supabase.from("transport_notes").select("*").order("created_at", { ascending: false }),
      supabase.auth.getSession(),
      supabase.from("users").select("full_name,email,auth_user_id"),
    ]);

    if (noteError) {
      setLoading(false);
      toast.error(`ໂຫຼດໃບຝາກເຄື່ອງບໍ່ສຳເລັດ: ${noteError.message}`);
      return;
    }

    const noteRows = (noteData ?? []) as TransportNoteRow[];
    setRows(noteRows);

    const orderIds = [...new Set(noteRows.map((row) => row.order_id).filter((value): value is string => Boolean(value)))];
    if (orderIds.length > 0) {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id,order_code,factory_bill_code")
        .in("id", orderIds);
      if (!orderError) {
        setOrdersById(Object.fromEntries(((orderData ?? []) as OrderRow[]).map((item) => [item.id, item])));
      }
    } else {
      setOrdersById({});
    }

    const authUserId = sessionData.session?.user.id ?? null;
    const sessionEmail = String(sessionData.session?.user.email || "").trim().toLowerCase();
    const matchedUser =
      (((userData ?? []) as Array<{ full_name?: string | null; email?: string | null; auth_user_id?: string | null }>).find(
        (item) => item.auth_user_id === authUserId || (!!sessionEmail && String(item.email || "").trim().toLowerCase() === sessionEmail)
      ) as { full_name?: string | null } | undefined) || null;
    setCurrentPrinter(String(matchedUser?.full_name || sessionData.session?.user.email || "").trim());
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (sourceFilter !== "all" && row.source_type !== sourceFilter) return false;
      if (printFilter === "printed" && !(Number(row.print_count) > 0 || row.printed_at || row.last_printed_at)) return false;
      if (printFilter === "unprinted" && (Number(row.print_count) > 0 || row.printed_at || row.last_printed_at)) return false;

      const printedDate = toDateOnly(row.last_printed_at || row.created_at);
      if (fromDate && (!printedDate || printedDate < fromDate)) return false;
      if (toDate && (!printedDate || printedDate > toDate)) return false;

      if (!keyword) return true;
      const order = row.order_id ? ordersById[row.order_id] : null;
      return [
        row.note_no,
        row.receiver_name,
        row.receiver_phone,
        row.branch || "",
        row.city || "",
        row.province || "",
        row.transporters.join(" "),
        order?.order_code || "",
        order?.factory_bill_code || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [fromDate, ordersById, printFilter, query, rows, sourceFilter, toDate]);

  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.includes(row.id));
  const selectedRows = useMemo(() => filteredRows.filter((row) => selectedIds.includes(row.id)), [filteredRows, selectedIds]);

  const toggleSelectAll = () => {
    if (filteredRows.length === 0) return;
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredRows.some((row) => row.id === id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredRows.map((row) => row.id)])));
  };

  const printSelected = async () => {
    if (selectedRows.length === 0) {
      toast.error("ກະລຸນາເລືອກໃບຝາກເຄື່ອງຢ່າງໜ້ອຍ 1 ລາຍການ");
      return;
    }

    const confirmed = window.confirm(`ຕ້ອງການພິມ ${selectedRows.length} ໃບ ຫຼື ບໍ່?`);
    if (!confirmed) return;

    setPrinting(true);
    const popup = window.open("", "_blank", "width=960,height=1200");
    if (!popup) {
      setPrinting(false);
      toast.error("ບໍ່ສາມາດເປີດໜ້າພິມໄດ້");
      return;
    }

    popup.document.write(getTransportNotePrintHtml(selectedRows));
    popup.document.close();
    popup.focus();

    const printedAt = new Date().toISOString();
    const updates = selectedRows.map((row) =>
      supabase
        .from("transport_notes")
        .update({
          printed_at: row.printed_at || printedAt,
          printed_by: currentPrinter || null,
          print_count: (Number(row.print_count) || 0) + 1,
          last_printed_at: printedAt,
          updated_at: printedAt,
        })
        .eq("id", row.id)
    );

    const results = await Promise.all(updates);
    setPrinting(false);
    const updateError = results.find((result) => result.error)?.error;
    if (updateError) {
      toast.error(`ພິມໄດ້ ແຕ່ບັນທຶກສະຖານະການພິມບໍ່ສຳເລັດ: ${updateError.message}`);
      return;
    }

    setRows((prev) =>
      prev.map((row) =>
        selectedRows.some((item) => item.id === row.id)
          ? {
              ...row,
              printed_at: row.printed_at || printedAt,
              printed_by: currentPrinter || null,
              print_count: (Number(row.print_count) || 0) + 1,
              last_printed_at: printedAt,
              updated_at: printedAt,
            }
          : row
      )
    );
    toast.success(`ພິມ ${selectedRows.length} ໃບສຳເລັດ`);
  };

  const deleteRow = async (row: TransportNoteRow) => {
    const confirmed = window.confirm(`ຕ້ອງການລຶບໃບຝາກເຄື່ອງ ${row.note_no} ແທ້ບໍ?`);
    if (!confirmed) return;

    const { error } = await supabase.from("transport_notes").delete().eq("id", row.id);
    if (error) {
      toast.error(`ລຶບໃບຝາກເຄື່ອງບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    setRows((prev) => prev.filter((item) => item.id !== row.id));
    setSelectedIds((prev) => prev.filter((id) => id !== row.id));
    toast.success(`ລຶບ ${row.note_no} ສຳເລັດ`);
  };

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-[2rem] bg-gradient-to-br from-sky-950 via-blue-900 to-slate-900 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em]">
              <Truck size={14} />
              ໃບຝາກເຄື່ອງ
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">ລາຍການໃບຝາກເຄື່ອງ</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-sky-100">
              ຈັດການໃບບິນຂົນສົ່ງທັງໝົດ, ຄົ້ນຫາຕາມລະຫັດອໍເດີ, ແກ້ໄຂ, ລຶບ ແລະ ພິມຫຼາຍໃບພ້ອມກັນໄດ້.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/shipments/transport-note" className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20">
              ສ້າງໃບໃໝ່
            </Link>
            <button
              type="button"
              onClick={() => void printSelected()}
              disabled={printing || selectedRows.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-slate-900 transition hover:bg-slate-100 disabled:opacity-50"
            >
              <Printer size={16} />
              {printing ? "ກຳລັງພິມ..." : `ພິມ ${selectedRows.length || ""} ໃບ`}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1.4fr_180px_180px_160px_160px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ຄົ້ນຫາລະຫັດໃບ, ລະຫັດອໍເດີ, ຜູ້ຮັບ, ເບີໂທ..."
              className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">ທຸກປະເພດ</option>
            <option value="shipment_request">ຈາກຄຳຂໍຈັດສົ່ງ</option>
            <option value="standalone">Standalone</option>
          </select>
          <select value={printFilter} onChange={(e) => setPrintFilter(e.target.value as PrintFilter)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">ທຸກສະຖານະພິມ</option>
            <option value="printed">ພິມແລ້ວ</option>
            <option value="unprinted">ຍັງບໍ່ພິມ</option>
          </select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-4">
          <label className="inline-flex items-center gap-3 text-sm font-black text-slate-700">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
            ເລືອກທັງໝົດ
          </label>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            {loading ? "Loading..." : `${filteredRows.length} Notes`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-700">
                <th className="p-4 text-left font-bold uppercase tracking-widest"></th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ໃບບິນ</th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ອໍເດີ</th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ຜູ້ຮັບ</th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ຂົນສົ່ງ</th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ພິມລ່າສຸດ</th>
                <th className="p-4 text-center font-bold uppercase tracking-widest">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center font-medium text-slate-400">ບໍ່ພົບໃບຝາກເຄື່ອງ</td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const order = row.order_id ? ordersById[row.order_id] : null;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id]
                            )
                          }
                        />
                      </td>
                      <td className="p-4">
                        <div className="font-black text-slate-900">{getTransportNoteDisplayNo(row, order?.order_code)}</div>
                        <div className="mt-1 text-xs font-medium text-slate-500">{row.source_type === "shipment_request" ? "ຈາກ shipment" : "standalone"}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-black text-slate-900">{order?.order_code || "-"}</div>
                        <div className="mt-1 text-xs font-medium text-slate-500">{order?.factory_bill_code?.trim() || "-"}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-700">{row.receiver_name}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.receiver_phone}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {[row.branch, row.city, row.province].filter(Boolean).join(" / ") || "-"}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-700">{row.transporters.join(", ") || "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          <span className={`rounded-full border px-2 py-1 ${getPrintStatusStyles(row)}`}>
                            {getPrintStatusLabel(row)}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-700">{formatDateTime(row.last_printed_at || row.created_at)}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.printed_by || "-"}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Link href={`/shipments/transport-note?id=${row.id}`} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 transition hover:bg-slate-200">
                            <Pencil size={14} />
                            ແກ້ໄຂ
                          </Link>
                          <button onClick={() => void deleteRow(row)} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100">
                            <Trash2 size={14} />
                            ລຶບ
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
