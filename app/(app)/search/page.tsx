"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const PREFIXES = ["PKF26", "PKLF26", "MKF26", "MKLF26", "PMF26", "PMLF26", "MMF26", "MMLF26"] as const;
type Prefix = (typeof PREFIXES)[number];
type DateMode = "day" | "month" | "year";

type OrderRow = {
  id: string;
  order_code: string;
  order_date: string;
  customer_phone: string | null;
  factory_bill_code: string | null;
  fabric_name: string;
  balance: number;
  status: "in_progress" | "completed";
  shipment_status?: "pending" | "shipped";
  shipment_completed_at?: string | null;
  short_qty: number;
  long_qty: number;
  free_qty: number;
};

function getDisplayShirtTotal(row: Pick<OrderRow, "short_qty" | "long_qty" | "free_qty">) {
  return (Number(row.short_qty) || 0) + (Number(row.long_qty) || 0) + (Number(row.free_qty) || 0);
}

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const endExclusive = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, endExclusive };
}

function yearRange(y: string) {
  const start = `${y}-01-01`;
  const endExclusive = `${Number(y) + 1}-01-01`;
  return { start, endExclusive };
}

function getLocalDateInputValue() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function getLocalMonthInputValue() {
  return getLocalDateInputValue().slice(0, 7);
}

function renderStatus(row: OrderRow) {
  if (row.status === "completed") {
    return <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800 text-[10px] font-black uppercase">ສຳເລັດ</span>;
  }
  if (row.shipment_status === "shipped" || row.shipment_completed_at) {
    return <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">ຈັດສົ່ງສຳເລັດ</span>;
  }
  return <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase">ກຳລັງຜະລິດ</span>;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [activePrefix, setActivePrefix] = useState<Prefix | "ALL">("ALL");
  const [dateMode, setDateMode] = useState<DateMode>("day");
  const [day, setDay] = useState(getLocalDateInputValue);
  const [month, setMonth] = useState(getLocalMonthInputValue);
  const [year, setYear] = useState(() => new Date().getFullYear().toString());
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const runSearch = async () => {
    setLoading(true);
    setErr(null);

    let q = supabase
      .from("orders")
      .select("id,order_code,order_date,customer_phone,factory_bill_code,fabric_name,balance,status,shipment_status,shipment_completed_at,short_qty,long_qty,free_qty")
      .order("order_date", { ascending: false });

    if (activePrefix !== "ALL") q = q.ilike("order_code", `${activePrefix}%`);

    const s = query.trim();
    if (s) {
      const escaped = s.replace(/%/g, "\\%").replace(/_/g, "\\_");
      q = q.or(`order_code.ilike.%${escaped}%,factory_bill_code.ilike.%${escaped}%,customer_phone.ilike.%${escaped}%`);
    }

    if (dateMode === "day" && day) {
      q = q.eq("order_date", day);
    } else if (dateMode === "month" && month) {
      const { start, endExclusive } = monthRange(month);
      q = q.gte("order_date", start).lt("order_date", endExclusive);
    } else if (dateMode === "year" && year) {
      const { start, endExclusive } = yearRange(year);
      q = q.gte("order_date", start).lt("order_date", endExclusive);
    }

    const { data, error } = await q;
    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as OrderRow[]);
    }
    setLoading(false);
  };

  const resetAll = () => {
    setQuery("");
    setActivePrefix("ALL");
    setDateMode("day");
    setDay(getLocalDateInputValue());
    setMonth(getLocalMonthInputValue());
    setYear(new Date().getFullYear().toString());
    setRows([]);
    setErr(null);
  };

  const resultCount = useMemo(() => rows.length, [rows]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ຄົ້ນຫາ</h1>
          <div className="text-sm font-medium text-slate-500">ຄົ້ນຫາດ້ວຍລະຫັດອໍເດີ, ລະຫັດບິນໂຮງງານ ຫຼື ເບີໂທ</div>
        </div>

        <button onClick={resetAll} className="rounded bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700">
          ລ້າງທັງໝົດ
        </button>
      </div>

      {err ? <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

      <div className="mb-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-6">
          <div className="md:col-span-4">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">ຄົ້ນຫາ</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ພິມລະຫັດອໍເດີ, ບິນໂຮງງານ ຫຼື ເບີໂທ"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2 flex gap-2">
            <button onClick={runSearch} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700">
              {loading ? "ກຳລັງຄົ້ນ..." : "ຄົ້ນຫາ"}
            </button>
            <button onClick={resetAll} className="w-full rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">
              ລ້າງ
            </button>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">ກຸ່ມລະຫັດ</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActivePrefix("ALL")}
              className={`rounded-lg border px-3 py-1.5 text-sm font-bold transition-all ${
                activePrefix === "ALL" ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              ທັງໝົດ
            </button>

            {PREFIXES.map((p) => (
              <button
                key={p}
                onClick={() => setActivePrefix(p)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-bold transition-all ${
                  activePrefix === p ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 items-end gap-4 border-t border-slate-50 pt-4 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">ກອງເວລາ</label>
            <select
              value={dateMode}
              onChange={(e) => setDateMode(e.target.value as DateMode)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900"
            >
              <option value="day">ຕາມວັນ</option>
              <option value="month">ຕາມເດືອນ</option>
              <option value="year">ຕາມປີ</option>
            </select>
          </div>

          {dateMode === "day" ? (
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">ວັນທີ</label>
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900" />
            </div>
          ) : null}

          {dateMode === "month" ? (
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">ເດືອນ</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900" />
            </div>
          ) : null}

          {dateMode === "year" ? (
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">ປີ</label>
              <input type="number" value={year} onChange={(e) => setYear(e.target.value)} min={2000} max={2100} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900" />
            </div>
          ) : null}

          <div className="md:col-span-2 rounded-lg border border-slate-100 bg-slate-50 p-2 text-center text-xs font-bold text-slate-500">
            ຜົນລັບ: <span className="text-sm font-black text-blue-600">{resultCount}</span> ລາຍການ
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-4">
          <div className="text-sm font-black uppercase tracking-widest text-slate-700">ຜົນການຄົ້ນຫາ</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/50 text-slate-500">
              <tr>
                <th className="p-4 text-left text-[11px] font-bold uppercase tracking-wider">ວັນທີ</th>
                <th className="p-4 text-left text-[11px] font-bold uppercase tracking-wider">ລະຫັດອໍເດີ</th>
                <th className="p-4 text-left text-[11px] font-bold uppercase tracking-wider">ບິນໂຮງງານ</th>
                <th className="p-4 text-left text-[11px] font-bold uppercase tracking-wider">ເບີໂທ</th>
                <th className="p-4 text-left text-[11px] font-bold uppercase tracking-wider">ຜ້າ</th>
                <th className="p-4 text-right text-[11px] font-bold uppercase tracking-wider">ຈຳນວນເສື້ອ</th>
                <th className="p-4 text-right text-[11px] font-bold uppercase tracking-wider">ຄ້າງ</th>
                <th className="p-4 text-center text-[11px] font-bold uppercase tracking-wider">ສະຖານະ</th>
                <th className="p-4 text-center text-[11px] font-bold uppercase tracking-wider">ຈັດການ</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {rows.length === 0 ? (
                <tr>
                  <td className="p-10 text-center font-medium text-slate-400" colSpan={9}>
                    ບໍ່ມີຂໍ້ມູນ
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="p-4 font-medium text-slate-700">{r.order_date}</td>
                    <td className="p-4 font-black text-slate-900">{r.order_code}</td>
                    <td className="p-4 font-bold text-slate-600">{r.factory_bill_code?.trim() || "-"}</td>
                    <td className="p-4 font-medium text-slate-700">{r.customer_phone || "-"}</td>
                    <td className="p-4 font-bold text-slate-800">{r.fabric_name}</td>
                    <td className="p-4 text-right font-bold text-slate-700">{getDisplayShirtTotal(r).toLocaleString()}</td>
                    <td className="p-4 text-right font-black text-red-600">{r.balance.toLocaleString()}</td>
                    <td className="p-4 text-center">{renderStatus(r)}</td>
                    <td className="p-4 text-center">
                      <Link href={`/orders/${r.id}/edit`} className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-600 transition-all hover:bg-blue-600 hover:text-white">
                        ເປີດອໍເດີ
                      </Link>
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
