"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileDown, Printer, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import { useOrderTypeOptions } from "@/lib/order-code-options";
import {
  type PrefixFilter,
  type WorkflowStatusFilter,
  buildYearOptions,
  exportReportDocumentAsPdf,
  getWorkflowStatus,
  getWorkflowStatusLabel,
  matchSelectedPrefixes,
  openReportPrintWindow,
  toDateOnly,
  togglePrefix,
} from "../_lib";

type OrderRow = {
  id: string;
  order_code: string;
  order_date: string;
  status: "in_progress" | "completed";
  closed_at?: string | null;
  production_completed_at: string | null;
  shipment_completed_at: string | null;
  shipment_status: "pending" | "shipped" | null;
  customer_phone: string | null;
  customer_whatsapp: string | null;
  factory_bill_code: string | null;
  admin_user_id: string | null;
  net_total: number;
  balance: number;
  factory_cost: number;
  customer_paid_full_at: string | null;
  factory_paid_full_at: string | null;
  factory_production_is_rush: boolean | null;
};

type DepositLookupRow = {
  order_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_whatsapp: string | null;
  team_name: string | null;
  production_priority: "normal" | "urgent" | null;
  created_at: string;
};

type FactoryPaymentRow = {
  order_id: string | null;
  amount: number | null;
};

type UserOption = {
  id: string;
  full_name: string;
  role: AppRole;
};

type ReportDateField = "order_date" | "production_completed_at" | "shipment_completed_at" | "closed_at";
type CustomerPaymentStatus = "all" | "paid" | "unpaid";
type FactoryPaymentStatus = "all" | "paid" | "unpaid";
type RushFilter = "all" | "rush" | "normal";

type ReportRow = OrderRow & {
  customer_name: string | null;
  team_name: string | null;
  admin_name: string;
  is_rush: boolean;
  customer_paid_amount: number;
  customer_balance: number;
  factory_paid_amount: number;
  factory_balance: number;
};

const DATE_FIELD_OPTIONS: Array<{ value: ReportDateField; label: string }> = [
  { value: "order_date", label: "ວັນທີສັ່ງ" },
  { value: "production_completed_at", label: "ວັນທີຜະລິດສຳເລັດ" },
  { value: "shipment_completed_at", label: "ວັນທີຈັດສົ່ງສຳເລັດ" },
  { value: "closed_at", label: "ວັນທີປິດອໍເດີ" },
];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: String(index + 1).padStart(2, "0"),
}));

function normalizeDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function buildPeriodLabel(months: number[], year: number) {
  if (months.length === 0) return `ALL / ${year}`;
  return `${months.map((month) => String(month).padStart(2, "0")).join(", ")} / ${year}`;
}

function getComparableDate(value: string | null | undefined, field: ReportDateField) {
  if (!value) return null;
  const parsed = new Date(field === "order_date" ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function formatMoney(value: number) {
  return (Number(value) || 0).toLocaleString();
}

function getCustomerPaymentLabel(row: Pick<ReportRow, "customer_balance">) {
  return row.customer_balance === 0 ? "ຈ່າຍແລ້ວ" : "ຄ້າງຈ່າຍ";
}

function getFactoryPaymentLabel(row: Pick<ReportRow, "factory_balance" | "factory_cost" | "factory_paid_amount">) {
  if ((Number(row.factory_cost) || 0) === 0 && (Number(row.factory_paid_amount) || 0) === 0) {
    return "ບໍ່ມີຕົ້ນທຶນ";
  }
  return row.factory_balance === 0 ? "ຈ່າຍແລ້ວ" : "ຄ້າງຈ່າຍ";
}

function matchesSearch(row: ReportRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const queryDigits = normalizeDigits(query);

  const textHaystacks = [
    row.order_code,
    row.factory_bill_code || "",
    row.customer_name || "",
    row.team_name || "",
    row.customer_phone || "",
    row.customer_whatsapp || "",
    row.admin_name || "",
  ].map((value) => String(value || "").toLowerCase());

  if (textHaystacks.some((value) => value.includes(normalizedQuery))) return true;
  if (!queryDigits) return false;

  const digitHaystacks = [row.order_code, row.factory_bill_code, row.customer_phone, row.customer_whatsapp].map(normalizeDigits);
  return digitHaystacks.some((value) => value.includes(queryDigits));
}

function matchesSelectedMonths(value: string | null | undefined, field: ReportDateField, year: number, months: number[]) {
  const comparableDate = getComparableDate(value, field);
  if (!comparableDate) return false;
  const parsed = new Date(comparableDate);
  if (Number.isNaN(parsed.getTime())) return false;

  const dateYear = parsed.getUTCFullYear();
  const dateMonth = parsed.getUTCMonth() + 1;
  if (dateYear !== year) return false;
  if (months.length === 0) return true;
  return months.includes(dateMonth);
}

function toggleMonth(months: number[], nextMonth: number) {
  return months.includes(nextMonth) ? months.filter((month) => month !== nextMonth) : [...months, nextMonth].sort((a, b) => a - b);
}

function PaymentStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "rose" | "slate";
}) {
  const className =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${className}`}>{label}</span>;
}

export default function OrderStatusPaymentsReportPage() {
  const now = new Date();
  const [selectedMonths, setSelectedMonths] = useState<number[]>([now.getMonth() + 1]);
  const [year, setYear] = useState(now.getFullYear());
  const [dateField, setDateField] = useState<ReportDateField>("order_date");
  const [selectedPrefixes, setSelectedPrefixes] = useState<PrefixFilter[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatusFilter>("all");
  const [customerPaymentStatus, setCustomerPaymentStatus] = useState<CustomerPaymentStatus>("all");
  const [factoryPaymentStatus, setFactoryPaymentStatus] = useState<FactoryPaymentStatus>("all");
  const [adminFilter, setAdminFilter] = useState("all");
  const [rushFilter, setRushFilter] = useState<RushFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [adminOptions, setAdminOptions] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const { options: orderTypeOptions } = useOrderTypeOptions(true);
  const prefixChipOptions = useMemo(() => [...orderTypeOptions, "OTHER"] as PrefixFilter[], [orderTypeOptions]);

  const load = async () => {
    setLoading(true);
    setErr(null);

    const [{ data: orderData, error: orderError }, { data: userData, error: userError }, { data: depositData, error: depositError }, { data: factoryPaymentData, error: factoryPaymentError }] =
      await Promise.all([
        supabase
          .from("orders")
          .select(
            "id,order_code,order_date,status,closed_at,production_completed_at,shipment_completed_at,shipment_status,customer_phone,customer_whatsapp,factory_bill_code,admin_user_id,net_total,balance,factory_cost,customer_paid_full_at,factory_paid_full_at,factory_production_is_rush"
          )
          .order("order_date", { ascending: false }),
        supabase
          .from("users")
          .select("id,full_name,role")
          .eq("is_active", true)
          .in("role", ["superadmin", "admin", "manager", "staff", "accountant"])
          .order("full_name", { ascending: true }),
        supabase
          .from("factory_deposit_orders")
          .select("order_id,customer_name,customer_phone,customer_whatsapp,team_name,production_priority,created_at")
          .not("order_id", "is", null)
          .order("created_at", { ascending: false }),
        supabase.from("factory_payments").select("order_id,amount"),
      ]);

    if (orderError) {
      setErr(orderError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    if (depositError) {
      setErr(depositError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    if (factoryPaymentError) {
      setErr(factoryPaymentError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const nextAdminOptions = (userData ?? []) as UserOption[];
    if (userError) {
      setErr(userError.message);
      setAdminOptions([]);
    } else {
      setAdminOptions(nextAdminOptions);
    }

    const adminNames = new Map(nextAdminOptions.map((user) => [user.id, user.full_name]));
    const depositByOrderId = new Map<string, DepositLookupRow>();
    ((depositData ?? []) as DepositLookupRow[]).forEach((row) => {
      if (!row.order_id || depositByOrderId.has(row.order_id)) return;
      depositByOrderId.set(row.order_id, row);
    });

    const factoryPaymentTotals = new Map<string, number>();
    ((factoryPaymentData ?? []) as FactoryPaymentRow[]).forEach((row) => {
      if (!row.order_id) return;
      factoryPaymentTotals.set(row.order_id, (factoryPaymentTotals.get(row.order_id) || 0) + (Number(row.amount) || 0));
    });

    const nextRows = ((orderData ?? []) as OrderRow[]).map((row) => {
      const linkedDeposit = depositByOrderId.get(row.id);
      const netTotal = Number(row.net_total) || 0;
      const customerBalance = Math.max(0, Number(row.balance) || 0);
      const factoryCost = Number(row.factory_cost) || 0;
      const factoryPaidAmount = factoryPaymentTotals.get(row.id) || 0;
      const factoryBalance = Math.max(0, factoryCost - factoryPaidAmount);

      return {
        ...row,
        customer_name: linkedDeposit?.customer_name || null,
        team_name: linkedDeposit?.team_name || null,
        admin_name: adminNames.get(row.admin_user_id || "") || "-",
        is_rush: Boolean(row.factory_production_is_rush) || linkedDeposit?.production_priority === "urgent",
        customer_phone: row.customer_phone || linkedDeposit?.customer_phone || null,
        customer_whatsapp: row.customer_whatsapp || linkedDeposit?.customer_whatsapp || null,
        customer_paid_amount: Math.max(0, netTotal - customerBalance),
        customer_balance: customerBalance,
        factory_paid_amount: factoryPaidAmount,
        factory_balance: factoryBalance,
      } satisfies ReportRow;
    });

    setRows(nextRows);
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!matchesSelectedMonths(row[dateField], dateField, year, selectedMonths)) return false;
      if (!matchSelectedPrefixes(row.order_code, selectedPrefixes)) return false;
      if (adminFilter !== "all" && row.admin_user_id !== adminFilter) return false;
      if (!matchesSearch(row, searchTerm)) return false;
      if (workflowStatus !== "all" && getWorkflowStatus(row) !== workflowStatus) return false;
      if (customerPaymentStatus === "paid" && row.customer_balance > 0) return false;
      if (customerPaymentStatus === "unpaid" && row.customer_balance === 0) return false;
      if (factoryPaymentStatus === "paid" && row.factory_balance > 0) return false;
      if (factoryPaymentStatus === "unpaid" && row.factory_balance === 0) return false;
      if (rushFilter === "rush" && !row.is_rush) return false;
      if (rushFilter === "normal" && row.is_rush) return false;
      return true;
    });
  }, [rows, year, selectedMonths, dateField, selectedPrefixes, adminFilter, searchTerm, workflowStatus, customerPaymentStatus, factoryPaymentStatus, rushFilter]);

  const summary = useMemo(() => {
    const customerOutstandingTotal = filteredRows.reduce((sum, row) => sum + row.customer_balance, 0);
    const factoryOutstandingTotal = filteredRows.reduce((sum, row) => sum + row.factory_balance, 0);
    const inProductionCount = filteredRows.filter((row) => getWorkflowStatus(row) === "in_progress").length;
    const productionCompletedCount = filteredRows.filter((row) => getWorkflowStatus(row) === "production_completed").length;
    const customerUnpaidOrders = filteredRows.filter((row) => row.customer_balance > 0).length;
    const factoryUnpaidOrders = filteredRows.filter((row) => row.factory_balance > 0).length;

    return {
      customerOutstandingTotal,
      factoryOutstandingTotal,
      inProductionCount,
      productionCompletedCount,
      customerUnpaidOrders,
      factoryUnpaidOrders,
    };
  }, [filteredRows]);

  const periodLabel = buildPeriodLabel(selectedMonths, year);
  const prefixSummary = selectedPrefixes.length === 0 ? "ALL" : selectedPrefixes.join(", ");
  const dateFieldLabel = DATE_FIELD_OPTIONS.find((item) => item.value === dateField)?.label || "ວັນທີ";

  const exportExcel = () => {
    const periodFileLabel = selectedMonths.length === 0 ? `${year}-ALL` : `${year}-${selectedMonths.map((month) => String(month).padStart(2, "0")).join("_")}`;
    const out = filteredRows.map((row) => ({
      order_code: row.order_code,
      customer_name: row.customer_name || "-",
      team_name: row.team_name || "-",
      admin_name: row.admin_name || "-",
      customer_phone: row.customer_phone || row.customer_whatsapp || "-",
      order_date: row.order_date || "-",
      production_completed_date: toDateOnly(row.production_completed_at) || "-",
      shipment_completed_date: toDateOnly(row.shipment_completed_at) || "-",
      closed_date: toDateOnly(row.closed_at || null) || "-",
      factory_bill_code: row.factory_bill_code || "-",
      workflow_status: getWorkflowStatusLabel(getWorkflowStatus(row)),
      customer_total: Number(row.net_total) || 0,
      customer_paid_amount: row.customer_paid_amount,
      customer_balance: row.customer_balance,
      customer_payment_status: getCustomerPaymentLabel(row),
      factory_cost: Number(row.factory_cost) || 0,
      factory_paid_amount: row.factory_paid_amount,
      factory_balance: row.factory_balance,
      factory_payment_status: getFactoryPaymentLabel(row),
      rush_status: row.is_rush ? "ງານດ່ວນ" : "ງານປົກກະຕິ",
    }));

    out.push({
      order_code: "ສະຫຼຸບລວມ",
      customer_name: `rows=${filteredRows.length}`,
      team_name: prefixSummary,
      admin_name: adminFilter === "all" ? "ALL ADMIN" : adminOptions.find((user) => user.id === adminFilter)?.full_name || "-",
      customer_phone: searchTerm || "-",
      order_date: `${dateFieldLabel} ${periodLabel}`,
      production_completed_date: `workflow=${workflowStatus}`,
      shipment_completed_date: `rush=${rushFilter}`,
      closed_date: "-",
      factory_bill_code: "-",
      workflow_status: "-",
      customer_total: 0,
      customer_paid_amount: 0,
      customer_balance: summary.customerOutstandingTotal,
      customer_payment_status: `ຄ້າງ ${summary.customerUnpaidOrders}`,
      factory_cost: 0,
      factory_paid_amount: 0,
      factory_balance: summary.factoryOutstandingTotal,
      factory_payment_status: `ຄ້າງ ${summary.factoryUnpaidOrders}`,
      rush_status: "-",
    });

    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "order_status_payments");
    XLSX.writeFile(wb, `order-status-payments-${periodFileLabel}.xlsx`);
  };

  const handlePrint = () => {
    openReportPrintWindow({
      title: "ລາຍງານຕິດຕາມອໍເດີ-ການຊຳລະ",
      subtitle: `ວັນທີ: ${dateFieldLabel} | ໄລຍະ: ${periodLabel} | ລະຫັດ: ${prefixSummary} | ແອັດມິນ: ${adminFilter === "all" ? "ທັງໝົດ" : adminOptions.find((user) => user.id === adminFilter)?.full_name || "-"} | ຄົ້ນຫາ: ${searchTerm || "-"} | ງານດ່ວນ: ${rushFilter === "all" ? "ທັງໝົດ" : rushFilter === "rush" ? "ສະເພາະງານດ່ວນ" : "ສະເພາະງານປົກກະຕິ"}`,
      summary: [
        { label: "ຍອດຄ້າງລູກຄ້າ", value: formatMoney(summary.customerOutstandingTotal) },
        { label: "ຍອດຄ້າງໂຮງງານ", value: formatMoney(summary.factoryOutstandingTotal) },
        { label: "ກຳລັງຜະລິດ", value: summary.inProductionCount.toLocaleString() },
        { label: "ຜະລິດສຳເລັດ", value: summary.productionCompletedCount.toLocaleString() },
      ],
      headers: ["ລະຫັດອໍເດີ", "ລູກຄ້າ", "ແອັດມິນ", "ສະຖານະ", "ຍອດລູກຄ້າ", "ຈ່າຍແລ້ວ", "ຄ້າງ", "ຕົ້ນທຶນໂຮງງານ", "ຈ່າຍໂຮງງານ", "ຄ້າງໂຮງງານ"],
      rows: filteredRows.map((row) => [
        row.order_code,
        row.customer_name || row.team_name || "-",
        row.admin_name || "-",
        getWorkflowStatusLabel(getWorkflowStatus(row)),
        formatMoney(Number(row.net_total) || 0),
        formatMoney(row.customer_paid_amount),
        formatMoney(row.customer_balance),
        formatMoney(Number(row.factory_cost) || 0),
        formatMoney(row.factory_paid_amount),
        formatMoney(row.factory_balance),
      ]),
    });
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportReportDocumentAsPdf(
        {
          title: "ລາຍງານຕິດຕາມອໍເດີ-ການຊຳລະ",
          subtitle: `ວັນທີ: ${dateFieldLabel} | ໄລຍະ: ${periodLabel} | ລະຫັດ: ${prefixSummary} | ແອັດມິນ: ${adminFilter === "all" ? "ທັງໝົດ" : adminOptions.find((user) => user.id === adminFilter)?.full_name || "-"} | ຄົ້ນຫາ: ${searchTerm || "-"} | ງານດ່ວນ: ${rushFilter === "all" ? "ທັງໝົດ" : rushFilter === "rush" ? "ສະເພາະງານດ່ວນ" : "ສະເພາະງານປົກກະຕິ"}`,
          summary: [
            { label: "ຍອດຄ້າງລູກຄ້າ", value: formatMoney(summary.customerOutstandingTotal) },
            { label: "ຍອດຄ້າງໂຮງງານ", value: formatMoney(summary.factoryOutstandingTotal) },
            { label: "ກຳລັງຜະລິດ", value: summary.inProductionCount.toLocaleString() },
            { label: "ຜະລິດສຳເລັດ", value: summary.productionCompletedCount.toLocaleString() },
          ],
          headers: ["ລະຫັດອໍເດີ", "ລູກຄ້າ", "ແອັດມິນ", "ສະຖານະ", "ຍອດລູກຄ້າ", "ຈ່າຍແລ້ວ", "ຄ້າງ", "ຕົ້ນທຶນໂຮງງານ", "ຈ່າຍໂຮງງານ", "ຄ້າງໂຮງງານ"],
          rows: filteredRows.map((row) => [
            row.order_code,
            row.customer_name || row.team_name || "-",
            row.admin_name || "-",
            getWorkflowStatusLabel(getWorkflowStatus(row)),
            formatMoney(Number(row.net_total) || 0),
            formatMoney(row.customer_paid_amount),
            formatMoney(row.customer_balance),
            formatMoney(Number(row.factory_cost) || 0),
            formatMoney(row.factory_paid_amount),
            formatMoney(row.factory_balance),
          ]),
        },
        `order-status-payments-${selectedMonths.length === 0 ? `${year}-ALL` : `${year}-${selectedMonths.map((month) => String(month).padStart(2, "0")).join("_")}`}.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ລາຍງານຕິດຕາມອໍເດີ-ການຊຳລະ</h1>
          <div className="text-sm font-medium text-slate-500">ເບິ່ງສະຖານະອໍເດີ, ຍອດຄ້າງລູກຄ້າ, ແລະ ຍອດຄ້າງໂຮງງານ ຕໍ່ 1 ອໍເດີ</div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {loading ? "ກຳລັງໂຫຼດ..." : "ໂຫຼດຂໍ້ມູນໃໝ່"}
        </button>
      </div>

      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

        <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <select value={dateField} onChange={(e) => setDateField(e.target.value as ReportDateField)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            {DATE_FIELD_OPTIONS.map((item) => (
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
          <select value={workflowStatus} onChange={(e) => setWorkflowStatus(e.target.value as WorkflowStatusFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ສະຖານະອໍເດີທັງໝົດ</option>
            <option value="in_progress">ກຳລັງຜະລິດ</option>
            <option value="production_completed">ຜະລິດສຳເລັດ</option>
            <option value="shipment_completed">ຈັດສົ່ງສຳເລັດ</option>
            <option value="completed">ສຳເລັດແລ້ວ</option>
          </select>
          <select value={customerPaymentStatus} onChange={(e) => setCustomerPaymentStatus(e.target.value as CustomerPaymentStatus)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ການຊຳລະລູກຄ້າທັງໝົດ</option>
            <option value="paid">ຈ່າຍແລ້ວ</option>
            <option value="unpaid">ຄ້າງຈ່າຍ</option>
          </select>
          <select value={factoryPaymentStatus} onChange={(e) => setFactoryPaymentStatus(e.target.value as FactoryPaymentStatus)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ການຊຳລະໂຮງງານທັງໝົດ</option>
            <option value="paid">ຈ່າຍແລ້ວ</option>
            <option value="unpaid">ຄ້າງຈ່າຍ</option>
          </select>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">ເດືອນ</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedMonths([])}
              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                selectedMonths.length === 0 ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              ALL
            </button>
            {MONTH_OPTIONS.map((item) => {
              const active = selectedMonths.includes(item.value);
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSelectedMonths((prev) => toggleMonth(prev, item.value))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                    active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <select value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ແອັດມິນທັງໝົດ</option>
            {adminOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </select>
          <select value={rushFilter} onChange={(e) => setRushFilter(e.target.value as RushFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ງານດ່ວນທັງໝົດ</option>
            <option value="rush">ສະເພາະງານດ່ວນ</option>
            <option value="normal">ສະເພາະງານປົກກະຕິ</option>
          </select>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ຄົ້ນຫາ order, ບິນໂຮງງານ, ຊື່, ທີມ, ເບີ"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none md:col-span-2"
          />
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">
            {dateFieldLabel}: {periodLabel}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">ປະເພດລະຫັດ</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedPrefixes([])}
              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                selectedPrefixes.length === 0 ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
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
                    active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {prefix}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
            <div className="text-xs font-bold uppercase text-rose-700">ຍອດຄ້າງລູກຄ້າ</div>
            <div className="mt-1 text-xl font-black text-rose-700">{formatMoney(summary.customerOutstandingTotal)}</div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
            <div className="text-xs font-bold uppercase text-amber-700">ຍອດຄ້າງໂຮງງານ</div>
            <div className="mt-1 text-xl font-black text-amber-700">{formatMoney(summary.factoryOutstandingTotal)}</div>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
            <div className="text-xs font-bold uppercase text-blue-700">ກຳລັງຜະລິດ</div>
            <div className="mt-1 text-xl font-black text-blue-700">{summary.inProductionCount.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3">
            <div className="text-xs font-bold uppercase text-cyan-700">ຜະລິດສຳເລັດ</div>
            <div className="mt-1 text-xl font-black text-cyan-700">{summary.productionCompletedCount.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ອໍເດີຄ້າງຈ່າຍລູກຄ້າ</div>
            <div className="mt-1 text-xl font-black text-slate-900">{summary.customerUnpaidOrders.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ອໍເດີຄ້າງຈ່າຍໂຮງງານ</div>
            <div className="mt-1 text-xl font-black text-slate-900">{summary.factoryUnpaidOrders.toLocaleString()}</div>
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
        <div className="border-b bg-slate-50 p-4 text-sm font-black uppercase text-slate-800">ຕາຕະລາງຕິດຕາມອໍເດີ ({filteredRows.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-slate-700">
              <tr>
                <th className="p-3 text-left text-xs font-black uppercase">ລະຫັດອໍເດີ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ລູກຄ້າ / ທີມ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ແອັດມິນ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ວັນທີ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ບິນໂຮງງານ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ສະຖານະອໍເດີ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ຊຳລະລູກຄ້າ</th>
                <th className="p-3 text-left text-xs font-black uppercase">ຊຳລະໂຮງງານ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center font-bold text-slate-500" colSpan={8}>
                    ບໍ່ມີຂໍ້ມູນ
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const workflow = getWorkflowStatus(row);
                  const workflowLabel = getWorkflowStatusLabel(workflow);
                  const customerPaymentLabel = getCustomerPaymentLabel(row);
                  const factoryPaymentLabel = getFactoryPaymentLabel(row);
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="p-3">
                        <Link href={`/orders/${row.id}/edit`} className="font-black text-blue-700 hover:text-blue-900 hover:underline">
                          {row.order_code}
                        </Link>
                        <div className="mt-1 text-xs font-bold text-slate-400">{row.is_rush ? "ງານດ່ວນ" : "ງານປົກກະຕິ"}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{row.customer_name || "-"}</div>
                        <div className="mt-1 text-xs font-medium text-slate-500">{row.team_name || "-"}</div>
                        <div className="mt-1 text-xs font-medium text-slate-400">{row.customer_phone || row.customer_whatsapp || "-"}</div>
                      </td>
                      <td className="p-3 font-bold text-slate-700">{row.admin_name || "-"}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{row.order_date || "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">ຜະລິດ: {toDateOnly(row.production_completed_at) || "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">ຈັດສົ່ງ: {toDateOnly(row.shipment_completed_at) || "-"}</div>
                      </td>
                      <td className="p-3 font-bold text-slate-700">{row.factory_bill_code || "-"}</td>
                      <td className="p-3">
                        <PaymentStatusBadge
                          label={workflowLabel}
                          tone={workflow === "completed" || workflow === "shipment_completed" ? "green" : workflow === "production_completed" ? "slate" : "rose"}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <PaymentStatusBadge label={customerPaymentLabel} tone={row.customer_balance === 0 ? "green" : "rose"} />
                        </div>
                        <div className="mt-2 space-y-1 text-xs font-medium text-slate-600">
                          <div>ຍອດລວມ: <span className="font-black text-slate-900">{formatMoney(Number(row.net_total) || 0)}</span></div>
                          <div>ຈ່າຍແລ້ວ: <span className="font-black text-emerald-700">{formatMoney(row.customer_paid_amount)}</span></div>
                          <div>ຄ້າງຈ່າຍ: <span className="font-black text-rose-700">{formatMoney(row.customer_balance)}</span></div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <PaymentStatusBadge
                            label={factoryPaymentLabel}
                            tone={factoryPaymentLabel === "ຈ່າຍແລ້ວ" ? "green" : factoryPaymentLabel === "ຄ້າງຈ່າຍ" ? "rose" : "slate"}
                          />
                        </div>
                        <div className="mt-2 space-y-1 text-xs font-medium text-slate-600">
                          <div>ຕົ້ນທຶນ: <span className="font-black text-slate-900">{formatMoney(Number(row.factory_cost) || 0)}</span></div>
                          <div>ຈ່າຍແລ້ວ: <span className="font-black text-emerald-700">{formatMoney(row.factory_paid_amount)}</span></div>
                          <div>ຄ້າງຈ່າຍ: <span className="font-black text-amber-700">{formatMoney(row.factory_balance)}</span></div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
