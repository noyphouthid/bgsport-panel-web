"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { MonthFilter, PrefixFilter, buildMonthOptions, buildYearOptions, matchPrefix, periodRange, prefixOptions, toDateOnly } from "../_lib";

type OrderRow = {
  id: string;
  order_code: string;
  order_date: string;
  production_completed_at: string | null;
  customer_phone: string | null;
  initial_deposit: number;
  balance: number;
  net_total: number;
  status: "in_progress" | "completed";
};

type PaymentStatus = "all" | "paid" | "unpaid";
type ProductionStatus = "all" | "in_progress" | "completed";

export default function OrdersReportPage() {
  const now = new Date();
  const [month, setMonth] = useState<MonthFilter>(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [prefix, setPrefix] = useState<PrefixFilter>("ALL");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("all");
  const [productionStatus, setProductionStatus] = useState<ProductionStatus>("all");

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("orders")
      .select("id,order_code,order_date,production_completed_at,customer_phone,initial_deposit,balance,net_total,status")
      .order("order_date", { ascending: false });
    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as OrderRow[]);
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
      const date = new Date(`${r.order_date}T00:00:00`).toISOString();
      if (!(date >= start && date < endExclusive)) return false;
      if (!matchPrefix(r.order_code, prefix)) return false;
      const isPaid = Number(r.balance) === 0;
      if (paymentStatus === "paid" && !isPaid) return false;
      if (paymentStatus === "unpaid" && isPaid) return false;
      if (productionStatus !== "all" && r.status !== productionStatus) return false;
      return true;
    });
  }, [rows, year, month, prefix, paymentStatus, productionStatus]);

  const summary = useMemo(() => {
    const paidAmount = filteredRows.reduce((sum, r) => sum + (Number(r.initial_deposit) || 0), 0);
    const outstandingAmount = filteredRows.reduce((sum, r) => sum + (Number(r.balance) || 0), 0);
    const paidOrders = filteredRows.filter((r) => Number(r.balance) === 0).length;
    const unpaidOrders = filteredRows.length - paidOrders;
    return { paidAmount, outstandingAmount, paidOrders, unpaidOrders };
  }, [filteredRows]);

  const exportExcel = () => {
    const periodLabel = month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`;
    type ExportRow = {
      order_code: string;
      customer_phone: string;
      order_date: string;
      production_completed_date: string;
      net_total: number;
      paid_amount: number;
      outstanding_amount: number;
      payment_status: string;
      production_status: string;
    };

    const out: ExportRow[] = filteredRows.map((r) => ({
      order_code: r.order_code,
      customer_phone: r.customer_phone ?? "",
      order_date: r.order_date,
      production_completed_date: toDateOnly(r.production_completed_at),
      net_total: Number(r.net_total) || 0,
      paid_amount: Number(r.initial_deposit) || 0,
      outstanding_amount: Number(r.balance) || 0,
      payment_status: Number(r.balance) === 0 ? "ຈ່າຍແລ້ວ" : "ຄ້າງຈ່າຍ",
      production_status: String(r.status),
    }));

    out.push({
      order_code: "ສະຫຼຸບລວມ",
      customer_phone: periodLabel,
      order_date: `prefix=${prefix}`,
      production_completed_date: `payment=${paymentStatus} production=${productionStatus}`,
      net_total: 0,
      paid_amount: summary.paidAmount,
      outstanding_amount: summary.outstandingAmount,
      payment_status: `ຈ່າຍແລ້ວ=${summary.paidOrders} ອໍເດີ`,
      production_status: `ຄ້າງຈ່າຍ=${summary.unpaidOrders} ອໍເດີ`,
    });

    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "orders_report");
    XLSX.writeFile(wb, `orders-report-${periodLabel}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">ລາຍງານອໍເດີ້</h1>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm font-bold">ຂໍ້ຜິດພາດ: {err}</div>}

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select value={month} onChange={(e) => setMonth(e.target.value === "ALL" ? "ALL" : Number(e.target.value))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-900">
            {buildMonthOptions().map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-900">
            {buildYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={prefix} onChange={(e) => setPrefix(e.target.value as PrefixFilter)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-900">
            {prefixOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-900">
            <option value="all">ການຊຳລະທັງໝົດ</option>
            <option value="paid">ຈ່າຍແລ້ວ</option>
            <option value="unpaid">ຄ້າງຈ່າຍ</option>
          </select>
          <select value={productionStatus} onChange={(e) => setProductionStatus(e.target.value as ProductionStatus)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-900">
            <option value="all">ສະຖານະຜະລິດທັງໝົດ</option>
            <option value="in_progress">ກຳລັງຜະລິດ</option>
            <option value="completed">ຜະລິດສຳເລັດ</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ຍອດຈ່າຍແລ້ວ</div>
            <div className="text-xl font-black text-emerald-600">{summary.paidAmount.toLocaleString()}</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ຍອດຄ້າງຈ່າຍ</div>
            <div className="text-xl font-black text-rose-600">{summary.outstandingAmount.toLocaleString()}</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ອໍເດີຈ່າຍແລ້ວ</div>
            <div className="text-xl font-black text-slate-900">{summary.paidOrders.toLocaleString()}</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ອໍເດີຄ້າງຈ່າຍ</div>
            <div className="text-xl font-black text-slate-900">{summary.unpaidOrders.toLocaleString()}</div>
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
                <th className="p-3 text-left text-xs uppercase font-black">ລະຫັດອໍເດີ</th>
                <th className="p-3 text-left text-xs uppercase font-black">ເບີໂທລູກຄ້າ</th>
                <th className="p-3 text-left text-xs uppercase font-black">ວັນທີສັ່ງ</th>
                <th className="p-3 text-left text-xs uppercase font-black">ຜະລິດສຳເລັດ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ຈ່າຍແລ້ວ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ຄ້າງຈ່າຍ</th>
                <th className="p-3 text-left text-xs uppercase font-black">ການຊຳລະ</th>
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
                    <td className="p-3 font-black text-slate-900">{r.order_code}</td>
                    <td className="p-3 text-slate-800">{r.customer_phone || "-"}</td>
                    <td className="p-3 text-slate-800">{r.order_date}</td>
                    <td className="p-3 text-slate-800">{toDateOnly(r.production_completed_at) || "-"}</td>
                    <td className="p-3 text-right text-emerald-600 font-bold">{(Number(r.initial_deposit) || 0).toLocaleString()}</td>
                    <td className="p-3 text-right text-rose-600 font-bold">{(Number(r.balance) || 0).toLocaleString()}</td>
                    <td className="p-3 text-slate-800 font-medium">{Number(r.balance) === 0 ? "ຈ່າຍແລ້ວ" : "ຄ້າງຈ່າຍ"}</td>
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

