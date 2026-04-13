"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useOrderTypeOptions } from "@/lib/order-code-options";
import { MonthFilter, PrefixFilter, buildMonthOptions, buildYearOptions, matchPrefix, periodRange, toDateOnly } from "../_lib";

type ReportOrder = {
  id: string;
  order_code: string;
  order_date: string;
  status: "in_progress" | "completed";
  production_completed_at: string | null;
  shipment_completed_at: string | null;
  shipment_status: "pending" | "shipped";
  balance: number;
  short_qty: number;
  long_qty: number;
  free_qty: number;
  net_total: number;
  factory_cost: number;
};

type StatusFilter = "all" | "in_progress" | "production_completed" | "completed";
type FactoryCostFilter = "all" | "missing_cost" | "has_cost";

function getProductionStatus(order: Pick<ReportOrder, "production_completed_at" | "status">): Exclude<StatusFilter, "all"> {
  if (order.status === "completed") return "completed";
  if (order.production_completed_at) return "production_completed";
  return "in_progress";
}

function getStatusLabel(status: Exclude<StatusFilter, "all">) {
  if (status === "in_progress") return "ກຳລັງຜະລິດ";
  if (status === "production_completed") return "ອໍເດີ້ຜະລິດສຳເລັດ";
  return "ອໍເດີ້ສຳເລັດແລ້ວ";
}

export default function SalesProfitReportPage() {
  const now = new Date();
  const [month, setMonth] = useState<MonthFilter>(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [prefix, setPrefix] = useState<PrefixFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [factoryCostFilter, setFactoryCostFilter] = useState<FactoryCostFilter>("all");

  const [rows, setRows] = useState<ReportOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const { options: orderTypeOptions } = useOrderTypeOptions(true);
  const prefixOptions = useMemo(() => ["ALL", ...orderTypeOptions, "OTHER"], [orderTypeOptions]);

  const load = async () => {
    setLoading(true);
    setErr(null);
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id,order_code,order_date,status,production_completed_at,shipment_completed_at,shipment_status,balance,short_qty,long_qty,free_qty,net_total,factory_cost")
      .order("order_date", { ascending: false });

    if (orderError) {
      setErr(orderError.message);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((orderData ?? []) as ReportOrder[]);
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const filteredRows = useMemo(() => {
    const { start, endExclusive } = periodRange(year, month);
    return rows.filter((r) => {
      const effectiveProfitAt = r.shipment_completed_at;
      if (!effectiveProfitAt) return false;
      if (!(effectiveProfitAt >= start && effectiveProfitAt < endExclusive)) return false;
      if (!matchPrefix(r.order_code, prefix)) return false;
      const productionStatus = getProductionStatus(r);
      if (status !== "all" && productionStatus !== status) return false;
      if (factoryCostFilter === "missing_cost" && Number(r.factory_cost || 0) > 0) return false;
      if (factoryCostFilter === "has_cost" && Number(r.factory_cost || 0) <= 0) return false;
      return true;
    });
  }, [rows, month, year, prefix, status, factoryCostFilter]);

  const summary = useMemo(() => {
    const totalSales = filteredRows.reduce((sum, r) => sum + (Number(r.net_total) || 0), 0);
    const totalShirts = filteredRows.reduce(
      (sum, r) => sum + (Number(r.short_qty) || 0) + (Number(r.long_qty) || 0) + (Number(r.free_qty) || 0),
      0
    );
    const totalOrders = filteredRows.length;
    const totalProfit = filteredRows.reduce(
      (sum, r) => sum + ((Number(r.net_total) || 0) - (Number(r.factory_cost) || 0)),
      0
    );
    return { totalSales, totalShirts, totalOrders, totalProfit };
  }, [filteredRows]);

  const exportExcel = () => {
    const periodLabel = month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`;
    const exportRows = filteredRows.map((r) => ({
      "ວັນທີສັ່ງ": r.order_date,
      "ວັນທີຜະລິດສຳເລັດ": toDateOnly(r.production_completed_at),
      "ວັນທີຈັດສົ່ງສຳເລັດ": toDateOnly(r.shipment_completed_at),
      "ລະຫັດອໍເດີ": r.order_code,
      "ຈຳນວນເສື້ອ": (Number(r.short_qty) || 0) + (Number(r.long_qty) || 0) + (Number(r.free_qty) || 0),
      "ຈຳນວນແຖມ": Number(r.free_qty) || 0,
      "ແຂນສັ້ນ": Number(r.short_qty) || 0,
      "ແຂນຍາວ": Number(r.long_qty) || 0,
      "ຍອດຂາຍສຸດທິ": Number(r.net_total) || 0,
      "ຕົ້ນທຶນໂຮງງານ": Number(r.factory_cost) || 0,
      "ກຳໄລ": (Number(r.net_total) || 0) - (Number(r.factory_cost) || 0),
      "ສະຖານະ": `${getStatusLabel(getProductionStatus(r))} / ${r.shipment_status === "shipped" ? "ຈັດສົ່ງສຳເລັດ" : "ລໍຖ້າຈັດສົ່ງ"}`,
    }));

    exportRows.push({
      "ວັນທີສັ່ງ": "ສະຫຼຸບລວມ",
      "ວັນທີຜະລິດສຳເລັດ": "-",
      "ວັນທີຈັດສົ່ງສຳເລັດ": periodLabel,
      "ລະຫັດອໍເດີ": `prefix=${prefix} status=${status}`,
      "ຈຳນວນເສື້ອ": summary.totalShirts,
      "ຈຳນວນແຖມ": 0,
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
            <option value="all">ສະຖານະຜະລິດທັງໝົດ</option>
            <option value="in_progress">ກຳລັງຜະລິດ</option>
            <option value="production_completed">ອໍເດີ້ຜະລິດສຳເລັດ</option>
            <option value="completed">ອໍເດີ້ສຳເລັດແລ້ວ</option>
          </select>
          <select value={factoryCostFilter} onChange={(e) => setFactoryCostFilter(e.target.value as FactoryCostFilter)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-900">
            <option value="all">ຕົ້ນທຶນໂຮງງານທັງໝົດ</option>
            <option value="missing_cost">ຍັງບໍ່ມີຕົ້ນທຶນໂຮງງານ</option>
            <option value="has_cost">ມີຕົ້ນທຶນໂຮງງານແລ້ວ</option>
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
          <button onClick={exportExcel} disabled={filteredRows.length === 0} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-black hover:bg-emerald-700 transition-colors disabled:opacity-50">
            <Download size={16} />
            ດາວໂຫຼດ XLSX
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50 text-sm font-black text-slate-800 uppercase">ຕາຕະລາງຜົນໄດ້ຮັບ ({filteredRows.length})</div>
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
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center text-slate-500 font-bold" colSpan={7}>ບໍ່ມີຂໍ້ມູນ</td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 text-slate-800">{r.order_date}</td>
                    <td className="p-3 font-black text-slate-900">{r.order_code}</td>
                    <td className="p-3 text-right text-slate-800">{((Number(r.short_qty) || 0) + (Number(r.long_qty) || 0) + (Number(r.free_qty) || 0)).toLocaleString()}</td>
                    <td className="p-3 text-right text-slate-800">{(Number(r.net_total) || 0).toLocaleString()}</td>
                    <td className="p-3 text-right text-slate-800">{(Number(r.factory_cost) || 0).toLocaleString()}</td>
                    <td className="p-3 text-right text-blue-600 font-bold">{((Number(r.net_total) || 0) - (Number(r.factory_cost) || 0)).toLocaleString()}</td>
                    <td className="p-3 text-slate-800 font-medium">{getStatusLabel(getProductionStatus(r))}</td>
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
