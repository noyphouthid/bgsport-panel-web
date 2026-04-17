"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileDown, Printer, RefreshCw, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import { useOrderTypeOptions } from "@/lib/order-code-options";
import {
  type MonthFilter,
  type PrefixFilter,
  buildMonthOptions,
  buildYearOptions,
  exportReportDocumentAsPdf,
  matchSelectedPrefixes,
  openReportPrintWindow,
  periodRange,
  toDateOnly,
  togglePrefix,
} from "../_lib";

type FactoryPaymentRow = {
  id: string;
  order_id: string;
  amount: number;
  paid_at: string;
  note: string | null;
  batch_id: string | null;
  created_at?: string | null;
};

type OrderRow = {
  id: string;
  order_code: string;
  factory_bill_code: string | null;
  factory_cost: number;
  production_completed_at: string | null;
  admin_user_id: string | null;
};

type UserOption = {
  id: string;
  full_name: string;
  role: AppRole;
};

type PaymentModeFilter = "all" | "batch" | "single";
type SettlementFilter = "all" | "fully_paid" | "partial";

type ReportRow = FactoryPaymentRow & {
  order_code: string;
  factory_bill_code: string | null;
  factory_cost: number;
  production_completed_at: string | null;
  admin_user_id: string | null;
  total_paid_for_order: number;
  remaining_balance: number;
  settlement_status: SettlementFilter;
  payment_mode: Exclude<PaymentModeFilter, "all">;
};

function normalizeDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function matchesSearch(row: ReportRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const queryDigits = normalizeDigits(query);

  const textHaystacks = [
    row.order_code,
    row.factory_bill_code || "",
    row.batch_id || "",
    row.note || "",
  ].map((value) => String(value || "").toLowerCase());

  if (textHaystacks.some((value) => value.includes(normalizedQuery))) return true;
  if (!queryDigits) return false;

  const digitHaystacks = [row.order_code, row.factory_bill_code, row.batch_id].map(normalizeDigits);
  return digitHaystacks.some((value) => value.includes(queryDigits));
}

function buildPeriodLabel(month: MonthFilter, year: number) {
  return month === "ALL" ? `ALL / ${year}` : `${String(month).padStart(2, "0")} / ${year}`;
}

function getPaymentModeLabel(mode: PaymentModeFilter) {
  if (mode === "batch") return "ຈ່າຍແບບກຸ່ມ";
  if (mode === "single") return "ຈ່າຍລາຍການ";
  return "ທັງໝົດ";
}

function getSettlementLabel(status: SettlementFilter) {
  if (status === "fully_paid") return "ຈ່າຍຄົບແລ້ວ";
  if (status === "partial") return "ຍັງຄ້າງຈ່າຍ";
  return "ທັງໝົດ";
}

export default function FactoryPaymentsReportPage() {
  const now = new Date();
  const [month, setMonth] = useState<MonthFilter>(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selectedPrefixes, setSelectedPrefixes] = useState<PrefixFilter[]>([]);
  const [adminFilter, setAdminFilter] = useState("all");
  const [paymentMode, setPaymentMode] = useState<PaymentModeFilter>("all");
  const [settlementFilter, setSettlementFilter] = useState<SettlementFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [rows, setRows] = useState<ReportRow[]>([]);
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

    const [{ data: paymentData, error: paymentError }, { data: orderData, error: orderError }, { data: userData, error: userError }] =
      await Promise.all([
        supabase
          .from("factory_payments")
          .select("id,order_id,amount,paid_at,note,batch_id,created_at")
          .order("paid_at", { ascending: false }),
        supabase
          .from("orders")
          .select("id,order_code,factory_bill_code,factory_cost,production_completed_at,admin_user_id")
          .order("created_at", { ascending: false }),
        supabase
          .from("users")
          .select("id,full_name,role")
          .eq("is_active", true)
          .in("role", ["superadmin", "admin", "manager", "staff", "accountant"])
          .order("full_name", { ascending: true }),
      ]);

    if (paymentError) {
      setErr(paymentError.message);
      setRows([]);
      setLoading(false);
      return;
    }

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

    const ordersById = new Map(((orderData ?? []) as OrderRow[]).map((row) => [row.id, row]));
    const allPayments = (paymentData ?? []) as FactoryPaymentRow[];
    const paidTotals = new Map<string, number>();

    allPayments.forEach((row) => {
      paidTotals.set(row.order_id, (paidTotals.get(row.order_id) || 0) + (Number(row.amount) || 0));
    });

    const reportRows = allPayments.map((row) => {
      const order = ordersById.get(row.order_id);
      const factoryCost = Number(order?.factory_cost) || 0;
      const totalPaidForOrder = paidTotals.get(row.order_id) || 0;
      const remainingBalance = Math.max(0, factoryCost - totalPaidForOrder);
      const settlementStatus: SettlementFilter =
        factoryCost > 0 && remainingBalance === 0 ? "fully_paid" : "partial";

      return {
        ...row,
        order_code: order?.order_code || "-",
        factory_bill_code: order?.factory_bill_code || null,
        factory_cost: factoryCost,
        production_completed_at: order?.production_completed_at || null,
        admin_user_id: order?.admin_user_id || null,
        total_paid_for_order: totalPaidForOrder,
        remaining_balance: remainingBalance,
        settlement_status: settlementStatus,
        payment_mode: row.batch_id ? "batch" : "single",
      } satisfies ReportRow;
    });

    setRows(reportRows);
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
      const paidAt = new Date(row.paid_at).toISOString();
      if (!(paidAt >= start && paidAt < endExclusive)) return false;
      if (!matchSelectedPrefixes(row.order_code, selectedPrefixes)) return false;
      if (adminFilter !== "all" && row.admin_user_id !== adminFilter) return false;
      if (paymentMode !== "all" && row.payment_mode !== paymentMode) return false;
      if (settlementFilter !== "all" && row.settlement_status !== settlementFilter) return false;
      if (!matchesSearch(row, searchTerm)) return false;
      return true;
    });
  }, [rows, year, month, selectedPrefixes, adminFilter, paymentMode, settlementFilter, searchTerm]);

  const summary = useMemo(() => {
    const totalAmount = filteredRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const uniqueOrders = new Set(filteredRows.map((row) => row.order_id)).size;
    const batchPayments = new Set(filteredRows.map((row) => row.batch_id).filter(Boolean)).size;
    const singlePayments = filteredRows.filter((row) => !row.batch_id).length;
    return {
      totalAmount,
      totalPayments: filteredRows.length,
      uniqueOrders,
      batchPayments,
      singlePayments,
    };
  }, [filteredRows]);

  const batchSummary = useMemo(() => {
    const grouped = new Map<
      string,
      {
        batch_id: string;
        paid_at: string;
        orders: number;
        amount: number;
        note: string | null;
      }
    >();

    filteredRows.forEach((row) => {
      if (!row.batch_id) return;
      const current = grouped.get(row.batch_id) || {
        batch_id: row.batch_id,
        paid_at: row.paid_at,
        orders: 0,
        amount: 0,
        note: row.note,
      };
      current.orders += 1;
      current.amount += Number(row.amount) || 0;
      if (row.paid_at > current.paid_at) current.paid_at = row.paid_at;
      if (!current.note && row.note) current.note = row.note;
      grouped.set(row.batch_id, current);
    });

    return Array.from(grouped.values()).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  }, [filteredRows]);

  const periodLabel = buildPeriodLabel(month, year);
  const prefixSummary = selectedPrefixes.length === 0 ? "ALL" : selectedPrefixes.join(", ");

  const exportExcel = () => {
    const periodFileLabel = month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`;
    const exportRows = filteredRows.map((row) => ({
      paid_date: toDateOnly(row.paid_at),
      payment_type: row.payment_mode === "batch" ? "ຈ່າຍແບບກຸ່ມ" : "ຈ່າຍລາຍການ",
      batch_id: row.batch_id ?? "",
      order_code: row.order_code,
      factory_bill_code: row.factory_bill_code ?? "",
      admin_name: adminNames.get(row.admin_user_id || "") || "-",
      production_completed_date: toDateOnly(row.production_completed_at),
      factory_cost: Number(row.factory_cost) || 0,
      paid_amount: Number(row.amount) || 0,
      total_paid_for_order: Number(row.total_paid_for_order) || 0,
      remaining_balance: Number(row.remaining_balance) || 0,
      settlement_status: row.settlement_status === "fully_paid" ? "ຈ່າຍຄົບແລ້ວ" : "ຍັງຄ້າງຈ່າຍ",
      note: row.note ?? "",
    }));

    exportRows.push({
      paid_date: periodLabel,
      payment_type: getPaymentModeLabel(paymentMode),
      batch_id: `batches=${summary.batchPayments}`,
      order_code: `orders=${summary.uniqueOrders}`,
      factory_bill_code: prefixSummary,
      admin_name: adminFilter === "all" ? "ALL ADMIN" : adminNames.get(adminFilter) || "-",
      production_completed_date: searchTerm || "-",
      factory_cost: 0,
      paid_amount: summary.totalAmount,
      total_paid_for_order: summary.totalPayments,
      remaining_balance: summary.singlePayments,
      settlement_status: getSettlementLabel(settlementFilter),
      note: "ສະຫຼຸບລວມ",
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "factory_payments_report");
    XLSX.writeFile(wb, `factory-payments-report-${periodFileLabel}.xlsx`);
  };

  const reportTitle = "ລາຍງານຈ່າຍໂຮງງານ";
  const reportSubtitle = `ໄລຍະ: ${periodLabel} | ລະຫັດ: ${prefixSummary} | ແອັດມິນ: ${
    adminFilter === "all" ? "ທັງໝົດ" : adminNames.get(adminFilter) || "-"
  } | ປະເພດການຈ່າຍ: ${getPaymentModeLabel(paymentMode)} | ສະຖານະປິດຍອດ: ${getSettlementLabel(
    settlementFilter
  )} | ຄົ້ນຫາ: ${searchTerm || "-"}`;

  const reportHeaders = ["ວັນທີຈ່າຍ", "ປະເພດ", "Batch", "ລະຫັດອໍເດີ", "ບິນໂຮງງານ", "ແອັດມິນ", "ຍອດຈ່າຍ", "ຍອດຄ້າງ", "ໝາຍເຫດ"];
  const reportRows = filteredRows.map((row) => [
    toDateOnly(row.paid_at) || "-",
    row.payment_mode === "batch" ? "ກຸ່ມ" : "ລາຍການ",
    row.batch_id || "-",
    row.order_code,
    row.factory_bill_code || "-",
    adminNames.get(row.admin_user_id || "") || "-",
    (Number(row.amount) || 0).toLocaleString(),
    (Number(row.remaining_balance) || 0).toLocaleString(),
    row.note || "-",
  ]);

  const handlePrint = () => {
    openReportPrintWindow({
      title: reportTitle,
      subtitle: reportSubtitle,
      summary: [
        { label: "ຍອດຈ່າຍລວມ", value: summary.totalAmount.toLocaleString() },
        { label: "ລາຍການຈ່າຍ", value: summary.totalPayments.toLocaleString() },
        { label: "ອໍເດີທີ່ຈ່າຍ", value: summary.uniqueOrders.toLocaleString() },
        { label: "Batch ການຈ່າຍ", value: summary.batchPayments.toLocaleString() },
      ],
      headers: reportHeaders,
      rows: reportRows,
    });
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportReportDocumentAsPdf(
        {
          title: reportTitle,
          subtitle: reportSubtitle,
          summary: [
            { label: "ຍອດຈ່າຍລວມ", value: summary.totalAmount.toLocaleString() },
            { label: "ລາຍການຈ່າຍ", value: summary.totalPayments.toLocaleString() },
            { label: "ອໍເດີທີ່ຈ່າຍ", value: summary.uniqueOrders.toLocaleString() },
            { label: "Batch ການຈ່າຍ", value: summary.batchPayments.toLocaleString() },
          ],
          headers: reportHeaders,
          rows: reportRows,
        },
        `factory-payments-report-${month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`}.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <Wallet className="text-emerald-600" size={24} />
            {reportTitle}
          </h1>
          <div className="text-sm font-medium text-slate-500">ສະຫຼຸບຍອດຈ່າຍຈິງຕາມປະຫວັດການຊຳລະໂຮງງານ ພ້ອມ filter, print, PDF ແລະ XLSX</div>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {loading ? "ກຳລັງໂຫຼດ..." : "ໂຫຼດຂໍ້ມູນໃໝ່"}
        </button>
      </div>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">ຂໍ້ຜິດພາດ: {err}</div>}

      <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <select value={month} onChange={(e) => setMonth(e.target.value === "ALL" ? "ALL" : Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            {buildMonthOptions().map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            {buildYearOptions().map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentModeFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ປະເພດການຈ່າຍທັງໝົດ</option>
            <option value="batch">ຈ່າຍແບບກຸ່ມ</option>
            <option value="single">ຈ່າຍລາຍການ</option>
          </select>
          <select value={settlementFilter} onChange={(e) => setSettlementFilter(e.target.value as SettlementFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ສະຖານະປິດຍອດທັງໝົດ</option>
            <option value="fully_paid">ຈ່າຍຄົບແລ້ວ</option>
            <option value="partial">ຍັງຄ້າງຈ່າຍ</option>
          </select>
          <select value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ແອັດມິນທັງໝົດ</option>
            {adminOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ຄົ້ນຫາລະຫັດອໍເດີ, ບິນໂຮງງານ, batch, ໝາຍເຫດ"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none"
          />
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">ງວດລາຍງານ: {periodLabel}</div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">ຈຳນວນລາຍການ: {filteredRows.length.toLocaleString()}</div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">ປະເພດລະຫັດ</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedPrefixes([])}
              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                selectedPrefixes.length === 0
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
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
                  className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                    active
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {prefix}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ຍອດຈ່າຍລວມ</div>
            <div className="text-xl font-black text-emerald-600">{summary.totalAmount.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ລາຍການຈ່າຍ</div>
            <div className="text-xl font-black text-slate-900">{summary.totalPayments.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ອໍເດີທີ່ຈ່າຍ</div>
            <div className="text-xl font-black text-blue-600">{summary.uniqueOrders.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">Batch ການຈ່າຍ</div>
            <div className="text-xl font-black text-violet-600">{summary.batchPayments.toLocaleString()}</div>
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
        <div className="border-b bg-slate-50 p-4 text-sm font-black uppercase text-slate-800">ສະຫຼຸບ Batch ການຈ່າຍ ({batchSummary.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-slate-700">
              <tr>
                <th className="p-3 text-left text-xs font-black uppercase">Batch ID</th>
                <th className="p-3 text-left text-xs font-black uppercase">ວັນທີຈ່າຍ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ຈຳນວນອໍເດີ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ຍອດຈ່າຍ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ໝາຍເຫດ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && batchSummary.length === 0 ? (
                <tr>
                  <td className="p-8 text-center font-bold text-slate-500" colSpan={5}>
                    ບໍ່ມີ Batch ການຈ່າຍ
                  </td>
                </tr>
              ) : (
                batchSummary.map((batch) => (
                  <tr key={batch.batch_id}>
                    <td className="p-3 font-mono text-xs font-bold text-slate-800">{batch.batch_id}</td>
                    <td className="p-3 text-slate-800">{toDateOnly(batch.paid_at) || "-"}</td>
                    <td className="p-3 text-right text-slate-800">{batch.orders.toLocaleString()}</td>
                    <td className="p-3 text-right font-bold text-emerald-600">{batch.amount.toLocaleString()}</td>
                    <td className="p-3 text-slate-800">{batch.note || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b bg-slate-50 p-4 text-sm font-black uppercase text-slate-800">ຕາຕະລາງການຈ່າຍ ({filteredRows.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-slate-700">
              <tr>
                <th className="p-3 text-left text-xs font-black uppercase">ວັນທີຈ່າຍ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ປະເພດ</th>
                <th className="p-3 text-left text-xs font-black uppercase">Batch</th>
                <th className="p-3 text-left text-xs font-black uppercase">ລະຫັດອໍເດີ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ບິນໂຮງງານ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ແອັດມິນ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ຜະລິດສຳເລັດ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ຍອດຈ່າຍ</th>
                <th className="p-3 text-right text-xs font-black uppercase">ຍອດຄ້າງ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ໝາຍເຫດ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center font-bold text-slate-500" colSpan={10}>
                    ບໍ່ມີຂໍ້ມູນ
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="p-3 text-slate-800">{toDateOnly(row.paid_at) || "-"}</td>
                    <td className="p-3 font-medium text-slate-800">{row.payment_mode === "batch" ? "ຈ່າຍແບບກຸ່ມ" : "ຈ່າຍລາຍການ"}</td>
                    <td className="p-3 font-mono text-xs text-slate-700">{row.batch_id || "-"}</td>
                    <td className="p-3 font-black text-slate-900">{row.order_code}</td>
                    <td className="p-3 text-slate-800">{row.factory_bill_code || "-"}</td>
                    <td className="p-3 text-slate-800">{adminNames.get(row.admin_user_id || "") || "-"}</td>
                    <td className="p-3 text-slate-800">{toDateOnly(row.production_completed_at) || "-"}</td>
                    <td className="p-3 text-right font-bold text-emerald-600">{(Number(row.amount) || 0).toLocaleString()}</td>
                    <td className="p-3 text-right font-bold text-rose-600">{(Number(row.remaining_balance) || 0).toLocaleString()}</td>
                    <td className="p-3 text-slate-800">{row.note || "-"}</td>
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
