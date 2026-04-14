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

type OrderRow = {
  id: string;
  order_code: string;
  order_date: string;
  production_completed_at: string | null;
  shipment_completed_at: string | null;
  shipment_status: "pending" | "shipped";
  customer_phone: string | null;
  initial_deposit: number;
  balance: number;
  net_total: number;
  status: "in_progress" | "completed";
  closed_at?: string | null;
  admin_user_id: string | null;
};

type UserOption = {
  id: string;
  full_name: string;
  role: AppRole;
};

type PaymentStatus = "all" | "paid" | "unpaid";

function buildPeriodLabel(month: MonthFilter, year: number) {
  return month === "ALL" ? `ALL / ${year}` : `${String(month).padStart(2, "0")} / ${year}`;
}

export default function OrdersReportPage() {
  const now = new Date();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [month, setMonth] = useState<MonthFilter>(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selectedPrefixes, setSelectedPrefixes] = useState<PrefixFilter[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("all");
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatusFilter>("all");
  const [adminFilter, setAdminFilter] = useState("all");

  const [rows, setRows] = useState<OrderRow[]>([]);
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
        .select("id,order_code,order_date,production_completed_at,shipment_completed_at,shipment_status,customer_phone,initial_deposit,balance,net_total,status,closed_at,admin_user_id")
        .order("order_date", { ascending: false }),
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

    setRows((orderData ?? []) as OrderRow[]);
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
      const date = new Date(`${row.order_date}T00:00:00`).toISOString();
      if (!(date >= start && date < endExclusive)) return false;
      if (!matchSelectedPrefixes(row.order_code, selectedPrefixes)) return false;
      if (adminFilter !== "all" && row.admin_user_id !== adminFilter) return false;
      const isPaid = Number(row.balance) === 0;
      if (paymentStatus === "paid" && !isPaid) return false;
      if (paymentStatus === "unpaid" && isPaid) return false;
      if (workflowStatus !== "all" && getWorkflowStatus(row) !== workflowStatus) return false;
      return true;
    });
  }, [rows, year, month, selectedPrefixes, adminFilter, paymentStatus, workflowStatus]);

  const summary = useMemo(() => {
    const paidAmount = filteredRows.reduce((sum, row) => sum + ((Number(row.net_total) || 0) - (Number(row.balance) || 0)), 0);
    const outstandingAmount = filteredRows.reduce((sum, row) => sum + (Number(row.balance) || 0), 0);
    const paidOrders = filteredRows.filter((row) => Number(row.balance) === 0).length;
    const unpaidOrders = filteredRows.length - paidOrders;
    return { paidAmount, outstandingAmount, paidOrders, unpaidOrders };
  }, [filteredRows]);

  const periodLabel = buildPeriodLabel(month, year);
  const prefixSummary = selectedPrefixes.length === 0 ? "ALL" : selectedPrefixes.join(", ");

  const exportExcel = () => {
    const periodFileLabel = month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`;
    const out = filteredRows.map((row) => ({
      order_code: row.order_code,
      admin_name: adminNames.get(row.admin_user_id || "") || "-",
      customer_phone: row.customer_phone ?? "",
      order_date: row.order_date,
      production_completed_date: toDateOnly(row.production_completed_at),
      shipment_completed_date: toDateOnly(row.shipment_completed_at),
      net_total: Number(row.net_total) || 0,
      paid_amount: (Number(row.net_total) || 0) - (Number(row.balance) || 0),
      outstanding_amount: Number(row.balance) || 0,
      payment_status: Number(row.balance) === 0 ? "ຈ່າຍແລ້ວ" : "ຄ້າງຈ່າຍ",
      workflow_status: getWorkflowStatusLabel(getWorkflowStatus(row)),
    }));

    out.push({
      order_code: "ສະຫຼຸບລວມ",
      admin_name: adminFilter === "all" ? "ALL ADMIN" : adminNames.get(adminFilter) || "-",
      customer_phone: periodLabel,
      order_date: `prefix=${prefixSummary}`,
      production_completed_date: `payment=${paymentStatus}`,
      shipment_completed_date: `status=${workflowStatus}`,
      net_total: 0,
      paid_amount: summary.paidAmount,
      outstanding_amount: summary.outstandingAmount,
      payment_status: `ຈ່າຍແລ້ວ=${summary.paidOrders}`,
      workflow_status: `ຄ້າງຈ່າຍ=${summary.unpaidOrders}`,
    });

    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "orders_report");
    XLSX.writeFile(wb, `orders-report-${periodFileLabel}.xlsx`);
  };

  const handlePrint = () => {
    openReportPrintWindow({
      title: "ລາຍງານອໍເດີ້",
      subtitle: `ໄລຍະ: ${periodLabel} | ລະຫັດ: ${prefixSummary} | ແອັດມິນ: ${adminFilter === "all" ? "ທັງໝົດ" : adminNames.get(adminFilter) || "-"}`,
      summary: [
        { label: "ຍອດຈ່າຍແລ້ວ", value: summary.paidAmount.toLocaleString() },
        { label: "ຍອດຄ້າງຈ່າຍ", value: summary.outstandingAmount.toLocaleString() },
        { label: "ອໍເດີຈ່າຍແລ້ວ", value: summary.paidOrders.toLocaleString() },
        { label: "ອໍເດີຄ້າງຈ່າຍ", value: summary.unpaidOrders.toLocaleString() },
      ],
      headers: ["ລະຫັດອໍເດີ", "ແອັດມິນ", "ເບີໂທ", "ວັນທີສັ່ງ", "ຜະລິດສຳເລັດ", "ຈັດສົ່ງສຳເລັດ", "ຈ່າຍແລ້ວ", "ຄ້າງ", "ສະຖານະ"],
      rows: filteredRows.map((row) => [
        row.order_code,
        adminNames.get(row.admin_user_id || "") || "-",
        row.customer_phone || "-",
        row.order_date,
        toDateOnly(row.production_completed_at) || "-",
        toDateOnly(row.shipment_completed_at) || "-",
        ((Number(row.net_total) || 0) - (Number(row.balance) || 0)).toLocaleString(),
        (Number(row.balance) || 0).toLocaleString(),
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
        `orders-report-${month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`}.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5 text-slate-900" ref={reportRef}>
      <div>
        <h1 className="text-2xl font-black text-slate-900">ລາຍງານອໍເດີ້</h1>
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
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ການຊຳລະທັງໝົດ</option>
            <option value="paid">ຈ່າຍແລ້ວ</option>
            <option value="unpaid">ຄ້າງຈ່າຍ</option>
          </select>
          <select value={workflowStatus} onChange={(e) => setWorkflowStatus(e.target.value as WorkflowStatusFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ສະຖານະທັງໝົດ</option>
            <option value="in_progress">ກຳລັງຜະລິດ</option>
            <option value="production_completed">ຜະລິດສຳເລັດ</option>
            <option value="shipment_completed">ຈັດສົ່ງສຳເລັດ</option>
            <option value="completed">ສຳເລັດແລ້ວ</option>
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
            <div className="text-xs font-bold uppercase text-slate-700">ຍອດຈ່າຍແລ້ວ</div>
            <div className="text-xl font-black text-emerald-600">{summary.paidAmount.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ຍອດຄ້າງຈ່າຍ</div>
            <div className="text-xl font-black text-rose-600">{summary.outstandingAmount.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ອໍເດີຈ່າຍແລ້ວ</div>
            <div className="text-xl font-black text-slate-900">{summary.paidOrders.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ອໍເດີຄ້າງຈ່າຍ</div>
            <div className="text-xl font-black text-slate-900">{summary.unpaidOrders.toLocaleString()}</div>
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
                <th className="p-3 text-left text-xs font-black uppercase">ລະຫັດອໍເດີ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ແອັດມິນ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ເບີໂທລູກຄ້າ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ວັນທີສັ່ງ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ຜະລິດສຳເລັດ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ຈັດສົ່ງສຳເລັດ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ຈ່າຍແລ້ວ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ຄ້າງຈ່າຍ</th>
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
                    <td className="p-3 font-black text-slate-900">{row.order_code}</td>
                    <td className="p-3 text-slate-800">{adminNames.get(row.admin_user_id || "") || "-"}</td>
                    <td className="p-3 text-slate-800">{row.customer_phone || "-"}</td>
                    <td className="p-3 text-slate-800">{row.order_date}</td>
                    <td className="p-3 text-slate-800">{toDateOnly(row.production_completed_at) || "-"}</td>
                    <td className="p-3 text-slate-800">{toDateOnly(row.shipment_completed_at) || "-"}</td>
                    <td className="p-3 text-right font-bold text-emerald-600">{(((Number(row.net_total) || 0) - (Number(row.balance) || 0))).toLocaleString()}</td>
                    <td className="p-3 text-right font-bold text-rose-600">{(Number(row.balance) || 0).toLocaleString()}</td>
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
