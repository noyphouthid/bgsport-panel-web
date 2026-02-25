"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { MonthFilter, PrefixFilter, buildMonthOptions, buildYearOptions, matchPrefix, periodRange, prefixOptions, toDateOnly } from "../_lib";

type ReportOrder = {
  id: string;
  order_code: string;
  order_date: string;
  production_completed_at: string | null;
  short_qty: number;
  long_qty: number;
  net_total: number;
  factory_cost: number;
  status: "in_progress" | "completed";
};

type StatusFilter = "all" | "in_progress" | "completed";

function getStatusLabel(status: ReportOrder["status"]) {
  if (status === "in_progress") return "ກຳລັງດຳເນີນການ";
  return "ສຳເລັດແລ້ວ";
}

export default function SalesProfitReportPage() {
  const now = new Date();
  const [month, setMonth] = useState<MonthFilter>(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [prefix, setPrefix] = useState<PrefixFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("all");

  const [rows, setRows] = useState<ReportOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("orders")
      .select("id,order_code,order_date,production_completed_at,short_qty,long_qty,net_total,factory_cost,status")
      .order("order_date", { ascending: false });
    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as ReportOrder[]);
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const filteredByOrderDate = useMemo(() => {
    const { start, endExclusive } = periodRange(year, month);
    return rows.filter((r) => {
      const date = new Date(`${r.order_date}T00:00:00`).toISOString();
      if (!(date >= start && date < endExclusive)) return false;
      if (!matchPrefix(r.order_code, prefix)) return false;
      if (status !== "all" && r.status !== status) return false;
      return true;
    });
  }, [rows, month, year, prefix, status]);

  const filteredForProfit = useMemo(() => {
    const { start, endExclusive } = periodRange(year, month);
    return rows.filter((r) => {
      if (!r.production_completed_at) return false;
      if (!(r.production_completed_at >= start && r.production_completed_at < endExclusive)) return false;
      if (!matchPrefix(r.order_code, prefix)) return false;
      if (status !== "all" && r.status !== status) return false;
      return true;
    });
  }, [rows, month, year, prefix, status]);

  const summary = useMemo(() => {
    const totalSales = filteredByOrderDate.reduce((sum, r) => sum + (Number(r.net_total) || 0), 0);
    const totalShirts = filteredByOrderDate.reduce(
      (sum, r) => sum + (Number(r.short_qty) || 0) + (Number(r.long_qty) || 0),
      0
    );
    const totalOrders = filteredByOrderDate.length;
    const totalProfit = filteredForProfit.reduce(
      (sum, r) => sum + ((Number(r.net_total) || 0) - (Number(r.factory_cost) || 0)),
      0
    );
    return { totalSales, totalShirts, totalOrders, totalProfit };
  }, [filteredByOrderDate, filteredForProfit]);

  const exportExcel = () => {
    const periodLabel = month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`;
    const exportRows = filteredByOrderDate.map((r) => ({
      "ວັນທີສັ່ງ": r.order_date,
      "ວັນທີຜະລິດສຳເລັດ": toDateOnly(r.production_completed_at),
      "ລະຫັດອໍເດີ": r.order_code,
      "ຈຳນວນເສື້ອ": (Number(r.short_qty) || 0) + (Number(r.long_qty) || 0),
      "ແຂນສັ້ນ": Number(r.short_qty) || 0,
      "ແຂນຍາວ": Number(r.long_qty) || 0,
      "ຍອດຂາຍສຸດທິ": Number(r.net_total) || 0,
      "ຕົ້ນທຶນໂຮງງານ": Number(r.factory_cost) || 0,
      "ກຳໄລ": (Number(r.net_total) || 0) - (Number(r.factory_cost) || 0),
      "ສະຖານະ": getStatusLabel(r.status),
    }));

    exportRows.push({
      "ວັນທີສັ່ງ": "ສະຫຼຸບລວມ",
      "ວັນທີຜະລິດສຳເລັດ": periodLabel,
      "ລະຫັດອໍເດີ": `prefix=${prefix} status=${status}`,
      "ຈຳນວນເສື້ອ": summary.totalShirts,
      "ແຂນສັ້ນ": 0,
      "ແຂນຍາວ": 0,
      "ຍອດຂາຍສຸດທິ": summary.totalSales,
      "ຕົ້ນທຶນໂຮງງານ": 0,
      "ກຳໄລ": summary.totalProfit,
      "ສະຖານະ": `ລວມ ${summary.totalOrders} ອໍເດີ`,
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "sales_profit_report");
    XLSX.writeFile(wb, `sales-profit-${periodLabel}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">ລາຍງານຍອດຂາຍ-ກຳໄລ</h1>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm font-bold">ຂໍ້ຜິດພາດ: {err}</div>}

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={month} onChange={(e) => setMonth(e.target.value === "ALL" ? "ALL" : Number(e.target.value))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-900">
            {buildMonthOptions().map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-900">
            {buildYearOptions().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={prefix} onChange={(e) => setPrefix(e.target.value as PrefixFilter)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-900">
            {prefixOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-900">
            <option value="all">ສະຖານະທັງໝົດ</option>
            <option value="in_progress">ກຳລັງດຳເນີນການ</option>
            <option value="completed">ສຳເລັດແລ້ວ</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ຍອດຂາຍລວມ</div>
            <div className="text-xl font-black text-slate-900">{summary.totalSales.toLocaleString()}</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ກຳໄລລວມ</div>
            <div className="text-xl font-black text-blue-600">{summary.totalProfit.toLocaleString()}</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ຈຳນວນເສື້ອລວມ</div>
            <div className="text-xl font-black text-emerald-600">{summary.totalShirts.toLocaleString()}</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ອໍເດີທັງໝົດ</div>
            <div className="text-xl font-black text-slate-900">{summary.totalOrders.toLocaleString()}</div>
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={exportExcel} disabled={filteredByOrderDate.length === 0} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-black hover:bg-emerald-700 transition-colors disabled:opacity-50">
            <Download size={16} />
            ດາວໂຫຼດ XLSX
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50 text-sm font-black text-slate-800 uppercase">ຕາຕະລາງຜົນໄດ້ຮັບ ({filteredByOrderDate.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 text-slate-700 border-b border-slate-100">
              <tr>
                <th className="p-3 text-left text-xs uppercase font-black">ວັນທີສັ່ງ</th>
                <th className="p-3 text-left text-xs uppercase font-black">ລະຫັດອໍເດີ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ຈຳນວນ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ຍອດຂາຍ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ຕົ້ນທຶນ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ກຳໄລ</th>
                <th className="p-3 text-left text-xs uppercase font-black">ສະຖານະ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && filteredByOrderDate.length === 0 ? (
                <tr>
                  <td className="p-8 text-center text-slate-500 font-bold" colSpan={7}>ບໍ່ມີຂໍ້ມູນ</td>
                </tr>
              ) : (
                filteredByOrderDate.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 text-slate-800">{r.order_date}</td>
                    <td className="p-3 font-black text-slate-900">{r.order_code}</td>
                    <td className="p-3 text-right text-slate-800">{((Number(r.short_qty) || 0) + (Number(r.long_qty) || 0)).toLocaleString()}</td>
                    <td className="p-3 text-right text-slate-800">{(Number(r.net_total) || 0).toLocaleString()}</td>
                    <td className="p-3 text-right text-slate-800">{(Number(r.factory_cost) || 0).toLocaleString()}</td>
                    <td className="p-3 text-right text-blue-600 font-bold">{((Number(r.net_total) || 0) - (Number(r.factory_cost) || 0)).toLocaleString()}</td>
                    <td className="p-3 text-slate-800 font-medium">{getStatusLabel(r.status)}</td>
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
