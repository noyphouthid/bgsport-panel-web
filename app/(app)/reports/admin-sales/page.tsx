"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { MonthFilter, PrefixFilter, buildMonthOptions, buildYearOptions, matchPrefix, periodRange, prefixOptions } from "../_lib";

type OrderRow = {
  id: string;
  order_code: string;
  order_date: string;
  admin_user_id: string | null;
  short_qty: number;
  long_qty: number;
  net_total: number;
};

type UserRow = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

const ADMIN_ROLE_ALIASES = new Set(["admin", "sale-admin", "sale_admin"]);

type AdminSummary = {
  admin_id: string;
  admin_name: string;
  shirts_total: number;
  orders_total: number;
  sales_total: number;
};

export default function AdminSalesReportPage() {
  const now = new Date();
  const [month, setMonth] = useState<MonthFilter>(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [prefix, setPrefix] = useState<PrefixFilter>("ALL");
  const [adminFilter, setAdminFilter] = useState("ALL");

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [admins, setAdmins] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    const [{ data: orderData, error: orderError }, { data: userData, error: userError }] = await Promise.all([
      supabase
        .from("orders")
        .select("id,order_code,order_date,admin_user_id,short_qty,long_qty,net_total")
        .order("order_date", { ascending: false }),
      supabase.from("users").select("id,full_name,role,is_active").order("full_name", { ascending: true }),
    ]);

    if (orderError) {
      setErr(orderError.message);
      setOrders([]);
      setAdmins([]);
      setLoading(false);
      return;
    }
    if (userError) {
      setErr(userError.message);
      setAdmins([]);
    } else {
      const allUsers = (userData ?? []) as UserRow[];
      setAdmins(allUsers.filter((u) => ADMIN_ROLE_ALIASES.has(String(u.role || "").toLowerCase())));
    }

    setOrders((orderData ?? []) as OrderRow[]);
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const summaryRows = useMemo(() => {
    const { start, endExclusive } = periodRange(year, month);
    const adminMap = new Map(admins.map((u) => [u.id, u.full_name]));
    const grouped = new Map<string, AdminSummary>();

    for (const row of orders) {
      const date = new Date(`${row.order_date}T00:00:00`).toISOString();
      if (!(date >= start && date < endExclusive)) continue;
      if (!matchPrefix(row.order_code, prefix)) continue;
      if (!row.admin_user_id) continue;
      if (adminFilter !== "ALL" && row.admin_user_id !== adminFilter) continue;

      const key = row.admin_user_id;
      const current = grouped.get(key) ?? {
        admin_id: key,
        admin_name: adminMap.get(key) || "Unknown",
        shirts_total: 0,
        orders_total: 0,
        sales_total: 0,
      };
      current.shirts_total += (Number(row.short_qty) || 0) + (Number(row.long_qty) || 0);
      current.orders_total += 1;
      current.sales_total += Number(row.net_total) || 0;
      grouped.set(key, current);
    }

    return [...grouped.values()].sort((a, b) => b.sales_total - a.sales_total);
  }, [orders, admins, month, year, prefix, adminFilter]);

  const totals = useMemo(() => {
    return summaryRows.reduce(
      (acc, row) => {
        acc.shirts_total += row.shirts_total;
        acc.orders_total += row.orders_total;
        acc.sales_total += row.sales_total;
        return acc;
      },
      { shirts_total: 0, orders_total: 0, sales_total: 0 }
    );
  }, [summaryRows]);

  const exportExcel = () => {
    const periodLabel = month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`;
    const out = summaryRows.map((r) => ({
      "ຊື່ແອັດມິນ": r.admin_name,
      "ຈຳນວນເສື້ອທັງໝົດ": r.shirts_total,
      "ຈຳນວນອໍເດີ້": r.orders_total,
      "ຍອດຂາຍລວມ": r.sales_total,
    }));

    out.push({
      "ຊື່ແອັດມິນ": "ລວມທັງໝົດ",
      "ຈຳນວນເສື້ອທັງໝົດ": totals.shirts_total,
      "ຈຳນວນອໍເດີ້": totals.orders_total,
      "ຍອດຂາຍລວມ": totals.sales_total,
    });

    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "admin_sales_summary");
    XLSX.writeFile(wb, `admin-sales-summary-${periodLabel}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">ລາຍງານສະຫຼຸບຍອດຂາຍແອັດມິນ</h1>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm font-bold">Error: {err}</div>}

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={month} onChange={(e) => setMonth(e.target.value === "ALL" ? "ALL" : Number(e.target.value))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-800">
            {buildMonthOptions().map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-800">
            {buildYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={prefix} onChange={(e) => setPrefix(e.target.value as PrefixFilter)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-800">
            {prefixOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-white text-slate-800">
            <option value="ALL">ແອັດມິນທັງໝົດ</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ຈຳນວນເສື້ອລວມ</div>
            <div className="text-xl font-black text-emerald-600">{totals.shirts_total.toLocaleString()}</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ຈຳນວນອໍເດີ້ລວມ</div>
            <div className="text-xl font-black text-slate-900">{totals.orders_total.toLocaleString()}</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-xs text-slate-700 font-bold uppercase">ຍອດຂາຍລວມ</div>
            <div className="text-xl font-black text-blue-600">{totals.sales_total.toLocaleString()}</div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={exportExcel}
            disabled={summaryRows.length === 0}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-black disabled:opacity-50 transition-colors"
          >
            <Download size={16} />
            ດາວໂຫຼດ Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50 text-sm font-black text-slate-800 uppercase">ຕາຕະລາງຜົນລັບ ({summaryRows.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 text-slate-800 border-b border-slate-100">
              <tr>
                <th className="p-3 text-left text-xs uppercase font-black">ແອັດມິນ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ຈຳນວນເສື້ອລວມ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ຈຳນວນອໍເດີ້ລວມ</th>
                <th className="p-3 text-right text-xs uppercase font-black">ຍອດຂາຍລວມ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && summaryRows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center text-slate-700 font-bold" colSpan={4}>ບໍ່ມີຂໍ້ມູນ</td>
                </tr>
              ) : (
                summaryRows.map((r) => (
                  <tr key={r.admin_id}>
                    <td className="p-3 font-black text-slate-900">{r.admin_name}</td>
                    <td className="p-3 text-right text-slate-800 font-medium">{r.shirts_total.toLocaleString()}</td>
                    <td className="p-3 text-right text-slate-800 font-medium">{r.orders_total.toLocaleString()}</td>
                    <td className="p-3 text-right text-blue-600 font-black">{r.sales_total.toLocaleString()}</td>
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
