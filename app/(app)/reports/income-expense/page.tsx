"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Download,
  FileDown,
  PencilLine,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { calculatePayroll, type PayrollEmployee } from "@/lib/payroll-demo";
import { supabase } from "@/lib/supabase";
import { exportReportDocumentAsPdf, openReportPrintWindow } from "../_lib";

type OrderLite = {
  id: string;
  order_code: string;
  customer_phone: string | null;
  factory_bill_code: string | null;
  net_total: number;
  factory_cost: number;
  shipment_completed_at: string | null;
  shipment_status?: "pending" | "shipped" | null;
};

type PaymentTransactionRow = {
  id: string;
  order_id: string;
  amount: number;
  paid_at: string;
  note: string | null;
  created_at?: string | null;
};

type ManualEntryRow = {
  id: string;
  entry_type: "income" | "expense";
  entry_date: string;
  category: string;
  title: string;
  amount: number;
  payment_method: "cash" | "transfer" | "other" | null;
  reference_code: string | null;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at?: string | null;
};

type ViewerRow = {
  id: string;
  full_name: string | null;
};

type LedgerSource = "customer_payment" | "manual" | "payroll";
type EntryTypeFilter = "all" | "income" | "expense";
type SourceFilter = "all" | LedgerSource;
type DateRangeMode = "1day" | "7days" | "30days" | "custom";

type LedgerRow = {
  id: string;
  entryType: "income" | "expense";
  source: LedgerSource;
  occurredAt: string;
  category: string;
  title: string;
  amount: number;
  paymentMethod: "cash" | "transfer" | "other" | "unknown";
  referenceCode: string | null;
  note: string | null;
  orderCode: string | null;
  customerPhone: string | null;
  factoryBillCode: string | null;
  createdByName: string | null;
  isManual: boolean;
};

type FormState = {
  entryType: "income" | "expense";
  entryDate: string;
  category: string;
  title: string;
  amount: string;
  paymentMethod: "cash" | "transfer" | "other";
  referenceCode: string;
  note: string;
};

const INCOME_CATEGORY_PRESETS = ["ລາຍຮັບອື່ນໆ", "ຮັບເງິນເພີ່ມ", "ປັບເຂົ້າບັນຊີ", "ຮັບຄືນຄ່າໃຊ້ຈ່າຍ"];
const EXPENSE_CATEGORY_PRESETS = ["ຄ່ານ້ຳ-ຄ່າໄຟ", "ຄ່າພະນັກງານ", "ຄ່າເຊົ່າ", "ອື່ນໆ"];

function formatMoney(value: number) {
  return `₭ ${Number(value || 0).toLocaleString("en-US")}`;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateTimeInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getRelativeDateRange(mode: Exclude<DateRangeMode, "custom">, anchorValue?: string) {
  const baseValue = anchorValue || toDateInputValue(new Date());
  const now = new Date(`${baseValue}T00:00:00`);
  const today = toDateInputValue(now);
  const monthBounds = getMonthBounds(today);

  if (mode === "1day") {
    return { from: today, to: today };
  }

  if (mode === "30days") {
    return monthBounds;
  }

  if (mode === "7days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return {
      from: toDateInputValue(start) < monthBounds.from ? monthBounds.from : toDateInputValue(start),
      to: today > monthBounds.to ? monthBounds.to : today,
    };
  }

  return { from: today, to: today };
}

function getMonthBounds(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    const fallback = toDateInputValue(new Date());
    return { from: fallback, to: fallback };
  }

  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    from: toDateInputValue(new Date(year, month, 1)),
    to: toDateInputValue(new Date(year, month + 1, 0)),
  };
}

function createDefaultFormState(): FormState {
  return {
    entryType: "expense",
    entryDate: toDateTimeInputValue(new Date()),
    category: "",
    title: "",
    amount: "",
    paymentMethod: "cash",
    referenceCode: "",
    note: "",
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

function getDayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDateKeysInRange(from: string, to: string) {
  if (!from || !to || from > to) return [];

  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);

  while (cursor <= end) {
    dates.push(toDateInputValue(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function getEntryTypeLabel(value: LedgerRow["entryType"]) {
  return value === "income" ? "ລາຍຮັບ" : "ລາຍຈ່າຍ";
}

function getSourceLabel(value: LedgerSource) {
  if (value === "customer_payment") return "ຮັບເງິນລູກຄ້າ";
  if (value === "payroll") return "ເງິນເດືອນພະນັກງານ";
  return "ບັນທຶກເພີ່ມເອງ";
}

function getPaymentMethodLabel(value: LedgerRow["paymentMethod"] | FormState["paymentMethod"] | null) {
  if (value === "cash") return "ເງິນສົດ";
  if (value === "transfer") return "ໂອນ";
  if (value === "other") return "ອື່ນໆ";
  return "ບໍ່ລະບຸ";
}

function sourceBadgeClass(source: LedgerSource) {
  if (source === "customer_payment") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (source === "payroll") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function getExpenseGroup(category: string) {
  const value = category.trim().toLowerCase();
  if (
    value.includes("ນ້ຳ") ||
    value.includes("ໄຟ") ||
    value.includes("water") ||
    value.includes("electric")
  ) {
    return "utilities";
  }
  if (
    value.includes("ພະນັກງານ") ||
    value.includes("ເງິນເດືອນ") ||
    value.includes("salary") ||
    value.includes("staff")
  ) {
    return "staff";
  }
  if (value.includes("ເຊົ່າ") || value.includes("rent")) {
    return "rent";
  }
  return "other";
}

function typeBadgeClass(type: LedgerRow["entryType"]) {
  return type === "income" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700";
}

function matchesSearch(row: LedgerRow, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystacks = [
    row.title,
    row.category,
    row.referenceCode || "",
    row.note || "",
    row.orderCode || "",
    row.factoryBillCode || "",
    row.customerPhone || "",
    row.createdByName || "",
  ].map((item) => item.toLowerCase());

  return haystacks.some((item) => item.includes(normalized));
}

export default function IncomeExpenseReportPage() {
  const initialRange = getRelativeDateRange("7days");
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [manualEntries, setManualEntries] = useState<ManualEntryRow[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [payrollEmployees, setPayrollEmployees] = useState<PayrollEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ledgerWarning, setLedgerWarning] = useState<string | null>(null);
  const [manualLedgerReady, setManualLedgerReady] = useState(true);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerName, setViewerName] = useState("");

  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>("7days");
  const [entryTypeFilter, setEntryTypeFilter] = useState<EntryTypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<FormState>(createDefaultFormState);

  const presetCategories = form.entryType === "income" ? INCOME_CATEGORY_PRESETS : EXPENSE_CATEGORY_PRESETS;

  const applyDateRange = (mode: Exclude<DateRangeMode, "custom">) => {
    const range = getRelativeDateRange(mode, toDate);
    setDateRangeMode(mode);
    setFromDate(range.from);
    setToDate(range.to);
  };

  const applyMonthRange = (value: string) => {
    const range = getMonthBounds(value);
    setDateRangeMode("custom");
    setFromDate(range.from);
    setToDate(range.to);
  };

  const loadPage = async () => {
    setLoading(true);
    setErrorMessage(null);
    setLedgerWarning(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id || null;

    const [paymentsResult, ordersResult, manualResult, payrollResult, viewerResult] = await Promise.all([
      supabase
        .from("payment_transactions")
        .select("id,order_id,amount,paid_at,note,created_at")
        .order("paid_at", { ascending: false }),
      supabase
        .from("orders")
        .select("id,order_code,customer_phone,factory_bill_code,net_total,factory_cost,shipment_completed_at,shipment_status")
        .order("created_at", { ascending: false }),
      supabase
        .from("income_expense_entries")
        .select("id,entry_type,entry_date,category,title,amount,payment_method,reference_code,note,created_by_name,created_at,updated_at")
        .order("entry_date", { ascending: false }),
      supabase
        .from("payroll_employees")
        .select("*")
        .eq("is_active", true)
        .order("full_name", { ascending: true }),
      authUserId
        ? supabase.from("users").select("id,full_name").eq("auth_user_id", authUserId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (paymentsResult.error) {
      setRows([]);
      setManualEntries([]);
      setOrders([]);
      setPayrollEmployees([]);
      setErrorMessage(paymentsResult.error.message);
      setLoading(false);
      return;
    }

    if (ordersResult.error) {
      setRows([]);
      setManualEntries([]);
      setOrders([]);
      setPayrollEmployees([]);
      setErrorMessage(ordersResult.error.message);
      setLoading(false);
      return;
    }

    const warnings: string[] = [];
    const missingManualLedger =
      manualResult.error?.message.includes("Could not find the table") ||
      manualResult.error?.message.includes("relation \"public.income_expense_entries\" does not exist");

    if (manualResult.error && !missingManualLedger) {
      setRows([]);
      setManualEntries([]);
      setOrders([]);
      setPayrollEmployees([]);
      setErrorMessage(manualResult.error.message);
      setLoading(false);
      return;
    }

    if (missingManualLedger) {
      setManualLedgerReady(false);
      warnings.push("ຍັງບໍ່ພົບຕາຕະລາງ income_expense_entries ກະລຸນາລັນ migration 20260514_create_income_expense_entries.sql ກ່ອນ");
    } else {
      setManualLedgerReady(true);
    }

    const missingPayrollLedger =
      payrollResult.error?.message.includes("Could not find the table") ||
      payrollResult.error?.message.includes("relation \"public.payroll_employees\" does not exist");

    if (payrollResult.error && !missingPayrollLedger) {
      setRows([]);
      setManualEntries([]);
      setOrders([]);
      setPayrollEmployees([]);
      setErrorMessage(payrollResult.error.message);
      setLoading(false);
      return;
    }

    if (missingPayrollLedger) {
      warnings.push("ຍັງບໍ່ພົບຕາຕະລາງ payroll_employees ດັ່ງນັ້ນລາຍຈ່າຍ payroll ຈະຍັງບໍ່ຖືກນຳເຂົ້າອັດຕະໂນມັດ");
    }

    const ordersById = new Map(((ordersResult.data ?? []) as OrderLite[]).map((row) => [row.id, row]));
    const customerRows = ((paymentsResult.data ?? []) as PaymentTransactionRow[]).map((row) => {
      const order = ordersById.get(row.order_id);
      return {
        id: `customer-${row.id}`,
        entryType: "income" as const,
        source: "customer_payment" as const,
        occurredAt: row.paid_at,
        category: "ຮັບເງິນອໍເດີ",
        title: order?.order_code ? `ຮັບເງິນຈາກ ${order.order_code}` : "ຮັບເງິນລູກຄ້າ",
        amount: Number(row.amount) || 0,
        paymentMethod: "unknown" as const,
        referenceCode: order?.order_code || null,
        note: row.note,
        orderCode: order?.order_code || null,
        customerPhone: order?.customer_phone || null,
        factoryBillCode: order?.factory_bill_code || null,
        createdByName: null,
        isManual: false,
      } satisfies LedgerRow;
    });

    const manualRows = manualLedgerReady
      ? ((manualResult.data ?? []) as ManualEntryRow[]).map((row) => ({
          id: `manual-${row.id}`,
          entryType: row.entry_type,
          source: "manual" as const,
          occurredAt: row.entry_date,
          category: row.category,
          title: row.title,
          amount: Number(row.amount) || 0,
          paymentMethod: row.payment_method || "unknown",
          referenceCode: row.reference_code,
          note: row.note,
          orderCode: null,
          customerPhone: null,
          factoryBillCode: null,
          createdByName: row.created_by_name,
          isManual: true,
        }))
      : [];

    setRows(
      [...customerRows, ...manualRows].sort((a, b) => {
        if (a.occurredAt === b.occurredAt) return a.id.localeCompare(b.id);
        return b.occurredAt.localeCompare(a.occurredAt);
      })
    );
    setOrders((ordersResult.data ?? []) as OrderLite[]);

    setManualEntries(
      manualLedgerReady
        ? (((manualResult.data ?? []) as ManualEntryRow[]).sort((a, b) => b.entry_date.localeCompare(a.entry_date)))
        : []
    );
    setViewerUserId(viewerResult.data?.id ? String((viewerResult.data as ViewerRow).id) : null);
    setViewerName(String((viewerResult.data as ViewerRow | null)?.full_name || ""));
    setPayrollEmployees(missingPayrollLedger ? [] : ((payrollResult.data ?? []) as PayrollEmployee[]));
    setLedgerWarning(warnings.length > 0 ? warnings.join(" • ") : null);
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPage();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payrollRows = useMemo(() => {
    if (payrollEmployees.length === 0) return [];

    const monthBounds = getMonthBounds(toDate);
    const paidAt = `${monthBounds.to}T18:00:00`;

    return payrollEmployees.map((employee) => {
      const payroll = calculatePayroll(employee);
      return {
        id: `payroll-${employee.id}-${monthBounds.to}`,
        entryType: "expense" as const,
        source: "payroll" as const,
        occurredAt: paidAt,
        category: "ຄ່າພະນັກງານ",
        title: `ເງິນເດືອນ ${employee.full_name}`,
        amount: Math.max(0, Number(payroll.netSalary) || 0),
        paymentMethod: "unknown" as const,
        referenceCode: employee.employee_code || null,
        note: `${monthBounds.from.slice(0, 7)} • ${employee.department || "-"}`,
        orderCode: null,
        customerPhone: null,
        factoryBillCode: null,
        createdByName: null,
        isManual: false,
      } satisfies LedgerRow;
    });
  }, [payrollEmployees, toDate]);

  const ledgerRows = useMemo(() => {
    return [...rows, ...payrollRows].sort((a, b) => {
      if (a.occurredAt === b.occurredAt) return a.id.localeCompare(b.id);
      return b.occurredAt.localeCompare(a.occurredAt);
    });
  }, [payrollRows, rows]);

  const categoryOptions = useMemo(() => {
    return [...new Set(ledgerRows.map((row) => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [ledgerRows]);

  const filteredRows = useMemo(() => {
    return ledgerRows.filter((row) => {
      const dayKey = getDayKey(row.occurredAt);
      if (fromDate && dayKey < fromDate) return false;
      if (toDate && dayKey > toDate) return false;
      if (entryTypeFilter !== "all" && row.entryType !== entryTypeFilter) return false;
      if (sourceFilter !== "all" && row.source !== sourceFilter) return false;
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (!matchesSearch(row, searchTerm)) return false;
      return true;
    });
  }, [ledgerRows, fromDate, toDate, entryTypeFilter, sourceFilter, categoryFilter, searchTerm]);

  const summary = useMemo(() => {
    const deliveredProfit = orders
      .filter((order) => {
        const deliveredAt = order.shipment_completed_at;
        if (!deliveredAt) return false;
        const dayKey = getDayKey(deliveredAt);
        if (fromDate && dayKey < fromDate) return false;
        if (toDate && dayKey > toDate) return false;
        if (order.shipment_status && order.shipment_status !== "shipped") return false;
        return true;
      })
      .reduce((sum, order) => sum + ((Number(order.net_total) || 0) - (Number(order.factory_cost) || 0)), 0);
    const deliveredOrdersCount = orders.filter((order) => {
      const deliveredAt = order.shipment_completed_at;
      if (!deliveredAt) return false;
      const dayKey = getDayKey(deliveredAt);
      if (fromDate && dayKey < fromDate) return false;
      if (toDate && dayKey > toDate) return false;
      if (order.shipment_status && order.shipment_status !== "shipped") return false;
      return true;
    }).length;
    const totalIncome = filteredRows
      .filter((row) => row.entryType === "income")
      .reduce((sum, row) => sum + row.amount, 0);
    const totalExpense = filteredRows
      .filter((row) => row.entryType === "expense")
      .reduce((sum, row) => sum + row.amount, 0);
    const customerIncome = filteredRows
      .filter((row) => row.source === "customer_payment")
      .reduce((sum, row) => sum + row.amount, 0);
    const manualIncome = filteredRows
      .filter((row) => row.source === "manual" && row.entryType === "income")
      .reduce((sum, row) => sum + row.amount, 0);
    const manualExpense = filteredRows
      .filter((row) => row.source === "manual" && row.entryType === "expense")
      .reduce((sum, row) => sum + row.amount, 0);
    const utilitiesExpense = filteredRows
      .filter((row) => row.entryType === "expense" && getExpenseGroup(row.category) === "utilities")
      .reduce((sum, row) => sum + row.amount, 0);
    const staffExpense = filteredRows
      .filter((row) => row.entryType === "expense" && getExpenseGroup(row.category) === "staff")
      .reduce((sum, row) => sum + row.amount, 0);
    const rentExpense = filteredRows
      .filter((row) => row.entryType === "expense" && getExpenseGroup(row.category) === "rent")
      .reduce((sum, row) => sum + row.amount, 0);
    const otherExpense = filteredRows
      .filter((row) => row.entryType === "expense" && getExpenseGroup(row.category) === "other")
      .reduce((sum, row) => sum + row.amount, 0);

    return {
      deliveredProfit,
      deliveredOrdersCount,
      totalIncome,
      totalExpense,
      remainingBalance: deliveredProfit - totalExpense,
      actualMonthlyProfit: deliveredProfit - totalExpense,
      customerIncome,
      manualIncome,
      manualExpense,
      utilitiesExpense,
      staffExpense,
      rentExpense,
      otherExpense,
      transactionCount: filteredRows.length,
    };
  }, [filteredRows, fromDate, orders, toDate]);

  const chartData = useMemo(() => {
    const grouped = new Map<string, { day: string; income: number; expense: number }>();

    filteredRows.forEach((row) => {
      const key = getDayKey(row.occurredAt);
      if (!key) return;
      const current = grouped.get(key) || { day: key, income: 0, expense: 0 };
      if (row.entryType === "income") current.income += row.amount;
      else current.expense += row.amount;
      grouped.set(key, current);
    });

    return buildDateKeysInRange(fromDate, toDate).map((day) => {
      const current = grouped.get(day);
      return {
        day,
        income: current?.income || 0,
        expense: current?.expense || 0,
      };
    });
  }, [filteredRows, fromDate, toDate]);

  const expenseCategoryData = useMemo(() => {
    const grouped = new Map<string, number>();

    filteredRows
      .filter((row) => row.entryType === "expense")
      .forEach((row) => {
        grouped.set(row.category, (grouped.get(row.category) || 0) + row.amount);
      });

    return Array.from(grouped.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [filteredRows]);

  const expenseBreakdown = useMemo(() => {
    return [
      {
        label: "ຄ່ານ້ຳ-ຄ່າໄຟ",
        value: summary.utilitiesExpense,
        hint: "ລວມຄ່ານ້ຳ, ຄ່າໄຟ ແລະ ຄ່າໃຊ້ຈ່າຍສາທາລະນູປະໂພກ",
        tone: "text-sky-700",
      },
      {
        label: "ຄ່າພະນັກງານ",
        value: summary.staffExpense,
        hint: "ເງິນເດືອນ, ຄ່າແຮງງານ, ເບ້ຍລ້ຽງ",
        tone: "text-emerald-700",
      },
      {
        label: "ຄ່າເຊົ່າ",
        value: summary.rentExpense,
        hint: "ຄ່າເຊົ່າຮ້ານ, ຄ່າເຊົ່າສຳນັກງານ ຫຼື ສາງ",
        tone: "text-violet-700",
      },
      {
        label: "ອື່ນໆ",
        value: summary.otherExpense,
        hint: "ລາຍຈ່າຍທົ່ວໄປທີ່ບໍ່ໄດ້ຢູ່ 3 ໝວດຫຼັກ",
        tone: "text-amber-700",
      },
    ];
  }, [summary.otherExpense, summary.rentExpense, summary.staffExpense, summary.utilitiesExpense]);

  const reportTitle = "ບັນຊີລາຍຮັບ-ລາຍຈ່າຍ";
  const reportSubtitle = `ໄລຍະ: ${fromDate} -> ${toDate} | ປະເພດ: ${
    entryTypeFilter === "all" ? "ທັງໝົດ" : getEntryTypeLabel(entryTypeFilter)
  } | ແຫຼ່ງທີ່ມາ: ${sourceFilter === "all" ? "ທັງໝົດ" : getSourceLabel(sourceFilter)} | ໝວດໝູ່: ${
    categoryFilter === "all" ? "ທັງໝົດ" : categoryFilter
  } | ຄົ້ນຫາ: ${searchTerm || "-"}`;
  const reportSummary = [
    { label: "ກຳໄລເດືອນ", value: formatMoney(summary.deliveredProfit) },
    { label: "ລາຍຈ່າຍລວມ", value: formatMoney(summary.totalExpense) },
    { label: "ຍອດຄົງເຫຼືອ", value: formatMoney(summary.remainingBalance) },
    { label: "ກຳໄລຈິງ", value: formatMoney(summary.actualMonthlyProfit) },
  ];
  const reportHeaders = ["ວັນທີ", "ປະເພດ", "ແຫຼ່ງທີ່ມາ", "ໝວດໝູ່", "ລາຍການ", "ອ້າງອີງ", "ຈຳນວນເງິນ"];
  const reportRows = filteredRows.map((row) => [
    formatDateTime(row.occurredAt),
    getEntryTypeLabel(row.entryType),
    getSourceLabel(row.source),
    row.category,
    row.title,
    row.referenceCode || row.orderCode || "-",
    formatMoney(row.amount),
  ]);

  const resetForm = () => {
    setEditingId(null);
    setForm(createDefaultFormState());
  };

  const handleExportExcel = () => {
    const exportRows = filteredRows.map((row) => ({
      date_time: formatDateTime(row.occurredAt),
      type: getEntryTypeLabel(row.entryType),
      source: getSourceLabel(row.source),
      category: row.category,
      title: row.title,
      amount: row.amount,
      payment_method: getPaymentMethodLabel(row.paymentMethod),
      reference_code: row.referenceCode || "",
      order_code: row.orderCode || "",
      factory_bill_code: row.factoryBillCode || "",
      customer_phone: row.customerPhone || "",
      note: row.note || "",
      created_by: row.createdByName || "",
    }));

    exportRows.push({
      date_time: `${fromDate || "-"} -> ${toDate || "-"}`,
      type: "ສະຫຼຸບ",
      source: sourceFilter === "all" ? "ທັງໝົດ" : getSourceLabel(sourceFilter),
      category: categoryFilter === "all" ? "ທຸກໝວດ" : categoryFilter,
      title: `ລາຍການ ${summary.transactionCount}`,
      amount: summary.actualMonthlyProfit,
      payment_method: entryTypeFilter === "all" ? "ລາຍຮັບ-ລາຍຈ່າຍ" : getEntryTypeLabel(entryTypeFilter),
      reference_code: "",
      order_code: "",
      factory_bill_code: "",
      customer_phone: "",
      note: `ກຳໄລຕັ້ງຕົ້ນ ${summary.deliveredProfit} / ລາຍຈ່າຍ ${summary.totalExpense}`,
      created_by: "",
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "income_expense");
    XLSX.writeFile(workbook, `income-expense-${fromDate || "all"}-${toDate || "all"}.xlsx`);
  };

  const handlePrint = () => {
    openReportPrintWindow({
      title: reportTitle,
      subtitle: reportSubtitle,
      summary: reportSummary,
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
          summary: reportSummary,
          headers: reportHeaders,
          rows: reportRows,
        },
        `income-expense-${fromDate || "all"}-${toDate || "all"}.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handleSubmit = async () => {
    if (!manualLedgerReady) {
      toast.error("ຍັງບໍ່ພ້ອມໃຊ້ງານຕາຕະລາງບັນທຶກເພີ່ມເອງ");
      return;
    }

    const category = form.category.trim();
    const title = form.title.trim();
    const amount = Number(form.amount);

    if (!category) {
      toast.error("ກະລຸນາໃສ່ໝວດໝູ່");
      return;
    }
    if (!title) {
      toast.error("ກະລຸນາໃສ່ຫົວຂໍ້ລາຍການ");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0");
      return;
    }

    setSaving(true);
    const payload = {
      entry_type: form.entryType,
      entry_date: new Date(form.entryDate).toISOString(),
      category,
      title,
      amount,
      payment_method: form.paymentMethod,
      reference_code: form.referenceCode.trim() || null,
      note: form.note.trim() || null,
      created_by_user_id: viewerUserId,
      created_by_name: viewerName || null,
      updated_at: new Date().toISOString(),
    };

    const query = editingId
      ? supabase.from("income_expense_entries").update(payload).eq("id", editingId)
      : supabase.from("income_expense_entries").insert(payload);
    const { error } = await query;
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(editingId ? "ອັບເດດລາຍການສຳເລັດ" : "ບັນທຶກລາຍການສຳເລັດ");
    resetForm();
    await loadPage();
  };

  const handleEdit = (entry: ManualEntryRow) => {
    setEditingId(entry.id);
    setForm({
      entryType: entry.entry_type,
      entryDate: toDateTimeInputValue(new Date(entry.entry_date)),
      category: entry.category,
      title: entry.title,
      amount: String(Number(entry.amount) || ""),
      paymentMethod: entry.payment_method || "cash",
      referenceCode: entry.reference_code || "",
      note: entry.note || "",
    });
  };

  const handleDelete = async (entry: ManualEntryRow) => {
    if (!window.confirm(`ຢືນຢັນລົບລາຍການ "${entry.title}" ຫຼື ບໍ່?`)) return;

    setDeletingId(entry.id);
    const { error } = await supabase.from("income_expense_entries").delete().eq("id", entry.id);
    setDeletingId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("ລົບລາຍການແລ້ວ");
    if (editingId === entry.id) resetForm();
    await loadPage();
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white shadow-[0_30px_80px_-38px_rgba(15,23,42,0.85)]">
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-slate-200">
              <Wallet size={14} />
              Monthly Operating Account
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white">ບັນຊີລາຍຮັບ-ລາຍຈ່າຍ</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-300">
              ໜ້ານີ້ໃຊ້ສຳລັບຄິດໄລ່ລາຍຮັບລວມຂອງເດືອນ ແລະ ລາຍຈ່າຍພາຍໃນຮ້ານເທົ່ານັ້ນ
              ເຊັ່ນ ຄ່ານ້ຳ-ຄ່າໄຟ, ຄ່າພະນັກງານ, ຄ່າເຊົ່າ ແລະ ອື່ນໆ ໂດຍບໍ່ຮວມຕົ້ນທຶນໂຮງງານ.
            </p>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={handleExportExcel}
                className="group rounded-[22px] border border-emerald-300/25 bg-gradient-to-br from-emerald-500/18 to-teal-400/10 p-4 text-left transition hover:border-emerald-200/40 hover:from-emerald-400/24 hover:to-teal-300/16"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200/80">Spreadsheet</div>
                    <div className="mt-2 text-lg font-black text-white">Export Excel</div>
                    <div className="mt-1 text-xs font-semibold text-emerald-100/75">ດາວໂຫຼດຂໍ້ມູນເປັນ Excel</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200/20 bg-white/10 p-3 text-emerald-100 transition group-hover:bg-white/15">
                    <Download size={18} />
                  </div>
                </div>
              </button>

              <button
                onClick={() => void handleExportPdf()}
                disabled={exportingPdf || filteredRows.length === 0}
                className="group rounded-[22px] border border-sky-300/25 bg-gradient-to-br from-sky-500/16 to-blue-500/10 p-4 text-left transition hover:border-sky-200/40 hover:from-sky-400/22 hover:to-blue-400/16 disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-sky-200/80">Document</div>
                    <div className="mt-2 text-lg font-black text-white">{exportingPdf ? "ກຳລັງສ້າງ PDF..." : "Export PDF"}</div>
                    <div className="mt-1 text-xs font-semibold text-sky-100/75">ສົ່ງອອກລາຍງານເປັນ PDF</div>
                  </div>
                  <div className="rounded-2xl border border-sky-200/20 bg-white/10 p-3 text-sky-100 transition group-hover:bg-white/15">
                    <FileDown size={18} />
                  </div>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1.1fr]">
              <button
                onClick={() => void loadPage()}
                disabled={loading}
                className="group rounded-[20px] border border-white/12 bg-white/8 px-4 py-3 text-left transition hover:bg-white/12 disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-white/12 bg-white/8 p-2.5 text-slate-100">
                    <RefreshCw size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-black text-white">ໂຫຼດຄືນ</div>
                    <div className="text-xs font-semibold text-slate-300">ອັບເດດຂໍ້ມູນຫຼ້າສຸດ</div>
                  </div>
                </div>
              </button>

              <button
                onClick={handlePrint}
                disabled={filteredRows.length === 0}
                className="group rounded-[20px] border border-white/12 bg-white/8 px-4 py-3 text-left transition hover:bg-white/12 disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-white/12 bg-white/8 p-2.5 text-slate-100">
                    <Printer size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-black text-white">ພິມລາຍງານ</div>
                    <div className="text-xs font-semibold text-slate-300">ເປີດໜ້າ print ທັນທີ</div>
                  </div>
                </div>
              </button>

              <div className="rounded-[20px] border border-white/12 bg-white/8 px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-300">ຜູ້ຈັດການ</div>
                <div className="mt-2 text-lg font-black text-white">{viewerName || "superadmin"}</div>
                <div className="mt-1 text-xs font-semibold text-slate-300">ສິດຈັດການບັນຊີເດືອນນີ້</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">{errorMessage}</div>
      ) : null}

      {ledgerWarning ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-700">{ledgerWarning}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-500">ກຳໄລຂອງເດືອນ</div>
            <div className="rounded-2xl bg-emerald-100 p-2 text-emerald-700">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-emerald-700">{formatMoney(summary.deliveredProfit)}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            ຄິດຈາກອໍເດີທີ່ `ຈັດສົ່ງສຳເລັດ` {summary.deliveredOrdersCount.toLocaleString("en-US")} ລາຍການ
          </div>
        </div>

        <div className="rounded-3xl border border-rose-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-500">ລາຍຈ່າຍລວມ</div>
            <div className="rounded-2xl bg-rose-100 p-2 text-rose-700">
              <TrendingDown size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-rose-700">{formatMoney(summary.totalExpense)}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">ຄ່ານ້ຳໄຟ, ຄ່າພະນັກງານ, ຄ່າເຊົ່າ, ອື່ນໆ</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-500">ຍອດຄົງເຫຼືອ</div>
            <div className="rounded-2xl bg-slate-100 p-2 text-slate-700">
              <Wallet size={18} />
            </div>
          </div>
          <div className={`mt-3 text-2xl font-black ${summary.remainingBalance >= 0 ? "text-slate-900" : "text-rose-700"}`}>
            {formatMoney(summary.remainingBalance)}
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">ກຳໄລຂອງເດືອນ - ລາຍຈ່າຍລວມ</div>
        </div>

        <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-500">ຍອດກຳໄລຈິງໃນເດືອນ</div>
            <div className="rounded-2xl bg-blue-100 p-2 text-blue-700">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className={`mt-3 text-2xl font-black ${summary.actualMonthlyProfit >= 0 ? "text-blue-700" : "text-rose-700"}`}>
            {formatMoney(summary.actualMonthlyProfit)}
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            ນຳມາຈາກ `ຍອດຄົງເຫຼືອ` ຫຼັງຫັກລາຍຈ່າຍແລ້ວ ເພື່ອໃຊ້ເປັນກຳໄລຈິງຂອງເດືອນ
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-sky-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-500">ຄ່ານ້ຳ-ຄ່າໄຟ</div>
          <div className="mt-3 text-2xl font-black text-sky-700">{formatMoney(summary.utilitiesExpense)}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">ລວມລາຍຈ່າຍສາທາລະນູປະໂພກ</div>
        </div>
        <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-500">ຄ່າພະນັກງານ</div>
          <div className="mt-3 text-2xl font-black text-emerald-700">{formatMoney(summary.staffExpense)}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">ເງິນເດືອນ ແລະ ຄ່າແຮງງານ</div>
        </div>
        <div className="rounded-3xl border border-violet-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-500">ຄ່າເຊົ່າ</div>
          <div className="mt-3 text-2xl font-black text-violet-700">{formatMoney(summary.rentExpense)}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">ຄ່າເຊົ່າຮ້ານ, ອາຄານ, ສາງ</div>
        </div>
        <div className="rounded-3xl border border-amber-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-500">ອື່ນໆ</div>
          <div className="mt-3 text-2xl font-black text-amber-700">{formatMoney(summary.otherExpense)}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">ລາຍຈ່າຍທົ່ວໄປນອກເໜືອ 3 ໝວດຫຼັກ</div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">ຕົວກອງລາຍງານ</h2>
            <p className="text-sm font-medium text-slate-500">ກຳນົດໄລຍະເວລາ ແລະ ຮູບແບບລາຍການທີ່ຢາກເບິ່ງ</p>
          </div>
          <button
            onClick={() => {
              const defaultRange = getRelativeDateRange("7days");
              setDateRangeMode("7days");
              setFromDate(defaultRange.from);
              setToDate(defaultRange.to);
              setEntryTypeFilter("all");
              setSourceFilter("all");
              setCategoryFilter("all");
              setSearchTerm("");
            }}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-100"
          >
            ຄືນຄ່າເລີ່ມຕົ້ນ
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຈາກວັນທີ</label>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => {
                applyMonthRange(event.target.value);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຫາວັນທີ</label>
            <input
              type="date"
              value={toDate}
              onChange={(event) => {
                applyMonthRange(event.target.value);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ປະເພດ</label>
            <select
              value={entryTypeFilter}
              onChange={(event) => setEntryTypeFilter(event.target.value as EntryTypeFilter)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
            >
              <option value="all">ທັງໝົດ</option>
              <option value="income">ລາຍຮັບ</option>
              <option value="expense">ລາຍຈ່າຍ</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ແຫຼ່ງທີ່ມາ</label>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
            >
              <option value="all">ທັງໝົດ</option>
              <option value="customer_payment">ຮັບເງິນລູກຄ້າ</option>
              <option value="payroll">ເງິນເດືອນພະນັກງານ</option>
              <option value="manual">ບັນທຶກເພີ່ມເອງ</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ໝວດໝູ່</label>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
            >
              <option value="all">ທຸກໝວດ</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຄົ້ນຫາ</label>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="ລາຍການ / code / note"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">ແນວໂນ້ມລາຍຮັບ-ລາຍຈ່າຍ</h2>
              <p className="text-sm font-medium text-slate-500">ເບິ່ງເງິນເຂົ້າ ແລະ ເງິນອອກຕາມວັນ</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([
                { key: "1day", label: "1 ວັນ" },
                { key: "7days", label: "7 ວັນ" },
                { key: "30days", label: "30 ວັນ" },
              ] as Array<{ key: Exclude<DateRangeMode, "custom">; label: string }>).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => applyDateRange(option.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                    dateRangeMode === option.key
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatMoney(Number(value) || 0), name === "income" ? "ລາຍຮັບ" : "ລາຍຈ່າຍ"]}
                  labelFormatter={(label) => `ວັນທີ ${label}`}
                />
                <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} fill="url(#incomeFill)" />
                <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={3} fill="url(#expenseFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">ໝວດລາຍຈ່າຍສູງສຸດ</h2>
              <p className="text-sm font-medium text-slate-500">Top ລາຍຈ່າຍຕາມໝວດໝູ່</p>
            </div>
            <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">
              {expenseCategoryData.length} ໝວດ
            </div>
          </div>

          <div className="mt-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseCategoryData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fill: "#475569", fontSize: 12, fontWeight: 700 }} />
                <Tooltip formatter={(value: number) => [formatMoney(Number(value) || 0), "ລາຍຈ່າຍ"]} />
                <Bar dataKey="amount" fill="#f97316" radius={[0, 10, 10, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">ລາຍການທຸລະກຳ</h2>
              <p className="text-sm font-medium text-slate-500">ລວມທຸກລາຍຮັບ-ລາຍຈ່າຍທີ່ຜ່ານເງື່ອນໄຂ</p>
            </div>
            <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
              {filteredRows.length.toLocaleString("en-US")} ລາຍການ
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold">ວັນທີ</th>
                  <th className="px-5 py-3 font-bold">ປະເພດ</th>
                  <th className="px-5 py-3 font-bold">ແຫຼ່ງທີ່ມາ</th>
                  <th className="px-5 py-3 font-bold">ລາຍການ</th>
                  <th className="px-5 py-3 font-bold">ອ້າງອີງ</th>
                  <th className="px-5 py-3 text-right font-bold">ຈຳນວນເງິນ</th>
                </tr>
              </thead>
              <tbody>
                {!loading && filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-14 text-center text-sm font-bold text-slate-400">
                      ບໍ່ພົບລາຍການຕາມເງື່ອນໄຂທີ່ເລືອກ
                    </td>
                  </tr>
                ) : null}

                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="px-5 py-4 font-semibold text-slate-600">{formatDateTime(row.occurredAt)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${typeBadgeClass(row.entryType)}`}>
                        {getEntryTypeLabel(row.entryType)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${sourceBadgeClass(row.source)}`}>
                        {getSourceLabel(row.source)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-black text-slate-900">{row.title}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">{row.category}</div>
                      {row.note ? <div className="mt-1 text-xs text-slate-500">note: {row.note}</div> : null}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-700">{row.referenceCode || row.orderCode || "-"}</div>
                      {row.orderCode ? <div className="mt-1 text-xs font-semibold text-slate-500">order: {row.orderCode}</div> : null}
                      {row.factoryBillCode ? <div className="text-xs font-semibold text-slate-500">bill: {row.factoryBillCode}</div> : null}
                      <div className="text-xs font-semibold text-slate-400">{getPaymentMethodLabel(row.paymentMethod)}</div>
                    </td>
                    <td className={`px-5 py-4 text-right text-base font-black ${row.entryType === "income" ? "text-emerald-700" : "text-rose-700"}`}>
                      {row.entryType === "income" ? "+" : "-"}
                      {formatMoney(row.amount).replace("₭ ", "₭ ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <ReceiptText size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">ສະຫຼຸບຕາມແຫຼ່ງທີ່ມາ</h2>
                <p className="text-sm font-medium text-slate-500">ແຍກລາຍຈ່າຍຂອງເດືອນຕາມໝວດຫຼັກຂອງຮ້ານ</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {expenseBreakdown.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-black text-slate-900">{item.label}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">{item.hint}</div>
                    </div>
                    <div className={`text-right text-lg font-black ${item.tone}`}>{formatMoney(item.value)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">{editingId ? "ແກ້ໄຂລາຍການ" : "ເພີ່ມລາຍການເອງ"}</h2>
                <p className="text-sm font-medium text-slate-500">ສ່ວນນີ້ເປີດໃຫ້ `superadmin` ຈັດການເທົ່ານັ້ນ</p>
              </div>
              <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">Manual Ledger</div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ປະເພດ</label>
                <select
                  value={form.entryType}
                  onChange={(event) => setForm((current) => ({ ...current, entryType: event.target.value as FormState["entryType"] }))}
                  disabled={!manualLedgerReady}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 disabled:bg-slate-100"
                >
                  <option value="income">ລາຍຮັບ</option>
                  <option value="expense">ລາຍຈ່າຍ</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ວັນທີ-ເວລາ</label>
                <input
                  type="datetime-local"
                  value={form.entryDate}
                  onChange={(event) => setForm((current) => ({ ...current, entryDate: event.target.value }))}
                  disabled={!manualLedgerReady}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 disabled:bg-slate-100"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ໝວດໝູ່</label>
                <input
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  placeholder="ເຊັ່ນ ຄ່າໄຟ, ຄ່າໂຄສະນາ, ລາຍຮັບອື່ນໆ"
                  disabled={!manualLedgerReady}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 disabled:bg-slate-100"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {presetCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, category }))}
                      disabled={!manualLedgerReady}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຫົວຂໍ້ລາຍການ</label>
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="ອະທິບາຍລາຍການໃຫ້ຊັດ"
                  disabled={!manualLedgerReady}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຈຳນວນເງິນ</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                  placeholder="0"
                  disabled={!manualLedgerReady}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຊ່ອງທາງຈ່າຍ/ຮັບ</label>
                <select
                  value={form.paymentMethod}
                  onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value as FormState["paymentMethod"] }))}
                  disabled={!manualLedgerReady}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 disabled:bg-slate-100"
                >
                  <option value="cash">ເງິນສົດ</option>
                  <option value="transfer">ໂອນ</option>
                  <option value="other">ອື່ນໆ</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ເລກອ້າງອີງ</label>
                <input
                  value={form.referenceCode}
                  onChange={(event) => setForm((current) => ({ ...current, referenceCode: event.target.value }))}
                  placeholder="ເລກບິນ / code / ເລກໂອນ"
                  disabled={!manualLedgerReady}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 disabled:bg-slate-100"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ໝາຍເຫດ</label>
                <textarea
                  value={form.note}
                  onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                  rows={3}
                  placeholder="ເພີ່ມລາຍລະອຽດຖ້າຈຳເປັນ"
                  disabled={!manualLedgerReady}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 disabled:bg-slate-100"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => void handleSubmit()}
                disabled={!manualLedgerReady || saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {editingId ? <PencilLine size={16} /> : <Plus size={16} />}
                {saving ? "ກຳລັງບັນທຶກ..." : editingId ? "ອັບເດດລາຍການ" : "ເພີ່ມລາຍການ"}
              </button>
              <button
                onClick={resetForm}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                ລ້າງຟອມ
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">ລາຍການເພີ່ມເອງລ່າສຸດ</h2>
                <p className="text-sm font-medium text-slate-500">ແກ້ໄຂ ຫຼື ລົບໄດ້ຈາກສ່ວນນີ້</p>
              </div>
              <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">
                {manualEntries.length} ລາຍການ
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {manualEntries.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm font-bold text-slate-400">ຍັງບໍ່ມີລາຍການທີ່ບັນທຶກເພີ່ມເອງ</div>
              ) : null}

              {manualEntries.slice(0, 8).map((entry) => (
                <div key={entry.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${
                            entry.entry_type === "income" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {entry.entry_type === "income" ? "ລາຍຮັບ" : "ລາຍຈ່າຍ"}
                        </span>
                        <span className="text-xs font-bold text-slate-400">{formatDateTime(entry.entry_date)}</span>
                      </div>
                      <div className="mt-2 font-black text-slate-900">{entry.title}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        {entry.category} {entry.reference_code ? `• ${entry.reference_code}` : ""}
                      </div>
                      {entry.note ? <div className="mt-1 text-xs text-slate-500">{entry.note}</div> : null}
                    </div>
                    <div className="text-right">
                      <div className={`text-base font-black ${entry.entry_type === "income" ? "text-emerald-700" : "text-rose-700"}`}>
                        {formatMoney(Number(entry.amount) || 0)}
                      </div>
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(entry)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <PencilLine size={15} />
                        </button>
                        <button
                          onClick={() => void handleDelete(entry)}
                          disabled={deletingId === entry.id}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
