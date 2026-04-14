"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileDown, Printer } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import { useOrderTypeOptions } from "@/lib/order-code-options";
import {
  type MonthFilter,
  type PrefixFilter,
  type WorkflowStatusFilter,
  buildMonthOptions,
  buildYearOptions,
  exportReportElementAsPdf,
  getWorkflowStatus,
  getWorkflowStatusLabel,
  matchSelectedPrefixes,
  openReportPrintWindow,
  periodRange,
  toDateOnly,
  togglePrefix,
} from "../_lib";

type ReportOrder = {
  id: string;
  order_code: string;
  order_date: string;
  status: "in_progress" | "completed";
  closed_at?: string | null;
  production_completed_at: string | null;
  shipment_completed_at: string | null;
  shipment_status: "pending" | "shipped";
  admin_user_id: string | null;
  short_qty: number;
  long_qty: number;
  free_qty: number;
  net_total: number;
  factory_cost: number;
};

type UserOption = {
  id: string;
  full_name: string;
  role: AppRole;
};

type FactoryCostFilter = "all" | "missing_cost" | "has_cost";

function buildPeriodLabel(month: MonthFilter, year: number) {
  return month === "ALL" ? `ALL / ${year}` : `${String(month).padStart(2, "0")} / ${year}`;
}

export default function SalesProfitReportPage() {
  const now = new Date();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [month, setMonth] = useState<MonthFilter>(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selectedPrefixes, setSelectedPrefixes] = useState<PrefixFilter[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatusFilter>("all");
  const [factoryCostFilter, setFactoryCostFilter] = useState<FactoryCostFilter>("all");
  const [adminFilter, setAdminFilter] = useState("all");

  const [rows, setRows] = useState<ReportOrder[]>([]);
  const [adminOptions, setAdminOptions] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const { options: orderTypeOptions } = useOrderTypeOptions(true);
  const prefixChipOptions = useMemo(() => [...orderTypeOptions, "OTHER"] as PrefixFilter[], [orderTypeOptions]);
  const adminNames = useMemo(() => new Map(adminOptions.map((user) => [user.id, user.full_name])), [adminOptions]);

  const load = async () => {
    setLoading(true);
    setErr(null);

    const [{ data: orderData, error: orderError }, { data: userData, error: userError }] = await Promise.all([
      supabase
        .from("orders")
        .select("id,order_code,order_date,status,closed_at,production_completed_at,shipment_completed_at,shipment_status,admin_user_id,short_qty,long_qty,free_qty,net_total,factory_cost")
        .order("shipment_completed_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("users")
        .select("id,full_name,role")
        .eq("is_active", true)
        .in("role", ["superadmin", "admin", "manager", "staff"])
        .order("full_name", { ascending: true }),
    ]);

    if (orderError) {
      setErr(orderError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    if (userError) {
      setErr(userError.message);
      setAdminOptions([]);
    } else {
      setAdminOptions((userData ?? []) as UserOption[]);
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
    return rows.filter((row) => {
      const effectiveProfitAt = row.shipment_completed_at;
      if (!effectiveProfitAt) return false;
      if (!(effectiveProfitAt >= start && effectiveProfitAt < endExclusive)) return false;
      if (!matchSelectedPrefixes(row.order_code, selectedPrefixes)) return false;
      if (adminFilter !== "all" && row.admin_user_id !== adminFilter) return false;
      if (workflowStatus !== "all" && getWorkflowStatus(row) !== workflowStatus) return false;
      if (factoryCostFilter === "missing_cost" && Number(row.factory_cost || 0) > 0) return false;
      if (factoryCostFilter === "has_cost" && Number(row.factory_cost || 0) <= 0) return false;
      return true;
    });
  }, [rows, month, year, selectedPrefixes, adminFilter, workflowStatus, factoryCostFilter]);

  const summary = useMemo(() => {
    const totalSales = filteredRows.reduce((sum, row) => sum + (Number(row.net_total) || 0), 0);
    const totalShirts = filteredRows.reduce((sum, row) => sum + (Number(row.short_qty) || 0) + (Number(row.long_qty) || 0) + (Number(row.free_qty) || 0), 0);
    const totalOrders = filteredRows.length;
    const totalProfit = filteredRows.reduce((sum, row) => sum + ((Number(row.net_total) || 0) - (Number(row.factory_cost) || 0)), 0);
    return { totalSales, totalShirts, totalOrders, totalProfit };
  }, [filteredRows]);

  const periodLabel = buildPeriodLabel(month, year);
  const prefixSummary = selectedPrefixes.length === 0 ? "ALL" : selectedPrefixes.join(", ");

  const exportExcel = () => {
    const periodFileLabel = month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`;
    const exportRows = filteredRows.map((row) => ({
      shipment_completed_date: toDateOnly(row.shipment_completed_at),
      order_date: row.order_date,
      order_code: row.order_code,
      admin_name: adminNames.get(row.admin_user_id || "") || "-",
      total_qty: (Number(row.short_qty) || 0) + (Number(row.long_qty) || 0) + (Number(row.free_qty) || 0),
      net_total: Number(row.net_total) || 0,
      factory_cost: Number(row.factory_cost) || 0,
      profit: (Number(row.net_total) || 0) - (Number(row.factory_cost) || 0),
      workflow_status: getWorkflowStatusLabel(getWorkflowStatus(row)),
    }));

    exportRows.push({
      shipment_completed_date: periodLabel,
      order_date: `prefix=${prefixSummary}`,
      order_code: `admin=${adminFilter === "all" ? "ALL" : adminNames.get(adminFilter) || "-"}`,
      admin_name: `status=${workflowStatus}`,
      total_qty: summary.totalShirts,
      net_total: summary.totalSales,
      factory_cost: 0,
      profit: summary.totalProfit,
      workflow_status: `ລວມ ${summary.totalOrders} ອໍເດີ`,
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "sales_profit_report");
    XLSX.writeFile(wb, `sales-profit-${periodFileLabel}.xlsx`);
  };

  const handlePrint = () => {
    openReportPrintWindow({
      title: "ລາຍງານຍອດຂາຍ-ກຳໄລ",
      subtitle: `ໄລຍະ: ${periodLabel} | ລະຫັດ: ${prefixSummary} | ແອັດມິນ: ${adminFilter === "all" ? "ທັງໝົດ" : adminNames.get(adminFilter) || "-"}`,
      summary: [
        { label: "ຍອດຂາຍລວມ", value: summary.totalSales.toLocaleString() },
        { label: "ກຳໄລລວມ", value: summary.totalProfit.toLocaleString() },
        { label: "ຈຳນວນເສື້ອລວມ", value: summary.totalShirts.toLocaleString() },
        { label: "ອໍເດີທັງໝົດ", value: summary.totalOrders.toLocaleString() },
      ],
      headers: ["ວັນທີຈັດສົ່ງ", "ວັນທີສັ່ງ", "ລະຫັດອໍເດີ", "ແອັດມິນ", "ຈຳນວນ", "ຍອດຂາຍ", "ຕົ້ນທຶນ", "ກຳໄລ", "ສະຖານະ"],
      rows: filteredRows.map((row) => [
        toDateOnly(row.shipment_completed_at) || "-",
        row.order_date,
        row.order_code,
        adminNames.get(row.admin_user_id || "") || "-",
        ((Number(row.short_qty) || 0) + (Number(row.long_qty) || 0) + (Number(row.free_qty) || 0)).toLocaleString(),
        (Number(row.net_total) || 0).toLocaleString(),
        (Number(row.factory_cost) || 0).toLocaleString(),
        ((Number(row.net_total) || 0) - (Number(row.factory_cost) || 0)).toLocaleString(),
        getWorkflowStatusLabel(getWorkflowStatus(row)),
      ]),
    });
  };

  const handleExportPdf = async () => {
    if (!reportRef.current) return;
    setExportingPdf(true);
    try {
      await exportReportElementAsPdf(
        reportRef.current,
        `sales-profit-${month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`}.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5 text-slate-900" ref={reportRef}>
      <div>
        <h1 className="text-2xl font-black text-slate-900">ລາຍງານຍອດຂາຍ-ກຳໄລ</h1>
      </div>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">ຂໍ້ຜິດພາດ: {err}</div>}

      <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <select value={month} onChange={(e) => setMonth(e.target.value === "ALL" ? "ALL" : Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            {buildMonthOptions().map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            {buildYearOptions().map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={workflowStatus} onChange={(e) => setWorkflowStatus(e.target.value as WorkflowStatusFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ສະຖານະທັງໝົດ</option>
            <option value="in_progress">ກຳລັງຜະລິດ</option>
            <option value="production_completed">ຜະລິດສຳເລັດ</option>
            <option value="shipment_completed">ຈັດສົ່ງສຳເລັດ</option>
            <option value="completed">ສຳເລັດແລ້ວ</option>
          </select>
          <select value={factoryCostFilter} onChange={(e) => setFactoryCostFilter(e.target.value as FactoryCostFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ຕົ້ນທຶນໂຮງງານທັງໝົດ</option>
            <option value="missing_cost">ຍັງບໍ່ມີຕົ້ນທຶນໂຮງງານ</option>
            <option value="has_cost">ມີຕົ້ນທຶນໂຮງງານແລ້ວ</option>
          </select>
          <select value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ແອັດມິນທັງໝົດ</option>
            {adminOptions.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">ປະເພດລະຫັດ</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedPrefixes([])}
              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${selectedPrefixes.length === 0 ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              ALL
            </button>
            {prefixChipOptions.map((prefix) => {
              const active = selectedPrefixes.includes(prefix);
              return (
                <button
                  key={prefix}
                  type="button"
                  onClick={() => setSelectedPrefixes((prev) => togglePrefix(prev, prefix))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {prefix}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ຍອດຂາຍລວມ</div>
            <div className="text-xl font-black text-slate-900">{summary.totalSales.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ກຳໄລລວມ</div>
            <div className="text-xl font-black text-blue-600">{summary.totalProfit.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ຈຳນວນເສື້ອລວມ</div>
            <div className="text-xl font-black text-emerald-600">{summary.totalShirts.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ອໍເດີທັງໝົດ</div>
            <div className="text-xl font-black text-slate-900">{summary.totalOrders.toLocaleString()}</div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={handlePrint} disabled={filteredRows.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Printer size={16} />
            ພິມ
          </button>
          <button onClick={handleExportPdf} disabled={filteredRows.length === 0 || exportingPdf} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50">
            <FileDown size={16} />
            {exportingPdf ? "ກຳລັງສ້າງ PDF..." : "ສ້າງ PDF"}
          </button>
          <button onClick={exportExcel} disabled={filteredRows.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">
            <Download size={16} />
            ດາວໂຫຼດ XLSX
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b bg-slate-50 p-4 text-sm font-black uppercase text-slate-800">ຕາຕະລາງຜົນໄດ້ຮັບ ({filteredRows.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-slate-700">
              <tr>
                <th className="p-3 text-left text-xs font-black uppercase">ວັນທີຈັດສົ່ງ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ວັນທີສັ່ງ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ລະຫັດອໍເດີ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ແອັດມິນ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ຈຳນວນ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ຍອດຂາຍ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ຕົ້ນທຶນ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ກຳໄລ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ສະຖານະ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center font-bold text-slate-500" colSpan={9}>ບໍ່ມີຂໍ້ມູນ</td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="p-3 text-slate-800">{toDateOnly(row.shipment_completed_at) || "-"}</td>
                    <td className="p-3 text-slate-800">{row.order_date}</td>
                    <td className="p-3 font-black text-slate-900">{row.order_code}</td>
                    <td className="p-3 text-slate-800">{adminNames.get(row.admin_user_id || "") || "-"}</td>
                    <td className="p-3 text-right text-slate-800">{((Number(row.short_qty) || 0) + (Number(row.long_qty) || 0) + (Number(row.free_qty) || 0)).toLocaleString()}</td>
                    <td className="p-3 text-right text-slate-800">{(Number(row.net_total) || 0).toLocaleString()}</td>
                    <td className="p-3 text-right text-slate-800">{(Number(row.factory_cost) || 0).toLocaleString()}</td>
                    <td className="p-3 text-right font-bold text-blue-600">{((Number(row.net_total) || 0) - (Number(row.factory_cost) || 0)).toLocaleString()}</td>
                    <td className="p-3 font-medium text-slate-800">{getWorkflowStatusLabel(getWorkflowStatus(row))}</td>
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
