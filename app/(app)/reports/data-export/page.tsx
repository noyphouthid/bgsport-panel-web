"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileDown, Printer, RefreshCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import { useOrderTypeOptions } from "@/lib/order-code-options";
import {
  type MonthFilter,
  type PrefixFilter,
  type WorkflowStatusFilter,
  buildMonthOptions,
  buildYearOptions,
  exportReportDocumentAsPdf,
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
  status: "in_progress" | "completed";
  closed_at?: string | null;
  production_completed_at: string | null;
  shipment_completed_at: string | null;
  shipment_status: "pending" | "shipped" | null;
  customer_phone: string | null;
  customer_whatsapp: string | null;
  factory_bill_code: string | null;
  admin_user_id: string | null;
  short_qty: number;
  long_qty: number;
  free_qty: number;
  net_total: number;
  balance: number;
  factory_cost: number;
  customer_paid_full_at: string | null;
  factory_paid_full_at: string | null;
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

type UserOption = {
  id: string;
  full_name: string;
  role: AppRole;
};

type ExportRow = OrderRow & {
  customer_name: string | null;
  team_name: string | null;
  is_rush: boolean;
  admin_name: string;
  paid_amount: number;
  total_qty: number;
};

type ReportDateField = "order_date" | "production_completed_at" | "shipment_completed_at" | "closed_at";
type CustomerPaymentStatus = "all" | "paid" | "unpaid";
type FactoryPaymentStatus = "all" | "paid" | "unpaid";
type RushFilter = "all" | "rush" | "normal";

type ExportColumnKey =
  | "order_code"
  | "factory_bill_code"
  | "customer_name"
  | "team_name"
  | "customer_phone"
  | "customer_whatsapp"
  | "admin_name"
  | "order_date"
  | "production_completed_date"
  | "shipment_completed_date"
  | "closed_date"
  | "workflow_status"
  | "customer_payment_status"
  | "factory_payment_status"
  | "rush_status"
  | "total_qty"
  | "net_total"
  | "paid_amount"
  | "balance"
  | "factory_cost";

type ColumnDefinition = {
  key: ExportColumnKey;
  label: string;
  value: (row: ExportRow) => string;
};

const DATE_FIELD_OPTIONS: Array<{ value: ReportDateField; label: string }> = [
  { value: "order_date", label: "ວັນທີສັ່ງ" },
  { value: "production_completed_at", label: "ວັນທີຜະລິດສຳເລັດ" },
  { value: "shipment_completed_at", label: "ວັນທີຈັດສົ່ງສຳເລັດ" },
  { value: "closed_at", label: "ວັນທີປິດອໍເດີ" },
];

const DEFAULT_COLUMNS: ExportColumnKey[] = [
  "order_code",
  "customer_name",
  "customer_phone",
  "workflow_status",
  "net_total",
  "paid_amount",
  "balance",
];

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: "order_code", label: "ລະຫັດອໍເດີ", value: (row) => row.order_code },
  { key: "factory_bill_code", label: "ລະຫັດໂຮງງານ", value: (row) => row.factory_bill_code || "-" },
  { key: "customer_name", label: "ຊື່ລູກຄ້າ", value: (row) => row.customer_name || "-" },
  { key: "team_name", label: "ຊື່ທີມ", value: (row) => row.team_name || "-" },
  { key: "customer_phone", label: "ເບີໂທ", value: (row) => row.customer_phone || "-" },
  { key: "customer_whatsapp", label: "WhatsApp", value: (row) => row.customer_whatsapp || "-" },
  { key: "admin_name", label: "ແອັດມິນ", value: (row) => row.admin_name || "-" },
  { key: "order_date", label: "ວັນທີສັ່ງ", value: (row) => row.order_date || "-" },
  { key: "production_completed_date", label: "ຜະລິດສຳເລັດ", value: (row) => toDateOnly(row.production_completed_at) || "-" },
  { key: "shipment_completed_date", label: "ຈັດສົ່ງສຳເລັດ", value: (row) => toDateOnly(row.shipment_completed_at) || "-" },
  { key: "closed_date", label: "ປິດອໍເດີ", value: (row) => toDateOnly(row.closed_at || null) || "-" },
  { key: "workflow_status", label: "ສະຖານະ", value: (row) => getWorkflowStatusLabel(getWorkflowStatus(row)) },
  { key: "customer_payment_status", label: "ຊຳລະລູກຄ້າ", value: (row) => (Number(row.balance) === 0 ? "ຈ່າຍແລ້ວ" : "ຄ້າງຈ່າຍ") },
  { key: "factory_payment_status", label: "ຊຳລະໂຮງງານ", value: (row) => (row.factory_paid_full_at ? "ຈ່າຍແລ້ວ" : "ຄ້າງຈ່າຍ") },
  { key: "rush_status", label: "ງານດ່ວນ", value: (row) => (row.is_rush ? "ງານດ່ວນ" : "ງານປົກກະຕິ") },
  { key: "total_qty", label: "ຈຳນວນເສື້ອ", value: (row) => row.total_qty.toLocaleString() },
  { key: "net_total", label: "ຈຳນວນເງິນ", value: (row) => (Number(row.net_total) || 0).toLocaleString() },
  { key: "paid_amount", label: "ຈ່າຍແລ້ວ", value: (row) => row.paid_amount.toLocaleString() },
  { key: "balance", label: "ຍອດຄ້າງ", value: (row) => (Number(row.balance) || 0).toLocaleString() },
  { key: "factory_cost", label: "ຕົ້ນທຶນໂຮງງານ", value: (row) => (Number(row.factory_cost) || 0).toLocaleString() },
];

function buildPeriodLabel(month: MonthFilter, year: number) {
  return month === "ALL" ? `ALL / ${year}` : `${String(month).padStart(2, "0")} / ${year}`;
}

function normalizeDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function getComparableDate(value: string | null | undefined, field: ReportDateField) {
  if (!value) return null;
  const parsed = new Date(field === "order_date" ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function matchesSearch(row: ExportRow, query: string) {
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

export default function DataExportReportPage() {
  const now = new Date();
  const [month, setMonth] = useState<MonthFilter>(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [dateField, setDateField] = useState<ReportDateField>("order_date");
  const [selectedPrefixes, setSelectedPrefixes] = useState<PrefixFilter[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatusFilter>("all");
  const [customerPaymentStatus, setCustomerPaymentStatus] = useState<CustomerPaymentStatus>("all");
  const [factoryPaymentStatus, setFactoryPaymentStatus] = useState<FactoryPaymentStatus>("all");
  const [adminFilter, setAdminFilter] = useState("all");
  const [rushFilter, setRushFilter] = useState<RushFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<ExportColumnKey[]>(DEFAULT_COLUMNS);

  const [rows, setRows] = useState<ExportRow[]>([]);
  const [adminOptions, setAdminOptions] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const { options: orderTypeOptions } = useOrderTypeOptions(true);
  const prefixChipOptions = useMemo(() => [...orderTypeOptions, "OTHER"] as PrefixFilter[], [orderTypeOptions]);

  const load = async () => {
    setLoading(true);
    setErr(null);

    const [{ data: orderData, error: orderError }, { data: userData, error: userError }, { data: depositData, error: depositError }] = await Promise.all([
      supabase
        .from("orders")
        .select("id,order_code,order_date,status,closed_at,production_completed_at,shipment_completed_at,shipment_status,customer_phone,customer_whatsapp,factory_bill_code,admin_user_id,short_qty,long_qty,free_qty,net_total,balance,factory_cost,customer_paid_full_at,factory_paid_full_at")
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

    if (depositError) {
      setErr(depositError.message);
    }

    const adminNames = new Map(((userData ?? []) as UserOption[]).map((user) => [user.id, user.full_name]));
    const depositByOrderId = new Map<string, DepositLookupRow>();

    ((depositData ?? []) as DepositLookupRow[]).forEach((row) => {
      if (!row.order_id || depositByOrderId.has(row.order_id)) return;
      depositByOrderId.set(row.order_id, row);
    });

    const nextRows = ((orderData ?? []) as OrderRow[]).map((row) => {
      const linkedDeposit = depositByOrderId.get(row.id);
      const totalQty = (Number(row.short_qty) || 0) + (Number(row.long_qty) || 0) + (Number(row.free_qty) || 0);
      const paidAmount = (Number(row.net_total) || 0) - (Number(row.balance) || 0);

      return {
        ...row,
        customer_name: linkedDeposit?.customer_name || null,
        team_name: linkedDeposit?.team_name || null,
        customer_phone: row.customer_phone || linkedDeposit?.customer_phone || null,
        customer_whatsapp: row.customer_whatsapp || linkedDeposit?.customer_whatsapp || null,
        is_rush: linkedDeposit?.production_priority === "urgent",
        admin_name: adminNames.get(row.admin_user_id || "") || "-",
        paid_amount: Math.max(0, paidAmount),
        total_qty: totalQty,
      } satisfies ExportRow;
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
    const { start, endExclusive } = periodRange(year, month);
    return rows.filter((row) => {
      const date = getComparableDate(row[dateField], dateField);
      if (!date || !(date >= start && date < endExclusive)) return false;
      if (!matchSelectedPrefixes(row.order_code, selectedPrefixes)) return false;
      if (adminFilter !== "all" && row.admin_user_id !== adminFilter) return false;
      if (!matchesSearch(row, searchTerm)) return false;

      const isCustomerPaid = Number(row.balance) === 0;
      if (customerPaymentStatus === "paid" && !isCustomerPaid) return false;
      if (customerPaymentStatus === "unpaid" && isCustomerPaid) return false;

      const isFactoryPaid = Boolean(row.factory_paid_full_at);
      if (factoryPaymentStatus === "paid" && !isFactoryPaid) return false;
      if (factoryPaymentStatus === "unpaid" && isFactoryPaid) return false;

      if (workflowStatus !== "all" && getWorkflowStatus(row) !== workflowStatus) return false;
      if (rushFilter === "rush" && !row.is_rush) return false;
      if (rushFilter === "normal" && row.is_rush) return false;
      return true;
    });
  }, [rows, month, year, dateField, selectedPrefixes, adminFilter, searchTerm, customerPaymentStatus, factoryPaymentStatus, workflowStatus, rushFilter]);

  const visibleColumns = useMemo(() => {
    const selected = COLUMN_DEFINITIONS.filter((column) => selectedColumns.includes(column.key));
    return selected.length > 0 ? selected : COLUMN_DEFINITIONS.filter((column) => DEFAULT_COLUMNS.includes(column.key));
  }, [selectedColumns]);

  const summary = useMemo(() => {
    return {
      totalRows: filteredRows.length,
      totalSales: filteredRows.reduce((sum, row) => sum + (Number(row.net_total) || 0), 0),
      totalPaid: filteredRows.reduce((sum, row) => sum + row.paid_amount, 0),
      totalBalance: filteredRows.reduce((sum, row) => sum + (Number(row.balance) || 0), 0),
    };
  }, [filteredRows]);

  const periodLabel = buildPeriodLabel(month, year);
  const prefixSummary = selectedPrefixes.length === 0 ? "ALL" : selectedPrefixes.join(", ");
  const dateFieldLabel = DATE_FIELD_OPTIONS.find((item) => item.value === dateField)?.label || "ວັນທີ";

  const toggleColumn = (columnKey: ExportColumnKey) => {
    setSelectedColumns((prev) =>
      prev.includes(columnKey) ? prev.filter((item) => item !== columnKey) : [...prev, columnKey]
    );
  };

  const previewRows = filteredRows.map((row) => visibleColumns.map((column) => column.value(row)));
  const previewHeaders = visibleColumns.map((column) => column.label);

  const exportExcel = () => {
    const periodFileLabel = month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`;
    const exportRows = filteredRows.map((row) =>
      Object.fromEntries(visibleColumns.map((column) => [column.label, column.value(row)]))
    );

    exportRows.push(
      Object.fromEntries(
        visibleColumns.map((column) => {
          if (column.key === "order_code") return [column.label, "ສະຫຼຸບລວມ"];
          if (column.key === "customer_name") return [column.label, `ຈຳນວນ ${summary.totalRows.toLocaleString()} ລາຍການ`];
          if (column.key === "net_total") return [column.label, summary.totalSales.toLocaleString()];
          if (column.key === "paid_amount") return [column.label, summary.totalPaid.toLocaleString()];
          if (column.key === "balance") return [column.label, summary.totalBalance.toLocaleString()];
          return [column.label, "-"];
        })
      )
    );

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "data_export_report");
    XLSX.writeFile(wb, `data-export-${periodFileLabel}.xlsx`);
  };

  const printParams = {
    title: "ລາຍງານດຶງຂໍ້ມູນ",
    subtitle: `ວັນທີ: ${dateFieldLabel} | ໄລຍະ: ${periodLabel} | ລະຫັດ: ${prefixSummary} | ແອັດມິນ: ${adminFilter === "all" ? "ທັງໝົດ" : adminOptions.find((user) => user.id === adminFilter)?.full_name || "-"} | ຄົ້ນຫາ: ${searchTerm || "-"} | ຈຳນວນ column: ${visibleColumns.length}`,
    summary: [
      { label: "ຈຳນວນລາຍການ", value: summary.totalRows.toLocaleString() },
      { label: "ຈຳນວນເງິນລວມ", value: summary.totalSales.toLocaleString() },
      { label: "ຈ່າຍແລ້ວ", value: summary.totalPaid.toLocaleString() },
      { label: "ຍອດຄ້າງ", value: summary.totalBalance.toLocaleString() },
    ],
    headers: previewHeaders,
    rows: previewRows,
  };

  const handlePrint = () => {
    openReportPrintWindow(printParams);
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportReportDocumentAsPdf(
        printParams,
        `data-export-${month === "ALL" ? `${year}-ALL` : `${year}-${String(month).padStart(2, "0")}`}.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ລາຍງານດຶງຂໍ້ມູນ</h1>
          <div className="text-sm font-medium text-slate-500">ເລືອກ column ແບບ Multi Select ແລະ preview ກ່ອນ export</div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
        >
          <RefreshCcw size={16} />
          ໂຫຼດຂໍ້ມູນຄືນ
        </button>
      </div>

      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

      <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <select value={dateField} onChange={(e) => setDateField(e.target.value as ReportDateField)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            {DATE_FIELD_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
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
          <select value={customerPaymentStatus} onChange={(e) => setCustomerPaymentStatus(e.target.value as CustomerPaymentStatus)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ການຊຳລະລູກຄ້າທັງໝົດ</option>
            <option value="paid">ຈ່າຍແລ້ວ</option>
            <option value="unpaid">ຄ້າງຈ່າຍ</option>
          </select>
          <select value={factoryPaymentStatus} onChange={(e) => setFactoryPaymentStatus(e.target.value as FactoryPaymentStatus)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ການຈ່າຍໂຮງງານທັງໝົດ</option>
            <option value="paid">ຈ່າຍແລ້ວ</option>
            <option value="unpaid">ຄ້າງຈ່າຍ</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <select value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ແອັດມິນທັງໝົດ</option>
            {adminOptions.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
          </select>
          <select value={rushFilter} onChange={(e) => setRushFilter(e.target.value as RushFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">ງານດ່ວນທັງໝົດ</option>
            <option value="rush">ສະເພາະງານດ່ວນ</option>
            <option value="normal">ສະເພາະງານປົກກະຕິ</option>
          </select>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ຄົ້ນຫາຊື່ລູກຄ້າ, ເບີໂທ, ລະຫັດ"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none"
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

        <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-slate-900">ເລືອກ column ທີ່ຕ້ອງການດຶງຂໍ້ມູນ</div>
              <div className="text-xs font-medium text-slate-500">ກົດເລືອກເອົາໄດ້ຫຼາຍອັນພ້ອມກັນ</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedColumns(COLUMN_DEFINITIONS.map((column) => column.key))} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">
                ເລືອກທັງໝົດ
              </button>
              <button type="button" onClick={() => setSelectedColumns(DEFAULT_COLUMNS)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">
                ຄ່າແນະນຳ
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {COLUMN_DEFINITIONS.map((column) => {
              const active = selectedColumns.includes(column.key);
              return (
                <button
                  key={column.key}
                  type="button"
                  onClick={() => toggleColumn(column.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${active ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {column.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ຈຳນວນລາຍການ</div>
            <div className="text-xl font-black text-slate-900">{summary.totalRows.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ຈຳນວນເງິນລວມ</div>
            <div className="text-xl font-black text-slate-900">{summary.totalSales.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ຈ່າຍແລ້ວ</div>
            <div className="text-xl font-black text-emerald-600">{summary.totalPaid.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-700">ຍອດຄ້າງ</div>
            <div className="text-xl font-black text-rose-600">{summary.totalBalance.toLocaleString()}</div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={handlePrint} disabled={previewRows.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Printer size={16} />
            ພິມ
          </button>
          <button onClick={handleExportPdf} disabled={previewRows.length === 0 || exportingPdf} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50">
            <FileDown size={16} />
            {exportingPdf ? "ກຳລັງສ້າງ PDF..." : "ສ້າງ PDF"}
          </button>
          <button onClick={exportExcel} disabled={previewRows.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">
            <Download size={16} />
            ດາວໂຫຼດ XLSX
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b bg-slate-50 p-4 text-sm font-black uppercase text-slate-800">
          Preview ຂໍ້ມູນ ({filteredRows.length}) / columns ({visibleColumns.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-slate-700">
              <tr>
                {visibleColumns.map((column) => (
                  <th key={column.key} className="p-3 text-left text-xs font-black uppercase">{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td className="p-8 text-center font-bold text-slate-500" colSpan={visibleColumns.length || 1}>ບໍ່ມີຂໍ້ມູນ</td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    {visibleColumns.map((column) => (
                      <td key={`${row.id}-${column.key}`} className="p-3 text-slate-800">
                        {column.value(row)}
                      </td>
                    ))}
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
