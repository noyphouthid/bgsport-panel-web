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
  // ym = YYYY-MM
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

    // Prefix
    if (activePrefix !== "ALL") q = q.ilike("order_code", `${activePrefix}%`);

    // Query OR
    const s = query.trim();
    if (s) {
      const escaped = s.replace(/%/g, "\\%").replace(/_/g, "\\_");
      q = q.or(`order_code.ilike.%${escaped}%,factory_bill_code.ilike.%${escaped}%,customer_phone.ilike.%${escaped}%`);
    }

    // Date filter
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
          <h1 className="text-2xl font-bold">ຄົ້ນຫາ</h1>
          <div className="text-sm text-gray-500">
            ຄົ້ນຫາ: ລະຫັດຮ້ານ / ລະຫັດໂຮງງານ / ເບີໂທ
          </div>
        </div>

        <button
          onClick={resetAll}
          className="bg-red-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-red-700"
        >
          ລ້າງທັງໝົດ
        </button>
      </div>

      {err && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
          Error: {err}
        </div>
      )}

      <div className="bg-white rounded shadow p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="text-xs font-semibold text-gray-600">ຄົ້ນຫາ</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ພິມ: ລະຫັດອໍເດີ້ / ບິນໂຮງງານ / ເບີໂທ"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="md:col-span-2 flex gap-2">
            <button
              onClick={runSearch}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 w-full"
            >
              {loading ? "ກຳລັງຄົ້ນ..." : "ຄົ້ນຫາ"}
            </button>
            <button
              onClick={resetAll}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm font-semibold hover:bg-gray-300 w-full"
            >
              ລ້າງ
            </button>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-600 mb-2">ກຸ່ມລະຫັດ</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActivePrefix("ALL")}
              className={`px-3 py-1 rounded text-sm border ${
                activePrefix === "ALL" ? "bg-slate-800 text-white border-slate-800" : "bg-white hover:bg-gray-50"
              }`}
            >
              ທັງໝົດ
            </button>

            {PREFIXES.map((p) => (
              <button
                key={p}
                onClick={() => setActivePrefix(p)}
                className={`px-3 py-1 rounded text-sm border ${
                  activePrefix === p ? "bg-slate-800 text-white border-slate-800" : "bg-white hover:bg-gray-50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-gray-600">ກອງເວລາ</label>
            <select
              value={dateMode}
              onChange={(e) => setDateMode(e.target.value as DateMode)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="day">ຕາມວັນ</option>
              <option value="month">ຕາມເດືອນ</option>
              <option value="year">ຕາມປີ</option>
            </select>
          </div>

          {dateMode === "day" && (
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-600">ວັນທີ</label>
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          )}

          {dateMode === "month" && (
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-600">ເດືອນ</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          )}

          {dateMode === "year" && (
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-600">ປີ</label>
              <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" min={2000} max={2100} />
            </div>
          )}

          <div className="md:col-span-2 text-xs text-gray-500">
            ຜົນລັບ: <span className="font-semibold">{resultCount}</span> ລາຍການ
          </div>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        <div className="p-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-700">ຜົນການຄົ້ນຫາ</div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="p-3 text-left">ວັນທີ</th>
              <th className="p-3 text-left">ລະຫັດອໍເດີ້</th>
              <th className="p-3 text-left">ບິນໂຮງງານ</th>
              <th className="p-3 text-left">ເບີໂທ</th>
              <th className="p-3 text-left">ຜ້າ</th>
              <th className="p-3 text-right">ຄ້າງ</th>
              <th className="p-3 text-center">ສະຖານະ</th>
              <th className="p-3 text-center">ຈັດການ</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t">
                <td className="p-4 text-gray-500" colSpan={8}>
                  ບໍ່ມີຂໍ້ມູນ (ກົດ “ຄົ້ນຫາ”)
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.order_date}</td>
                  <td className="p-3 font-semibold">{r.order_code}</td>
                  <td className="p-3 text-gray-600">{r.factory_bill_code?.trim() ? r.factory_bill_code : "—"}</td>
                  <td className="p-3">{r.customer_phone ?? "—"}</td>
                  <td className="p-3">{r.fabric_name}</td>
                  <td className="p-3 text-right text-red-600 font-semibold">{r.balance.toLocaleString()}</td>
                  <td className="p-3 text-center">
                    {r.status === "completed" ? (
                      <span className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-semibold">
                        ສຳເລັດແລ້ວ
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800 text-xs font-semibold">
                        ກຳລັງຜະລິດ
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <Link href={`/orders/${r.id}/edit`} className="text-blue-600 font-semibold hover:underline">
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
  );
}
