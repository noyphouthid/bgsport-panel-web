"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BellRing,
  Building2,
  Factory,
  Clock3,
  FileText,
  FileSpreadsheet,
  PackageSearch,
  Phone,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { buildFactoryDesignFallbackUrl, extractProductionMockupUrls, toDisplayMediaUrl } from "@/lib/order-media";
import { getTotalShirtQty } from "@/lib/order-quantities";
import { fetchFactoryOrderStatuses, type FactoryOrderStatusResult } from "@/lib/factory-order-status";
import { fetchAllReportRows } from "@/lib/report-query";
import { supabase } from "@/lib/supabase";
import type { FactoryDepositOrderStatus } from "@/lib/factory-deposit-orders";
import { fetchOrderAlertOrdersWithClient, getOrderAlertEndDate, getOrderAlertErrorMessage, getOrderAlertToday, getOrderAlertTiming, ORDER_ALERT_UPCOMING_DAYS, type OrderAlertOrderRow } from "@/lib/order-alerts";

type DepositAlertRow = {
  id: string;
  deposit_no: string;
  order_code: string | null;
  order_id: string | null;
  factory_bill_code: string | null;
  customer_name: string;
  customer_phone: string;
  team_name: string;
  production_sent_date: string | null;
  delivery_date: string | null;
  production_priority: "normal" | "urgent" | null;
  urgent_due_date: string | null;
  production_items: unknown;
  status: FactoryDepositOrderStatus;
  created_at: string;
};

type AlertItem = DepositAlertRow & {
  dueInDays: number;
  productionDays: number;
  orderState: OrderAlertOrderRow | null;
  previewImageUrl: string | null;
};

function parseDateOnly(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(value: string | null) {
  const date = parseDateOnly(value);
  if (!date) return "-";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function dueText(days: number) {
  if (days < 0) return `ເກີນກຳນົດ ${Math.abs(days)} ມື້`;
  if (days === 0) return "ຮອດກຳນົດມື້ນີ້";
  return `ອີກ ${days} ມື້ຮອດກຳນົດ`;
}

function getPreviewImageUrl(deposit: Pick<DepositAlertRow, "production_items" | "factory_bill_code">, order: Pick<OrderAlertOrderRow, "order_image_url" | "factory_bill_code"> | null) {
  const orderImageUrl = toDisplayMediaUrl(order?.order_image_url) || null;
  if (orderImageUrl) return orderImageUrl;

  const mockupUrl = extractProductionMockupUrls(deposit.production_items)[0] || null;
  if (mockupUrl) return mockupUrl;

  return buildFactoryDesignFallbackUrl(deposit.factory_bill_code || order?.factory_bill_code || null);
}

type FactoryFilterOption = { key: string; label: string; order: number; count: number };

const FACTORY_FILTER_ALL = "all";

// Groups an order by where it is in the factory, so the list can be filtered by stage.
function getFactoryFilterGroup(code: string, result: FactoryOrderStatusResult | undefined): Omit<FactoryFilterOption, "count"> {
  if (!code) return { key: "no_code", label: "ບໍ່ມີບິນໂຮງງານ", order: 1002 };
  if (!result || result.state === "loading") return { key: "loading", label: "ກຳລັງໂຫຼດ", order: 1003 };
  if (result.state !== "ready") return { key: "unknown", label: "ບໍ່ພົບໃນໂຮງງານ", order: 1001 };
  const { data } = result;
  if (data.totalSteps > 0 && data.completedSteps >= data.totalSteps) return { key: "done", label: "ຜະລິດຄົບແລ້ວ", order: 1000 };
  const index = data.stages.findIndex((stage) => stage.current);
  if (index < 0) return { key: `status:${data.status}`, label: data.statusLabel, order: 999 };
  const stage = data.stages[index];
  return { key: `stage:${stage.code || stage.name}`, label: stage.name, order: index };
}

type DueFilter = "all" | "overdue" | "upcoming";

const FILTER_CHIP_ACTIVE_STYLES = {
  sky: { chip: "border-sky-300 bg-sky-50 text-sky-700", count: "bg-sky-100 text-sky-700" },
  rose: { chip: "border-rose-300 bg-rose-50 text-rose-700", count: "bg-rose-100 text-rose-700" },
  amber: { chip: "border-amber-300 bg-amber-50 text-amber-700", count: "bg-amber-100 text-amber-700" },
};

function FilterChip({
  label,
  count,
  active,
  tone = "sky",
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: keyof typeof FILTER_CHIP_ACTIVE_STYLES;
  onClick: () => void;
}) {
  const styles = FILTER_CHIP_ACTIVE_STYLES[tone];
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
        active ? styles.chip : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
      <span className={`rounded px-1 font-mono text-[10px] tabular-nums ${active ? styles.count : "bg-slate-100 text-slate-500"}`}>{count}</span>
    </button>
  );
}

function getFactoryCode(item: Pick<AlertItem, "factory_bill_code" | "orderState">) {
  return item.factory_bill_code?.trim() || item.orderState?.factory_bill_code?.trim() || "";
}

function formatFactoryTimestamp(value: string | null) {
  if (!value) return "";
  const [date, time] = value.split(" ");
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}${time ? ` ${time.slice(0, 5)}` : ""}` : value;
}

function FactoryStatusPanel({ code, result }: { code: string; result: FactoryOrderStatusResult | undefined }) {
  const shell = "min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2";
  const icon = <Factory size={12} className="shrink-0 text-slate-400" />;

  if (!code || !result || result.state !== "ready") {
    const message = !code
      ? "ຍັງບໍ່ມີລະຫັດບິນໂຮງງານ"
      : result?.state === "not_found"
        ? `ບໍ່ພົບບິນ ${code} ໃນລະບົບໂຮງງານ`
        : result?.state === "error"
          ? "ໂຫຼດສະຖານະໂຮງງານບໍ່ສຳເລັດ"
          : null;
    return (
      <div className={shell}>
        <div className="flex items-center gap-1.5">
          {icon}
          {message ? (
            <span className="truncate text-xs font-semibold text-slate-400">{message}</span>
          ) : (
            <div className="h-2 w-full animate-pulse rounded-full bg-slate-200" />
          )}
        </div>
      </div>
    );
  }

  const { data } = result;
  const current = data.currentStage;
  const allDone = data.totalSteps > 0 && data.completedSteps >= data.totalSteps;
  const lastDone = [...data.stages].reverse().find((stage) => stage.status === "completed");
  const stageTitle = current ? current.name : allDone ? "ຜະລິດຄົບທຸກຂັ້ນຕອນແລ້ວ" : lastDone?.name || data.statusLabel;
  const lastDoneAt = formatFactoryTimestamp(lastDone?.completedAt ?? null);

  const stepNumber = Math.min(data.completedSteps + (current ? 1 : 0), data.totalSteps);

  return (
    <div className={shell}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
          {stageTitle}
          {current ? (
            <span className="ml-1 font-semibold tabular-nums text-slate-500">
              {current.completedQuantity}/{current.assignedQuantity}
            </span>
          ) : null}
        </span>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-bold tabular-nums ${
            allDone ? "bg-emerald-50 text-emerald-600" : "bg-amber-100 text-amber-700"
          }`}
        >
          {stepNumber}/{data.totalSteps}
        </span>
      </div>
      {data.stages.length > 0 ? (
        <div className="mt-1.5 flex gap-1">
          {data.stages.map((stage, index) => {
            const done = stage.status === "completed";
            const tone = done
              ? "bg-emerald-50 text-emerald-600"
              : stage.current
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-400";
            const doneAt = formatFactoryTimestamp(stage.completedAt);
            return (
              <div
                key={`${stage.code}-${stage.name}`}
                title={`${index + 1}. ${stage.name}: ${stage.statusLabel}${doneAt ? ` (${doneAt})` : ""}`}
                className={`flex h-6 min-w-0 flex-1 items-center justify-center rounded-md text-[11px] font-bold tabular-nums ${tone}`}
              >
                {done ? "✓" : stage.current ? `• ${index + 1}` : index + 1}
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="mt-1 flex items-center gap-1 truncate text-[10px] font-semibold text-slate-400">
        {icon}
        <span className="truncate">
          {data.statusLabel}
          {lastDone && lastDoneAt ? ` · ສຳເລັດຫຼ້າສຸດ ${lastDone.name.replace(/^ກຳລັງ/, "")} ${lastDoneAt}` : ""}
        </span>
      </div>
    </div>
  );
}

/* ---------- purely presentational helper (no business logic) ---------- */
/* Normalizes a due-day count into a 0–1 ring fill for the urgency badge. */
function urgencyRingRatio(days: number) {
  const clamped = Math.max(-7, Math.min(7, days));
  return 1 - (clamped + 7) / 14;
}

function UrgencyRing({ days }: { days: number }) {
  const ringColor = days < 0 ? "#e11d48" : "#d97706";
  const trackColor = days < 0 ? "#ffe4e6" : "#fef3c7";
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const ratio = urgencyRingRatio(days);
  const offset = circumference * (1 - ratio);

  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
      <svg viewBox="0 0 64 64" className="h-12 w-12 -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke={trackColor} strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className="font-mono text-sm font-black tabular-nums text-slate-900">{Math.abs(days)}</span>
        <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
          {days < 0 ? "ເກີນ" : days === 0 ? "ມື້ນີ້" : "ອີກ"}
        </span>
      </div>
    </div>
  );
}

function NotificationSection({
  title,
  description,
  items,
  factoryStatuses,
  variant = "overdue",
}: {
  title: string;
  description: string;
  items: AlertItem[];
  factoryStatuses: ReadonlyMap<string, FactoryOrderStatusResult>;
  variant?: "overdue" | "upcoming";
}) {
  const palette = variant === "upcoming" ? {
    sectionBorder: "border-amber-100",
    headerBg: "bg-amber-50/60",
    headerRule: "bg-amber-500",
    badge: "border-amber-200 bg-white text-amber-700",
    card: "border-slate-200 bg-white hover:border-amber-200",
    accentText: "text-amber-700",
    emptyIcon: "bg-amber-50 text-amber-400",
    sectionIcon: <Clock3 size={16} className="text-amber-600" />,
    sectionLabel: "Due soon",
  } : {
    sectionBorder: "border-rose-100",
    headerBg: "bg-rose-50/60",
    headerRule: "bg-rose-500",
    badge: "border-rose-200 bg-white text-rose-700",
    card: "border-slate-200 bg-white hover:border-rose-200",
    accentText: "text-rose-700",
    emptyIcon: "bg-rose-50 text-rose-400",
    sectionIcon: <TriangleAlert size={16} className="text-rose-600" />,
    sectionLabel: "Overdue",
  };

  return (
    <section className={`overflow-hidden rounded-2xl border bg-white ${palette.sectionBorder} shadow-sm`}>
      <div className={`flex flex-col gap-3 border-b ${palette.sectionBorder} p-5 sm:flex-row sm:items-center sm:justify-between ${palette.headerBg}`}>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 h-8 w-1 rounded-full ${palette.headerRule}`} />
          <div>
            <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${palette.badge}`}>
              {palette.sectionIcon}
              {palette.sectionLabel}
            </div>
            <h2 className="mt-2 text-lg font-bold text-slate-900">{title}</h2>
            <div className="mt-0.5 max-w-3xl text-sm text-slate-500">{description}</div>
          </div>
        </div>
        <div className={`inline-flex items-center gap-2 self-start rounded-lg border px-3 py-1.5 text-sm font-bold sm:self-center ${palette.badge}`}>
          <BellRing size={14} />
          <span className="font-mono tabular-nums">{items.length}</span>
          <span className="font-medium text-slate-500">ລາຍການ</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="p-10 text-center">
          <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${palette.emptyIcon}`}>
            <PackageSearch size={20} />
          </div>
          <div className="mt-3 text-sm font-semibold text-slate-400">ບໍ່ມີລາຍການ</div>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => {
            const factoryCode = getFactoryCode(item);

            return (
              <div
                key={item.id}
                className={`grid gap-3 px-4 py-3 transition-colors lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)_auto] lg:items-center ${palette.card}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <UrgencyRing days={item.dueInDays} />

                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {item.previewImageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.previewImageUrl}
                        alt={`ຮູບອໍເດີ ${item.order_code || item.deposit_no}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-300">
                        <PackageSearch size={16} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-base font-bold tracking-tight text-slate-900">{item.order_code || "-"}</span>
                      {factoryCode ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                          <Building2 size={10} />
                          {factoryCode}
                        </span>
                      ) : null}
                      <span title="ລວມເສື້ອແຖມ" className="whitespace-nowrap rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                        {getTotalShirtQty(item.orderState).toLocaleString()} ຕົວ
                      </span>
                      {item.production_priority === "urgent" ? (
                        <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                          ດ່ວນ{item.urgent_due_date ? ` ${formatDateOnly(item.urgent_due_date)}` : ""}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-slate-700">
                      {item.customer_name || "-"}
                      {item.team_name?.trim() ? <span className="font-normal text-slate-400"> · {item.team_name}</span> : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-medium text-slate-500">
                      <span>
                        ສົ່ງຜະລິດ <span className="font-mono font-semibold text-slate-700">{formatDateOnly(item.production_sent_date)}</span>
                        <span className="text-slate-400"> ({item.productionDays} ມື້)</span>
                      </span>
                      <span>
                        ກຳນົດ <span className="font-mono font-semibold text-slate-700">{formatDateOnly(item.delivery_date)}</span>
                        <span className={`ml-1 font-bold ${palette.accentText}`}>{dueText(item.dueInDays)}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Phone size={11} />
                        <span className="font-mono">{item.customer_phone || "-"}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <FileText size={11} />
                        <span className="font-mono">{item.deposit_no}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <FactoryStatusPanel code={factoryCode} result={factoryStatuses.get(factoryCode)} />

                <div className="flex gap-1.5 lg:flex-col">
                  <Link
                    href={`/factory-deposit-orders/new?id=${item.id}`}
                    className="inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-bold text-violet-700 transition hover:bg-violet-100"
                  >
                    ໃບສັ່ງຜະລິດ
                    <ArrowUpRight size={12} />
                  </Link>
                  {item.order_id ? (
                    <Link
                      href={`/orders/${item.order_id}/edit`}
                      className="inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100"
                    >
                      ເປີດອໍເດີ
                      <ArrowUpRight size={12} />
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function OrderAlertsPage() {
  const [rows, setRows] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [factoryStatuses, setFactoryStatuses] = useState<ReadonlyMap<string, FactoryOrderStatusResult>>(new Map());
  const factoryStatusAbortRef = useRef<AbortController | null>(null);

  // Factory progress loads after the alerts so the list never waits on the factory API.
  const loadFactoryStatuses = (items: AlertItem[]) => {
    factoryStatusAbortRef.current?.abort();
    const controller = new AbortController();
    factoryStatusAbortRef.current = controller;
    const codes = [...new Set(items.map(getFactoryCode).filter(Boolean))];
    setFactoryStatuses(new Map(codes.map((code) => [code, { state: "loading" } as const])));
    fetchFactoryOrderStatuses(
      codes,
      (code, result) => setFactoryStatuses((previous) => new Map(previous).set(code, result)),
      controller.signal
    ).catch(() => {
      // Aborted by a newer reload; that run owns the state now.
    });
  };

  useEffect(() => () => factoryStatusAbortRef.current?.abort(), []);

  const loadAlerts = async () => {
    setLoading(true);
    setErr(null);

    try {
      const today = getOrderAlertToday();
      // Matching deposits exceed the API's 1000-row cap, so read every page.
      const { data: depositData, error: depositError } = await fetchAllReportRows<DepositAlertRow>((from, to) =>
        supabase
          .from("factory_deposit_orders")
          .select(
            "id,deposit_no,order_code,order_id,factory_bill_code,customer_name,customer_phone,team_name,production_sent_date,delivery_date,production_priority,urgent_due_date,production_items,status,created_at"
          )
          .eq("status", "converted")
          .not("order_id", "is", null)
          .not("production_sent_date", "is", null)
          .not("delivery_date", "is", null)
          .lte("production_sent_date", today)
          .lte("delivery_date", getOrderAlertEndDate(today))
          .order("delivery_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      );

      if (depositError) throw new Error(`ໂຫຼດໃບມັດຈຳສັ່ງຜະລິດບໍ່ສຳເລັດ: ${depositError.message}`);

      const deposits = depositData ?? [];
      const orderIds = Array.from(new Set(deposits.map((row) => row.order_id).filter((value): value is string => Boolean(value))));

      const orderData = await fetchOrderAlertOrdersWithClient(supabase, orderIds);
      const ordersById = new Map(orderData.map((row) => [row.id, row]));

      const merged = deposits
        .map((row) => {
          const orderState = row.order_id ? ordersById.get(row.order_id) || null : null;
          const timing = getOrderAlertTiming(row, orderState, today);
          if (!timing) return null;
          return {
            ...row,
            ...timing,
            orderState,
            previewImageUrl: getPreviewImageUrl(row, orderState),
          } satisfies AlertItem;
        })
        .filter((row): row is AlertItem => Boolean(row));

      setRows(merged);
      loadFactoryStatuses(merged);
    } catch (error) {
      setErr(getOrderAlertErrorMessage(error));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Load once on mount; the reload button calls loadAlerts directly.
  useEffect(() => {
    void loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overdueItems = useMemo(() => rows.filter((row) => row.dueInDays < 0).sort((a, b) => a.dueInDays - b.dueInDays), [rows]);
  const upcomingItems = useMemo(() => rows.filter((row) => row.dueInDays >= 0).sort((a, b) => a.dueInDays - b.dueInDays), [rows]);

  const [factoryFilter, setFactoryFilter] = useState(FACTORY_FILTER_ALL);
  const factoryGroupById = useMemo(() => {
    const groups = new Map<string, Omit<FactoryFilterOption, "count">>();
    for (const row of rows) {
      const code = getFactoryCode(row);
      groups.set(row.id, getFactoryFilterGroup(code, factoryStatuses.get(code)));
    }
    return groups;
  }, [rows, factoryStatuses]);
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const matchesDueFilter = (row: AlertItem) => dueFilter === "all" || (dueFilter === "overdue" ? row.dueInDays < 0 : row.dueInDays >= 0);

  // Stage chips come from every order, but their counts follow the due-date filter.
  const factoryFilterOptions = (() => {
    const options = new Map<string, FactoryFilterOption>();
    for (const row of rows) {
      const group = factoryGroupById.get(row.id);
      if (!group) continue;
      const option = options.get(group.key) ?? { ...group, count: 0 };
      if (matchesDueFilter(row)) option.count += 1;
      options.set(group.key, option);
    }
    return [...options.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  })();
  // A stage that empties after a reload falls back to showing everything.
  const activeFactoryFilter = factoryFilterOptions.some((option) => option.key === factoryFilter) ? factoryFilter : FACTORY_FILTER_ALL;
  const matchesFactoryFilter = (row: AlertItem) => activeFactoryFilter === FACTORY_FILTER_ALL || factoryGroupById.get(row.id)?.key === activeFactoryFilter;
  const factoryMatchedOverdue = overdueItems.filter(matchesFactoryFilter);
  const factoryMatchedUpcoming = upcomingItems.filter(matchesFactoryFilter);

  return (
    <div className="space-y-6 text-slate-900">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-6 text-white shadow-lg">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle, #f8fafc 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">
              <BellRing size={13} />
              ແຈ້ງເຕືອນອໍເດີ
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">ອໍເດີເກີນກຳນົດ ແລະ ໃກ້ຮອດກຳນົດສົ່ງລູກຄ້າ</h1>
            <div className="mt-2 max-w-2xl text-sm text-slate-400">
              ສະແດງສະເພາະໃບມັດຈຳສັ່ງຜະລິດທີ່ບັນທຶກເປັນອໍເດີແລ້ວ ແລະ ເກີນກຳນົດ ຫຼື ຈະຮອດກຳນົດສົ່ງລູກຄ້າພາຍໃນ {ORDER_ALERT_UPCOMING_DAYS} ມື້ (ລວມມື້ນີ້).
              ອໍເດີທີ່ຮັບເຂົ້າຈາກໂຮງງານແລ້ວ ຫຼື ຜະລິດສຳເລັດແລ້ວ ຈະບໍ່ສະແດງໃນລາຍການນີ້.
              ໃຊ້ວັນທີ່ສົ່ງຜະລິດເປັນວັນເລີ່ມນັບ ແລະ ກຳນົດສົ່ງລູກຄ້າເປັນວັນກຳນົດ.
            </div>
          </div>

          <div className="flex flex-wrap items-stretch gap-3">
            <Link
              href="/reports/order-alerts"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10"
            >
              <FileSpreadsheet size={16} />
              ລາຍງານອໍເດີ້ເກີນກຳນົດ
            </Link>
            <div className="min-w-[130px] rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-300">
                <Clock3 size={13} />
                ເກີນກຳນົດ
              </div>
              <div className="mt-1.5 font-mono text-3xl font-bold tabular-nums text-white">{overdueItems.length}</div>
            </div>
            <div className="min-w-[130px] rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-300">
                <Clock3 size={13} />
                ໃກ້ຮອດກຳນົດ ({ORDER_ALERT_UPCOMING_DAYS} ມື້)
              </div>
              <div className="mt-1.5 font-mono text-3xl font-bold tabular-nums text-white">{upcomingItems.length}</div>
            </div>
            <button
              type="button"
              onClick={() => void loadAlerts()}
              disabled={loading}
              className="inline-flex items-center gap-2 self-stretch rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              ໂຫຼດໃໝ່
            </button>
          </div>
        </div>
      </div>

      {err ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          <TriangleAlert size={16} />
          ຂໍ້ຜິດພາດ: {err}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center shadow-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
          <div className="mt-4 text-sm font-semibold text-slate-400">ກຳລັງໂຫຼດຂໍ້ມູນແຈ້ງເຕືອນ...</div>
        </div>
      ) : !err ? (
        <>
          {rows.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                  <Clock3 size={14} />
                  ກຳນົດສົ່ງ
                </span>
                <FilterChip label="ທັງໝົດ" count={factoryMatchedOverdue.length + factoryMatchedUpcoming.length} active={dueFilter === "all"} onClick={() => setDueFilter("all")} />
                <FilterChip label="ເກີນກຳນົດ" count={factoryMatchedOverdue.length} active={dueFilter === "overdue"} tone="rose" onClick={() => setDueFilter("overdue")} />
                <FilterChip
                  label={`ໃກ້ຮອດກຳນົດ (${ORDER_ALERT_UPCOMING_DAYS} ມື້)`}
                  count={factoryMatchedUpcoming.length}
                  active={dueFilter === "upcoming"}
                  tone="amber"
                  onClick={() => setDueFilter("upcoming")}
                />
              </div>
              <div className="hidden h-6 w-px bg-slate-200 sm:block" />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                  <Factory size={14} />
                  ສະຖານະໂຮງງານ
                </span>
                <FilterChip
                  label="ທັງໝົດ"
                  count={rows.filter(matchesDueFilter).length}
                  active={activeFactoryFilter === FACTORY_FILTER_ALL}
                  onClick={() => setFactoryFilter(FACTORY_FILTER_ALL)}
                />
                {factoryFilterOptions.map((option) => (
                  <FilterChip
                    key={option.key}
                    label={option.label}
                    count={option.count}
                    active={option.key === activeFactoryFilter}
                    onClick={() => setFactoryFilter(option.key)}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {dueFilter !== "upcoming" ? (
            <NotificationSection
              title="ສິນຄ້າເກີນວັນກຳນົດສົ່ງລູກຄ້າ"
              description="ໃບມັດຈຳທີ່ບັນທຶກເປັນອໍເດີແລ້ວ ແລະ ເກີນວັນກຳນົດສົ່ງລູກຄ້າ ແຕ່ຍັງບໍ່ຮັບເຂົ້າຈາກໂຮງງານ ຫຼື ຜະລິດສຳເລັດ"
              items={factoryMatchedOverdue}
              factoryStatuses={factoryStatuses}
            />
          ) : null}
          {dueFilter !== "overdue" ? (
            <NotificationSection
              title={`ອໍເດີໃກ້ຮອດກຳນົດສົ່ງລູກຄ້າ (${ORDER_ALERT_UPCOMING_DAYS} ມື້)`}
              description={`ອໍເດີທີ່ຮອດກຳນົດມື້ນີ້ ຫຼື ພາຍໃນ ${ORDER_ALERT_UPCOMING_DAYS} ມື້ຂ້າງໜ້າ ແຕ່ຍັງບໍ່ຮັບເຂົ້າຈາກໂຮງງານ ຫຼື ຜະລິດສຳເລັດ`}
              items={factoryMatchedUpcoming}
              factoryStatuses={factoryStatuses}
              variant="upcoming"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
