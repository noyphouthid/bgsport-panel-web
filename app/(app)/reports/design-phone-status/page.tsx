"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { useOrderTypeOptions } from "@/lib/order-code-options";
import {
  MonthFilter,
  PrefixFilter,
  buildMonthOptions,
  buildYearOptions,
  matchSelectedPrefixes,
  periodRange,
  togglePrefix,
} from "../_lib";

type DesignQueueEntry = {
  id: string;
  queue_date: string;
  queue_number: string;
  order_no: string;
  type_code: string;
  customer_phone: string;
  style_name: string;
  notes: string;
  is_designed: boolean;
  designed_at: string | null;
  graphic_user_id: string | null;
  updated_at: string;
  created_at: string;
};

type UserRow = {
  id: string;
  full_name: string;
};

type PhoneStatusFilter = "all" | "designed" | "pending" | "partial";
type PhoneSummary = {
  phone_key: string;
  customer_phone: string;
  total_entries: number;
  designed_entries: number;
  pending_entries: number;
  latest_queue_date: string;
  latest_created_at: string;
  latest_queue_number: string;
  latest_order_no: string;
  latest_type_code: string;
  latest_style_name: string;
  latest_designed_at: string | null;
  latest_updated_at: string;
  latest_graphic_id: string | null;
  latest_graphic_name: string;
  queue_numbers: string[];
  type_codes: string[];
  graphic_ids: string[];
};

function normalizeDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhoneKey(value: string | null | undefined) {
  const digits = normalizeDigits(value);
  return digits || String(value || "").trim().toLowerCase();
}

function toComparableDate(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function compareEntries(a: DesignQueueEntry, b: DesignQueueEntry) {
  if (a.queue_date !== b.queue_date) return b.queue_date.localeCompare(a.queue_date);
  if (a.queue_number !== b.queue_number) return b.queue_number.localeCompare(a.queue_number);
  return b.created_at.localeCompare(a.created_at);
}

function getPhoneStatus(row: Pick<PhoneSummary, "designed_entries" | "pending_entries" | "total_entries">): Exclude<PhoneStatusFilter, "all"> {
  if (row.designed_entries === row.total_entries) return "designed";
  if (row.pending_entries === row.total_entries) return "pending";
  return "partial";
}

function getPhoneStatusLabel(status: Exclude<PhoneStatusFilter, "all">) {
  if (status === "designed") return "ອອກແບບແລ້ວ";
  if (status === "pending") return "ຍັງບໍ່ທັນອອກແບບ";
  return "ອອກແບບບາງສ່ວນ";
}

function getPhoneStatusClass(status: Exclude<PhoneStatusFilter, "all">) {
  if (status === "designed") return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending") return "border border-amber-200 bg-amber-50 text-amber-700";
  return "border border-sky-200 bg-sky-50 text-sky-700";
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DesignPhoneStatusReportPage() {
  const now = new Date();
  const [month, setMonth] = useState<MonthFilter>(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [queueDateFrom, setQueueDateFrom] = useState("");
  const [queueDateTo, setQueueDateTo] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<PrefixFilter[]>([]);
  const [statusFilter, setStatusFilter] = useState<PhoneStatusFilter>("all");
  const [graphicFilter, setGraphicFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  const [rows, setRows] = useState<DesignQueueEntry[]>([]);
  const [graphics, setGraphics] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const { options: orderTypeOptions } = useOrderTypeOptions(true);
  const typeOptions = useMemo(() => [...orderTypeOptions, "OTHER"] as PrefixFilter[], [orderTypeOptions]);
  const graphicNameMap = useMemo(() => new Map(graphics.map((item) => [item.id, item.full_name])), [graphics]);

  const load = async () => {
    setLoading(true);
    setErr(null);

    const [{ data: queueData, error: queueError }, { data: userData, error: userError }] = await Promise.all([
      supabase
        .from("design_queue_entries")
        .select("id,queue_date,queue_number,order_no,type_code,customer_phone,style_name,notes,is_designed,designed_at,graphic_user_id,updated_at,created_at")
        .order("queue_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("users").select("id,full_name").eq("is_active", true).in("role", ["superadmin", "graphic"]).order("full_name", { ascending: true }),
    ]);

    if (queueError) {
      setRows([]);
      setGraphics([]);
      setErr(queueError.message);
      setLoading(false);
      return;
    }

    if (userError) {
      setGraphics([]);
      setErr(userError.message);
      setLoading(false);
      return;
    }

    setRows((queueData ?? []) as DesignQueueEntry[]);
    setGraphics((userData ?? []) as UserRow[]);
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const filteredEntries = useMemo(() => {
    const { start, endExclusive } = periodRange(year, month);
    return rows.filter((row) => {
      const queueDate = toComparableDate(row.queue_date);
      if (!(queueDate >= start && queueDate < endExclusive)) return false;
      if (queueDateFrom && row.queue_date < queueDateFrom) return false;
      if (queueDateTo && row.queue_date > queueDateTo) return false;
      if (!matchSelectedPrefixes(row.type_code, selectedTypes)) return false;
      return true;
    });
  }, [month, queueDateFrom, queueDateTo, rows, selectedTypes, year]);

  const phoneRows = useMemo(() => {
    const grouped = new Map<string, PhoneSummary>();

    for (const row of filteredEntries) {
      const normalizedPhone = String(row.customer_phone || "").trim();
      if (!normalizedPhone) continue;

      const key = normalizePhoneKey(normalizedPhone);
      const current =
        grouped.get(key) ??
        {
          phone_key: key,
          customer_phone: normalizedPhone,
          total_entries: 0,
          designed_entries: 0,
          pending_entries: 0,
          latest_queue_date: row.queue_date,
          latest_created_at: row.created_at,
          latest_queue_number: row.queue_number,
          latest_order_no: row.order_no,
          latest_type_code: row.type_code,
          latest_style_name: row.style_name,
          latest_designed_at: row.designed_at,
          latest_updated_at: row.updated_at,
          latest_graphic_id: row.graphic_user_id,
          latest_graphic_name: graphicNameMap.get(row.graphic_user_id || "") || "-",
          queue_numbers: [],
          type_codes: [],
          graphic_ids: [],
        };

      current.total_entries += 1;
      if (row.is_designed) current.designed_entries += 1;
      else current.pending_entries += 1;

      current.queue_numbers.push(row.queue_number);
      current.type_codes.push(row.type_code);
      if (row.graphic_user_id && !current.graphic_ids.includes(row.graphic_user_id)) {
        current.graphic_ids.push(row.graphic_user_id);
      }

      if (
        compareEntries(row, {
          id: current.phone_key,
          queue_date: current.latest_queue_date,
          queue_number: current.latest_queue_number,
          order_no: current.latest_order_no,
          type_code: current.latest_type_code,
          customer_phone: current.customer_phone,
          style_name: current.latest_style_name,
          notes: "",
          is_designed: false,
          designed_at: current.latest_designed_at,
          graphic_user_id: current.latest_graphic_id,
          updated_at: current.latest_updated_at,
          created_at: current.latest_created_at,
        }) < 0
      ) {
        current.latest_queue_date = row.queue_date;
        current.latest_created_at = row.created_at;
        current.latest_queue_number = row.queue_number;
        current.latest_order_no = row.order_no;
        current.latest_type_code = row.type_code;
        current.latest_style_name = row.style_name;
        current.latest_designed_at = row.designed_at;
        current.latest_updated_at = row.updated_at;
        current.latest_graphic_id = row.graphic_user_id;
        current.latest_graphic_name = graphicNameMap.get(row.graphic_user_id || "") || "-";
      }

      grouped.set(key, current);
    }

    const keyword = searchTerm.trim().toLowerCase();
    const keywordDigits = normalizeDigits(searchTerm);

    return [...grouped.values()]
      .filter((row) => {
        const phoneStatus = getPhoneStatus(row);
        if (statusFilter !== "all" && phoneStatus !== statusFilter) return false;
        if (graphicFilter !== "ALL" && !row.graphic_ids.includes(graphicFilter)) return false;

        if (!keyword) return true;

        const textHaystack = [
          row.customer_phone,
          row.latest_queue_number,
          row.latest_order_no,
          row.latest_type_code,
          row.latest_graphic_name,
          row.queue_numbers.join(" "),
          row.type_codes.join(" "),
        ]
          .join(" ")
          .toLowerCase();

        if (textHaystack.includes(keyword)) return true;
        if (!keywordDigits) return false;
        return normalizeDigits(row.customer_phone).includes(keywordDigits);
      })
      .sort((a, b) => {
        const pendingDiff = b.pending_entries - a.pending_entries;
        if (pendingDiff !== 0) return pendingDiff;
        return b.latest_queue_date.localeCompare(a.latest_queue_date);
      });
  }, [filteredEntries, graphicFilter, graphicNameMap, searchTerm, statusFilter]);

  const summary = useMemo(() => {
    return phoneRows.reduce(
      (acc, row) => {
        const status = getPhoneStatus(row);
        acc.phones_total += 1;
        acc.queue_total += row.total_entries;
        acc.designed_queue_total += row.designed_entries;
        acc.pending_queue_total += row.pending_entries;

        if (status === "designed") acc.designed_phones += 1;
        else if (status === "pending") acc.pending_phones += 1;
        else acc.partial_phones += 1;

        return acc;
      },
      {
        phones_total: 0,
        queue_total: 0,
        designed_queue_total: 0,
        pending_queue_total: 0,
        designed_phones: 0,
        pending_phones: 0,
        partial_phones: 0,
      }
    );
  }, [phoneRows]);

  const exportExcel = () => {
    if (phoneRows.length === 0) {
      toast.error("ບໍ່ມີຂໍ້ມູນສຳລັບ export");
      return;
    }

    const periodLabel = month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`;
    const selectedTypeLabel = selectedTypes.length === 0 ? "ALL" : selectedTypes.join(", ");
    const queueDateLabel = queueDateFrom || queueDateTo ? `${queueDateFrom || "..."} -> ${queueDateTo || "..."}` : "ALL";
    const out = phoneRows.map((row) => {
      const status = getPhoneStatus(row);
      return {
        "ເບີລູກຄ້າ": row.customer_phone,
        "ສະຖານະ": getPhoneStatusLabel(status),
        "ຈຳນວນຄິວລວມ": row.total_entries,
        "ອອກແບບແລ້ວ": row.designed_entries,
        "ຍັງບໍ່ທັນອອກແບບ": row.pending_entries,
        "ຄິວລ່າສຸດ": row.latest_queue_number,
        "ເລກອໍເດີລ່າສຸດ": row.latest_order_no,
        "TYPE ລ່າສຸດ": row.latest_type_code,
        Graphic: row.latest_graphic_name,
        "ຮູບແບບວຽກ": row.latest_style_name || "-",
        "ວັນທີຄິວລ່າສຸດ": row.latest_queue_date,
        "ອັບເດດລ່າສຸດ": formatDateTime(row.latest_updated_at),
        "ລາຍການຄິວທັງໝົດ": row.queue_numbers.join(", "),
      };
    });

    out.push({
      "ເບີລູກຄ້າ": "ລວມ",
      "ສະຖານະ": statusFilter,
      "ຈຳນວນຄິວລວມ": summary.queue_total,
      "ອອກແບບແລ້ວ": summary.designed_queue_total,
      "ຍັງບໍ່ທັນອອກແບບ": summary.pending_queue_total,
      "ຄິວລ່າສຸດ": `${summary.phones_total} ເບີ`,
      "ເລກອໍເດີລ່າສຸດ": `designed=${summary.designed_phones}`,
      "TYPE ລ່າສຸດ": `pending=${summary.pending_phones}`,
      Graphic: graphicFilter === "ALL" ? "Graphic ທັງໝົດ" : graphicNameMap.get(graphicFilter) || "-",
      "ຮູບແບບວຽກ": `partial=${summary.partial_phones}`,
      "ວັນທີຄິວລ່າສຸດ": periodLabel,
      "ອັບເດດລ່າສຸດ": `search=${searchTerm || "-"} | queue_date=${queueDateLabel}`,
      "ລາຍການຄິວທັງໝົດ": selectedTypeLabel,
    });

    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "design_phone_status");
    XLSX.writeFile(wb, `design-phone-status-${periodLabel}.xlsx`);
    toast.success("ດາວໂຫຼດລາຍງານສຳເລັດ");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ລາຍງານເບີລູກຄ້າຄິວອອກແບບ</h1>
          <p className="text-sm font-medium text-slate-500">
            ສະຫຼຸບຕາມເບີລູກຄ້າວ່າອອກແບບແລ້ວ, ຍັງບໍ່ທັນ ຫຼື ອອກແບບບາງສ່ວນ
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <RefreshCw size={16} />
          ໂຫຼດຄືນ
        </button>
      </div>

      {err ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{err}</div> : null}

      <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            value={month}
            onChange={(event) => setMonth(event.target.value === "ALL" ? "ALL" : Number(event.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
          >
            {buildMonthOptions().map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            {buildYearOptions().map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PhoneStatusFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ສະຖານະທັງໝົດ</option>
            <option value="designed">ອອກແບບແລ້ວ</option>
            <option value="pending">ຍັງບໍ່ທັນອອກແບບ</option>
            <option value="partial">ອອກແບບບາງສ່ວນ</option>
          </select>
          <select value={graphicFilter} onChange={(event) => setGraphicFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="ALL">Graphic ທັງໝົດ</option>
            {graphics.map((item) => (
              <option key={item.id} value={item.id}>
                {item.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">ວັນທີຄິວຈາກ</label>
            <input
              type="date"
              value={queueDateFrom}
              onChange={(event) => setQueueDateFrom(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">ວັນທີຄິວຫາ</label>
            <input
              type="date"
              value={queueDateTo}
              onChange={(event) => setQueueDateTo(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">Type Multi Select</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedTypes([])}
              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                selectedTypes.length === 0
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              TYPE ທັງໝົດ
            </button>
            {typeOptions.map((type) => {
              const active = selectedTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedTypes((prev) => togglePrefix(prev, type))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                    active
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="ຄົ້ນຫາເບີໂທ, ເລກຄິວ, ເລກອໍເດີ, TYPE, Graphic"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none"
          />
          <button
            type="button"
            onClick={exportExcel}
            disabled={phoneRows.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download size={16} />
            ດາວໂຫຼດ XLSX
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-black uppercase text-slate-600">ເບີລູກຄ້າທັງໝົດ</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{summary.phones_total.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <div className="text-xs font-black uppercase text-emerald-700">ເບີທີ່ອອກແບບແລ້ວ</div>
            <div className="mt-2 text-2xl font-black text-emerald-700">{summary.designed_phones.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
            <div className="text-xs font-black uppercase text-amber-700">ເບີທີ່ຍັງຄ້າງ</div>
            <div className="mt-2 text-2xl font-black text-amber-700">{summary.pending_phones.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
            <div className="text-xs font-black uppercase text-sky-700">ເບີທີ່ອອກແບບບາງສ່ວນ</div>
            <div className="mt-2 text-2xl font-black text-sky-700">{summary.partial_phones.toLocaleString()}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <div className="text-xs font-black uppercase text-slate-500">ຈຳນວນຄິວລວມ</div>
            <div className="mt-2 text-xl font-black text-slate-900">{summary.queue_total.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <div className="text-xs font-black uppercase text-slate-500">ຄິວທີ່ອອກແບບແລ້ວ</div>
            <div className="mt-2 text-xl font-black text-emerald-600">{summary.designed_queue_total.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <div className="text-xs font-black uppercase text-slate-500">ຄິວທີ່ຍັງບໍ່ທັນ</div>
            <div className="mt-2 text-xl font-black text-amber-600">{summary.pending_queue_total.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b bg-slate-50 p-4 text-sm font-black uppercase text-slate-800">ຕາຕະລາງເບີລູກຄ້າ ({phoneRows.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-slate-700">
              <tr>
                <th className="p-3 text-left text-xs font-black uppercase">ເບີລູກຄ້າ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ສະຖານະ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ຄິວລວມ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ອອກແບບແລ້ວ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ຍັງບໍ່ທັນ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ຄິວລ່າສຸດ</th>
                <th className="p-3 text-left text-xs font-black uppercase">TYPE / Graphic</th>
                <th className="p-3 text-left text-xs font-black uppercase">ອັບເດດລ່າສຸດ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && phoneRows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center font-bold text-slate-500" colSpan={8}>
                    ບໍ່ມີຂໍ້ມູນ
                  </td>
                </tr>
              ) : (
                phoneRows.map((row) => {
                  const status = getPhoneStatus(row);
                  return (
                    <tr key={row.phone_key}>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{row.customer_phone}</div>
                        <div className="text-xs font-medium text-slate-500">ລາຍການຄິວ: {row.queue_numbers.join(", ")}</div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${getPhoneStatusClass(status)}`}>
                          {getPhoneStatusLabel(status)}
                        </span>
                      </td>
                      <td className="p-3 text-right font-black text-slate-900">{row.total_entries.toLocaleString()}</td>
                      <td className="p-3 text-right font-black text-emerald-600">{row.designed_entries.toLocaleString()}</td>
                      <td className="p-3 text-right font-black text-amber-600">{row.pending_entries.toLocaleString()}</td>
                      <td className="p-3 text-slate-800">
                        <div className="font-black text-slate-900">{row.latest_queue_number}</div>
                        <div className="text-xs font-medium text-slate-500">
                          Order {row.latest_order_no} • {row.latest_queue_date}
                        </div>
                      </td>
                      <td className="p-3 text-slate-800">
                        <div className="font-black text-slate-900">{row.latest_type_code}</div>
                        <div className="text-xs font-medium text-slate-500">
                          {row.latest_graphic_name} • {row.latest_style_name || "-"}
                        </div>
                      </td>
                      <td className="p-3 text-slate-800">
                        <div className="font-medium">{formatDateTime(row.latest_updated_at)}</div>
                        <div className="text-xs font-medium text-slate-500">ອອກແບບລ່າສຸດ: {formatDateTime(row.latest_designed_at)}</div>
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
