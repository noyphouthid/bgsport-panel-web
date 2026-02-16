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
};

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, endExclusive: nextMonth };
}

function yearRange(y: string) {
  const start = `${y}-01-01`;
  const endExclusive = `${Number(y) + 1}-01-01`;
  return { start, endExclusive };
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [activePrefix, setActivePrefix] = useState<Prefix | "ALL">("ALL");

  const [dateMode, setDateMode] = useState<DateMode>("day");
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(() => new Date().getFullYear().toString());

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const runSearch = async () => {
    setLoading(true);
    setErr(null);

    let q = supabase
      .from("orders")
      .select("id,order_code,order_date,customer_phone,factory_bill_code,fabric_name,balance,status")
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
    setDay(new Date().toISOString().slice(0, 10));
    setMonth(new Date().toISOString().slice(0, 7));
    setYear(new Date().getFullYear().toString());
    setRows([]);
    setErr(null);
  };

  const resultCount = useMemo(() => rows.length, [rows]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ຄົ້ນຫາ</h1>
          <div className="text-sm text-slate-500 font-medium">
            ຄົ້ນຫາ: ລະຫັດຮ້ານ / ລະຫັດໂຮງງານ / ເບີໂທ
          </div>
        </div>

        <button
          onClick={resetAll}
          className="bg-red-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-red-700 shadow-sm"
        >
          ລ້າງທັງໝົດ
        </button>
      </div>

      {err && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm font-medium">
          Error: {err}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">ຄົ້ນຫາ</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ພິມ: ລະຫັດອໍເດີ້ / ບິນໂຮງງານ / ເບີໂທ"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
            />
          </div>

          <div className="md:col-span-2 flex gap-2">
            <button
              onClick={runSearch}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 w-full shadow-sm"
            >
              {loading ? "ກຳລັງຄົ້ນ..." : "ຄົ້ນຫາ"}
            </button>
            <button
              onClick={resetAll}
              className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-200 w-full border border-slate-200"
            >
              ລ້າງ
            </button>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">ກຸ່ມລະຫັດ</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActivePrefix("ALL")}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                activePrefix === "ALL" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              ທັງໝົດ
            </button>

            {PREFIXES.map((p) => (
              <button
                key={p}
                onClick={() => setActivePrefix(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                  activePrefix === p ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-4 items-end border-t border-slate-50 pt-4">
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">ກອງເວລາ</label>
            <select
              value={dateMode}
              onChange={(e) => setDateMode(e.target.value as DateMode)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold bg-slate-50"
            >
              <option value="day">ຕາມວັນ</option>
              <option value="month">ຕາມເດືອນ</option>
              <option value="year">ຕາມປີ</option>
            </select>
          </div>

          {dateMode === "day" && (
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">ວັນທີ</label>
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold" />
            </div>
          )}

          {dateMode === "month" && (
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">ເດືອນ</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold" />
            </div>
          )}

          {dateMode === "year" && (
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">ປີ</label>
              <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-bold" min={2000} max={2100} />
            </div>
          )}

          <div className="md:col-span-2 text-xs font-bold text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
            ຜົນລັບ: <span className="text-blue-600 text-sm font-black">{resultCount}</span> ລາຍການ
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="text-sm font-black text-slate-700 uppercase tracking-widest">ຜົນການຄົ້ນຫາ</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
              <tr>
                <th className="p-4 text-left font-bold uppercase text-[11px] tracking-wider">ວັນທີ</th>
                <th className="p-4 text-left font-bold uppercase text-[11px] tracking-wider">ລະຫັດອໍເດີ້</th>
                <th className="p-4 text-left font-bold uppercase text-[11px] tracking-wider">ບິນໂຮງງານ</th>
                <th className="p-4 text-left font-bold uppercase text-[11px] tracking-wider">ເບີໂທ</th>
                <th className="p-4 text-left font-bold uppercase text-[11px] tracking-wider">ຜ້າ</th>
                <th className="p-4 text-right font-bold uppercase text-[11px] tracking-wider">ຄ້າງ</th>
                <th className="p-4 text-center font-bold uppercase text-[11px] tracking-wider">ສະຖານະ</th>
                <th className="p-4 text-center font-bold uppercase text-[11px] tracking-wider">ຈັດການ</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {rows.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-slate-400 font-medium" colSpan={8}>
                    ບໍ່ມີຂໍ້ມູນ (ກົດ “ຄົ້ນຫາ”)
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 text-slate-700 font-medium">{r.order_date}</td>
                    <td className="p-4 font-black text-slate-900">{r.order_code}</td>
                    <td className="p-4 text-slate-600 font-bold">{r.factory_bill_code?.trim() ? r.factory_bill_code : "—"}</td>
                    <td className="p-4 text-slate-700 font-medium">{r.customer_phone ?? "—"}</td>
                    <td className="p-4 text-slate-800 font-bold">{r.fabric_name}</td>
                    <td className="p-4 text-right text-red-600 font-black">{r.balance.toLocaleString()}</td>
                    <td className="p-4 text-center">
                      {r.status === "completed" ? (
                        <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800 text-[10px] font-black uppercase">
                          ✅ ສຳເລັດ
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase">
                          ⏳ ກຳລັງຜະລິດ
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <Link href={`/orders/${r.id}/edit`} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-black text-xs hover:bg-blue-600 hover:text-white transition-all">
                        ເປີດອໍເດີ້
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