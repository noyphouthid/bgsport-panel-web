"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BellRing,
  Building2,
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
import { supabase } from "@/lib/supabase";
import { FACTORY_DEPOSIT_ORDER_STATUS_LABELS, FACTORY_DEPOSIT_ORDER_STATUS_STYLES, type FactoryDepositOrderStatus } from "@/lib/factory-deposit-orders";
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
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
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
        <span className="font-mono text-lg font-black tabular-nums text-slate-900">{Math.abs(days)}</span>
        <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-400">
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
  variant = "overdue",
}: {
  title: string;
  description: string;
  items: AlertItem[];
  variant?: "overdue" | "upcoming";
}) {
  const palette = variant === "upcoming" ? {
    sectionBorder: "border-amber-100",
    headerBg: "bg-amber-50/60",
    headerRule: "bg-amber-500",
    badge: "border-amber-200 bg-white text-amber-700",
    card: "border-slate-200 bg-white hover:border-amber-200",
    alert: "border-amber-200 bg-amber-50 text-amber-700",
    metric: "border-slate-100 bg-slate-50/70",
    accentText: "text-amber-700",
    accentSubtle: "text-amber-600",
    emptyIcon: "bg-amber-50 text-amber-400",
    sectionIcon: <Clock3 size={16} className="text-amber-600" />,
    sectionLabel: "Due soon",
  } : {
    sectionBorder: "border-rose-100",
    headerBg: "bg-rose-50/60",
    headerRule: "bg-rose-500",
    badge: "border-rose-200 bg-white text-rose-700",
    card: "border-slate-200 bg-white hover:border-rose-200",
    alert: "border-rose-200 bg-rose-50 text-rose-700",
    metric: "border-slate-100 bg-slate-50/70",
    accentText: "text-rose-700",
    accentSubtle: "text-rose-600",
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
            const factoryCode = item.factory_bill_code?.trim() || item.orderState?.factory_bill_code?.trim() || "";

            return (
              <div key={item.id} className={`group p-4 transition-colors sm:p-5 ${palette.card}`}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 flex-1 flex-wrap gap-4 sm:flex-nowrap">
                    <UrgencyRing days={item.dueInDays} />

                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
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
                          <PackageSearch size={20} />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${FACTORY_DEPOSIT_ORDER_STATUS_STYLES[item.status]}`}>
                          {FACTORY_DEPOSIT_ORDER_STATUS_LABELS[item.status]}
                        </span>
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${palette.alert}`}>{dueText(item.dueInDays)}</span>
                        <span
                          title="ລວມເສື້ອແຖມ"
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700"
                        >
                          ຈຳນວນເສື້ອ <span className="font-mono tabular-nums">{getTotalShirtQty(item.orderState).toLocaleString()}</span> ຕົວ
                        </span>
                        {item.production_priority === "urgent" ? (
                          <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">ດ່ວນ</span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-mono text-xl font-bold tracking-tight text-slate-900">{item.order_code || "-"}</span>
                        {factoryCode ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600">
                            <Building2 size={11} />
                            {factoryCode}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1.5 text-sm font-semibold text-slate-700">
                        {item.customer_name || "-"}
                        {item.team_name?.trim() ? <span className="font-normal text-slate-400"> · {item.team_name}</span> : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} />
                          <span className="font-mono text-slate-500">{item.customer_phone || "-"}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <FileText size={12} />
                          ໃບສັ່ງຜະລິດ <span className="font-mono text-slate-500">{item.deposit_no}</span>
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className={`rounded-lg border p-2.5 ${palette.metric}`}>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ວັນທີ່ສົ່ງຜະລິດ</div>
                          <div className="mt-1 font-mono text-xs font-bold text-slate-800">{formatDateOnly(item.production_sent_date)}</div>
                          <div className="mt-0.5 text-[10px] font-medium text-slate-500">ຜ່ານມາ {item.productionDays} ມື້</div>
                        </div>
                        <div className={`rounded-lg border p-2.5 ${palette.metric}`}>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ກຳນົດສົ່ງລູກຄ້າ</div>
                          <div className="mt-1 font-mono text-xs font-bold text-slate-800">{formatDateOnly(item.delivery_date)}</div>
                        </div>
                        <div className={`rounded-lg border p-2.5 ${palette.metric}`}>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ສະຖານະ</div>
                          <div className={`mt-1 text-xs font-bold ${palette.accentText}`}>{dueText(item.dueInDays)}</div>
                        </div>
                        <div className={`rounded-lg border p-2.5 ${palette.metric}`}>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ປະເພດວຽກ</div>
                          <div className="mt-1 text-xs font-bold text-slate-800">
                            {item.production_priority === "urgent" ? "ດ່ວນ" : "ປົກກະຕິ"}
                          </div>
                          {item.urgent_due_date ? (
                            <div className={`mt-0.5 font-mono text-[10px] font-semibold ${palette.accentSubtle}`}>{formatDateOnly(item.urgent_due_date)}</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2 xl:w-44 xl:flex-col">
                    <Link
                      href={`/factory-deposit-orders/new?id=${item.id}`}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100 xl:flex-none"
                    >
                      ໃບສັ່ງຜະລິດ
                      <ArrowUpRight size={13} />
                    </Link>
                    {item.order_id ? (
                      <Link
                        href={`/orders/${item.order_id}/edit`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 xl:flex-none"
                      >
                        ເປີດອໍເດີ
                        <ArrowUpRight size={13} />
                      </Link>
                    ) : null}
                  </div>
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

  const loadAlerts = async () => {
    setLoading(true);
    setErr(null);

    try {
      const today = getOrderAlertToday();
      const { data: depositData, error: depositError } = await supabase
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
        .order("delivery_date", { ascending: true });

      if (depositError) throw new Error(`ໂຫຼດໃບມັດຈຳສັ່ງຜະລິດບໍ່ສຳເລັດ: ${depositError.message}`);

      const deposits = (depositData ?? []) as DepositAlertRow[];
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
    } catch (error) {
      setErr(getOrderAlertErrorMessage(error));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, []);

  const overdueItems = useMemo(() => rows.filter((row) => row.dueInDays < 0).sort((a, b) => a.dueInDays - b.dueInDays), [rows]);
  const upcomingItems = useMemo(() => rows.filter((row) => row.dueInDays >= 0).sort((a, b) => a.dueInDays - b.dueInDays), [rows]);

  return (
    <div className="space-y-6 text-slate-900">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#0b1220] p-6 text-white shadow-lg">
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
          <NotificationSection
            title="ສິນຄ້າເກີນວັນກຳນົດສົ່ງລູກຄ້າ"
            description="ໃບມັດຈຳທີ່ບັນທຶກເປັນອໍເດີແລ້ວ ແລະ ເກີນວັນກຳນົດສົ່ງລູກຄ້າ ແຕ່ຍັງບໍ່ຮັບເຂົ້າຈາກໂຮງງານ ຫຼື ຜະລິດສຳເລັດ"
            items={overdueItems}
          />
          <NotificationSection
            title={`ອໍເດີໃກ້ຮອດກຳນົດສົ່ງລູກຄ້າ (${ORDER_ALERT_UPCOMING_DAYS} ມື້)`}
            description={`ອໍເດີທີ່ຮອດກຳນົດມື້ນີ້ ຫຼື ພາຍໃນ ${ORDER_ALERT_UPCOMING_DAYS} ມື້ຂ້າງໜ້າ ແຕ່ຍັງບໍ່ຮັບເຂົ້າຈາກໂຮງງານ ຫຼື ຜະລິດສຳເລັດ`}
            items={upcomingItems}
            variant="upcoming"
          />
        </>
      ) : null}
    </div>
  );
}
