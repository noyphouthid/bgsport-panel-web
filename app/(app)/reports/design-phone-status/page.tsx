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

type OrderReferenceRow = {
  order_code: string;
  order_date: string;
};

type QueueDesignFilter = "DESIGNED" | "PENDING" | "DESIGNED_NOT_ORDERED" | "DESIGNED_ORDERED";
type OrderReferenceInfo = {
  order_date: string | null;
};

type QueueReportRow = DesignQueueEntry & {
  graphic_name: string;
  has_order_deposit: boolean;
  order_deposit_date: string | null;
};

const QUEUE_DESIGN_FILTER_OPTIONS: Array<{ value: QueueDesignFilter; label: string }> = [
  { value: "DESIGNED", label: "ອອກແບບແລ້ວ" },
  { value: "PENDING", label: "ຍັງບໍ່ທັນອອກແບບ" },
  { value: "DESIGNED_NOT_ORDERED", label: "ອອກແບບແລ້ວ ແຕ່ຍັງບໍ່ທັນມັດຈຳສັ່ງຜະລິດ" },
  { value: "DESIGNED_ORDERED", label: "ອອກແບບແລ້ວ ແລະ ມັດຈຳສັ່ງຜະລິດແລ້ວ" },
];

function normalizeDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeOrderCode(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

function toComparableDate(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function getQueueDesignFilterLabel(value: QueueDesignFilter) {
  return QUEUE_DESIGN_FILTER_OPTIONS.find((item) => item.value === value)?.label || value;
}

function toggleQueueDesignFilter(current: QueueDesignFilter[], next: QueueDesignFilter) {
  return current.includes(next) ? current.filter((item) => item !== next) : [...current, next];
}

function matchesQueueDesignFilter(row: DesignQueueEntry, hasOrderDeposit: boolean, selectedFilters: QueueDesignFilter[]) {
  if (selectedFilters.length === 0) return true;

  const matchedStatuses: QueueDesignFilter[] = [];

  if (row.is_designed) {
    matchedStatuses.push("DESIGNED");
    matchedStatuses.push(hasOrderDeposit ? "DESIGNED_ORDERED" : "DESIGNED_NOT_ORDERED");
  } else {
    matchedStatuses.push("PENDING");
  }

  return matchedStatuses.some((status) => selectedFilters.includes(status));
}

function getOrderDepositStatusLabel(hasOrderDeposit: boolean) {
  return hasOrderDeposit ? "ມັດຈຳສັ່ງຜະລິດແລ້ວ" : "ຍັງບໍ່ທັນມັດຈຳສັ່ງຜະລິດ";
}

function getOrderDepositStatusClass(hasOrderDeposit: boolean) {
  return hasOrderDeposit
    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border border-amber-200 bg-amber-50 text-amber-700";
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
  const [selectedQueueStatuses, setSelectedQueueStatuses] = useState<QueueDesignFilter[]>(["DESIGNED"]);
  const [graphicFilter, setGraphicFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  const [rows, setRows] = useState<DesignQueueEntry[]>([]);
  const [graphics, setGraphics] = useState<UserRow[]>([]);
  const [orderInfoByOrderCode, setOrderInfoByOrderCode] = useState<Map<string, OrderReferenceInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const { options: orderTypeOptions } = useOrderTypeOptions(true);
  const typeOptions = useMemo(() => [...orderTypeOptions, "OTHER"] as PrefixFilter[], [orderTypeOptions]);
  const graphicNameMap = useMemo(() => new Map(graphics.map((item) => [item.id, item.full_name])), [graphics]);
  const queueStatusLabel = useMemo(
    () => (selectedQueueStatuses.length === 0 ? "ALL" : selectedQueueStatuses.map(getQueueDesignFilterLabel).join(", ")),
    [selectedQueueStatuses]
  );

  const load = async () => {
    setLoading(true);
    setErr(null);

    const [{ data: queueData, error: queueError }, { data: userData, error: userError }, { data: orderData, error: orderError }] = await Promise.all([
      supabase
        .from("design_queue_entries")
        .select("id,queue_date,queue_number,order_no,type_code,customer_phone,style_name,notes,is_designed,designed_at,graphic_user_id,updated_at,created_at")
        .order("queue_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("users").select("id,full_name").eq("is_active", true).in("role", ["superadmin", "graphic"]).order("full_name", { ascending: true }),
      supabase.from("orders").select("order_code,order_date").order("created_at", { ascending: false }),
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

    if (orderError) {
      setErr(orderError.message);
      setLoading(false);
      return;
    }

    const orderInfoMap = new Map<string, OrderReferenceInfo>();
    ((orderData ?? []) as OrderReferenceRow[]).forEach((row) => {
      const key = normalizeOrderCode(row.order_code);
      if (!key || orderInfoMap.has(key)) return;
      orderInfoMap.set(key, {
        order_date: row.order_date || null,
      });
    });

    setRows((queueData ?? []) as DesignQueueEntry[]);
    setGraphics((userData ?? []) as UserRow[]);
    setOrderInfoByOrderCode(orderInfoMap);
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
      const hasOrderDeposit = Boolean(orderInfoByOrderCode.get(normalizeOrderCode(row.order_no)));
      if (!matchesQueueDesignFilter(row, hasOrderDeposit, selectedQueueStatuses)) return false;
      return true;
    });
  }, [month, orderInfoByOrderCode, queueDateFrom, queueDateTo, rows, selectedQueueStatuses, selectedTypes, year]);

  const reportRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const keywordDigits = normalizeDigits(searchTerm);

    return filteredEntries
      .map((row) => {
        const orderInfo = orderInfoByOrderCode.get(normalizeOrderCode(row.order_no));
        return {
          ...row,
          graphic_name: graphicNameMap.get(row.graphic_user_id || "") || "-",
          has_order_deposit: Boolean(orderInfo),
          order_deposit_date: orderInfo?.order_date || null,
        } satisfies QueueReportRow;
      })
      .filter((row) => {
        if (graphicFilter !== "ALL" && row.graphic_user_id !== graphicFilter) return false;

        if (!keyword) return true;

        const textHaystack = [
          row.customer_phone,
          row.queue_number,
          row.order_no,
          row.type_code,
          row.graphic_name,
          row.style_name,
          getOrderDepositStatusLabel(row.has_order_deposit),
          row.order_deposit_date || "",
        ]
          .join(" ")
          .toLowerCase();

        if (textHaystack.includes(keyword)) return true;
        if (!keywordDigits) return false;
        return [row.customer_phone, row.queue_number, row.order_no].map(normalizeDigits).some((value) => value.includes(keywordDigits));
      })
      .sort((a, b) => {
        if (a.has_order_deposit !== b.has_order_deposit) return Number(a.has_order_deposit) - Number(b.has_order_deposit);
        if (a.queue_date !== b.queue_date) return b.queue_date.localeCompare(a.queue_date);
        if (a.queue_number !== b.queue_number) return b.queue_number.localeCompare(a.queue_number);
        return b.created_at.localeCompare(a.created_at);
      });
  }, [filteredEntries, graphicFilter, graphicNameMap, orderInfoByOrderCode, searchTerm]);

  const summary = useMemo(() => {
    return reportRows.reduce(
      (acc, row) => {
        acc.total_queues += 1;
        if (row.is_designed) acc.designed_queues += 1;
        else acc.pending_queues += 1;
        if (row.is_designed && row.has_order_deposit) acc.designed_ordered += 1;
        if (row.is_designed && !row.has_order_deposit) acc.designed_not_ordered += 1;
        return acc;
      },
      {
        total_queues: 0,
        designed_queues: 0,
        pending_queues: 0,
        designed_ordered: 0,
        designed_not_ordered: 0,
      }
    );
  }, [reportRows]);

  const exportExcel = () => {
    if (reportRows.length === 0) {
      toast.error("ບໍ່ມີຂໍ້ມູນສຳລັບ export");
      return;
    }

    const periodLabel = month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`;
    const selectedTypeLabel = selectedTypes.length === 0 ? "ALL" : selectedTypes.join(", ");
    const queueDateLabel = queueDateFrom || queueDateTo ? `${queueDateFrom || "..."} -> ${queueDateTo || "..."}` : "ALL";
    const out = reportRows.map((row) => {
      return {
        "ວັນທີຄິວ": row.queue_date,
        "ເລກຄິວ": row.queue_number,
        "ເລກອໍເດີ": row.order_no,
        "ເບີລູກຄ້າ": row.customer_phone,
        TYPE: row.type_code,
        Graphic: row.graphic_name,
        "ຮູບແບບວຽກ": row.style_name || "-",
        "ອອກແບບແລ້ວບໍ່": row.is_designed ? "ອອກແບບແລ້ວ" : "ຍັງບໍ່ທັນອອກແບບ",
        "ວັນທີອອກແບບ": row.designed_at ? formatDateTime(row.designed_at) : "-",
        "ສະຖານະມັດຈຳສັ່ງຜະລິດ": getOrderDepositStatusLabel(row.has_order_deposit),
        "ວັນທີມັດຈຳສັ່ງຜະລິດ": row.order_deposit_date || "-",
        "ອັບເດດລ່າສຸດ": formatDateTime(row.updated_at),
      };
    });

    out.push({
      "ວັນທີຄິວ": periodLabel,
      "ເລກຄິວ": `queues=${summary.total_queues}`,
      "ເລກອໍເດີ": `designed=${summary.designed_queues}`,
      "ເບີລູກຄ້າ": `pending=${summary.pending_queues}`,
      TYPE: `types=${selectedTypeLabel}`,
      Graphic: graphicFilter === "ALL" ? "Graphic ທັງໝົດ" : graphicNameMap.get(graphicFilter) || "-",
      "ຮູບແບບວຽກ": `ordered=${summary.designed_ordered}`,
      "ອອກແບບແລ້ວບໍ່": `not_ordered=${summary.designed_not_ordered}`,
      "ວັນທີອອກແບບ": `queue_filter=${queueStatusLabel}`,
      "ສະຖານະມັດຈຳສັ່ງຜະລິດ": `search=${searchTerm || "-"}`,
      "ວັນທີມັດຈຳສັ່ງຜະລິດ": `queue_date=${queueDateLabel}`,
      "ອັບເດດລ່າສຸດ": "-",
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
          <h1 className="text-2xl font-black text-slate-900">ລາຍງານຄິວອອກແບບ ແລະ ການມັດຈຳສັ່ງຜະລິດ</h1>
          <p className="text-sm font-medium text-slate-500">
            ຕິດຕາມລາຍການຄິວທີ່ອອກແບບແລ້ວ ວ່າໄດ້ມັດຈຳສັ່ງຜະລິດແລ້ວບໍ່ ແລະ ມັດຈຳໃນມື້ໃດ
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
          <select value={graphicFilter} onChange={(event) => setGraphicFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="ALL">Graphic ທັງໝົດ</option>
            {graphics.map((item) => (
              <option key={item.id} value={item.id}>
                {item.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">ຕົວກອງສະຖານະຄິວອອກແບບ</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedQueueStatuses([])}
              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                selectedQueueStatuses.length === 0
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              ສະຖານະຄິວທັງໝົດ
            </button>
            {QUEUE_DESIGN_FILTER_OPTIONS.map((item) => {
              const active = selectedQueueStatuses.includes(item.value);
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSelectedQueueStatuses((prev) => toggleQueueDesignFilter(prev, item.value))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                    active
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
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
            placeholder="ຄົ້ນຫາເລກຄິວ, ເລກອໍເດີ, ເບີໂທ, TYPE, Graphic"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none"
          />
          <button
            type="button"
            onClick={exportExcel}
            disabled={reportRows.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download size={16} />
            ດາວໂຫຼດ XLSX
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-black uppercase text-slate-600">ຄິວທັງໝົດ</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{summary.total_queues.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <div className="text-xs font-black uppercase text-emerald-700">ອອກແບບແລ້ວ ແລະ ມັດຈຳແລ້ວ</div>
            <div className="mt-2 text-2xl font-black text-emerald-700">{summary.designed_ordered.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
            <div className="text-xs font-black uppercase text-amber-700">ອອກແບບແລ້ວ ແຕ່ຍັງບໍ່ທັນມັດຈຳ</div>
            <div className="mt-2 text-2xl font-black text-amber-700">{summary.designed_not_ordered.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
            <div className="text-xs font-black uppercase text-sky-700">ຄິວຍັງບໍ່ທັນອອກແບບ</div>
            <div className="mt-2 text-2xl font-black text-sky-700">{summary.pending_queues.toLocaleString()}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <div className="text-xs font-black uppercase text-slate-500">ຄິວທີ່ອອກແບບແລ້ວ</div>
            <div className="mt-2 text-xl font-black text-slate-900">{summary.designed_queues.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <div className="text-xs font-black uppercase text-slate-500">ຄິວທີ່ກຳລັງສະແດງ</div>
            <div className="mt-2 text-xl font-black text-emerald-600">{reportRows.length.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b bg-slate-50 p-4 text-sm font-black uppercase text-slate-800">ຕາຕະລາງລາຍການຄິວ ({reportRows.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-slate-700">
              <tr>
                <th className="p-3 text-left text-xs font-black uppercase">ວັນທີ / ເລກຄິວ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ອໍເດີ / ເບີໂທ</th>
                <th className="p-3 text-left text-xs font-black uppercase">TYPE / Graphic</th>
                <th className="p-3 text-left text-xs font-black uppercase">ສະຖານະອອກແບບ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ສະຖານະມັດຈຳສັ່ງຜະລິດ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ວັນທີມັດຈຳ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ອັບເດດ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && reportRows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center font-bold text-slate-500" colSpan={7}>
                    ບໍ່ມີຂໍ້ມູນ
                  </td>
                </tr>
              ) : (
                reportRows.map((row) => {
                  return (
                    <tr key={row.id}>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{row.queue_number}</div>
                        <div className="text-xs font-medium text-slate-500">{row.queue_date}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{row.order_no}</div>
                        <div className="text-xs font-medium text-slate-500">{row.customer_phone || "-"}</div>
                      </td>
                      <td className="p-3 text-slate-800">
                        <div className="font-black text-slate-900">{row.type_code}</div>
                        <div className="text-xs font-medium text-slate-500">
                          {row.graphic_name} • {row.style_name || "-"}
                        </div>
                      </td>
                      <td className="p-3 text-slate-800">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
                            row.is_designed ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {row.is_designed ? "ອອກແບບແລ້ວ" : "ຍັງບໍ່ທັນອອກແບບ"}
                        </span>
                        <div className="mt-1 text-xs font-medium text-slate-500">ວັນທີອອກແບບ: {formatDateTime(row.designed_at)}</div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${getOrderDepositStatusClass(row.has_order_deposit)}`}>
                          {getOrderDepositStatusLabel(row.has_order_deposit)}
                        </span>
                      </td>
                      <td className="p-3 text-slate-800">
                        <div className="font-black text-slate-900">{row.order_deposit_date || "-"}</div>
                        <div className="text-xs font-medium text-slate-500">ດຶງຈາກວັນທີອໍເດີ້</div>
                      </td>
                      <td className="p-3 text-slate-800">
                        <div className="font-medium">{formatDateTime(row.updated_at)}</div>
                        <div className="text-xs font-medium text-slate-500">ອອກແບບລ່າສຸດ: {formatDateTime(row.designed_at)}</div>
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
