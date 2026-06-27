"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BellRing, Building2, CalendarClock, Clock3, FileText, PackageSearch, Phone, RefreshCw, TriangleAlert } from "lucide-react";
import { buildFactoryDesignFallbackUrl, extractProductionMockupUrls, toDisplayMediaUrl } from "@/lib/order-media";
import { supabase } from "@/lib/supabase";
import { FACTORY_DEPOSIT_ORDER_STATUS_LABELS, FACTORY_DEPOSIT_ORDER_STATUS_STYLES, type FactoryDepositOrderStatus } from "@/lib/factory-deposit-orders";

const NEAR_DUE_DAYS = 3;

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

type OrderStateRow = {
  id: string;
  status: "in_progress" | "completed";
  closed_at: string | null;
  production_completed_at: string | null;
  shipment_status: "pending" | "shipped" | null;
  shipment_completed_at: string | null;
  order_image_url: string | null;
  factory_bill_code: string | null;
};

type AlertItem = DepositAlertRow & {
  dueInDays: number;
  orderState: OrderStateRow | null;
  previewImageUrl: string | null;
};

function parseDateOnly(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function diffDaysFromToday(value: string | null) {
  const target = parseDateOnly(value);
  if (!target) return null;
  const msPerDay = 86_400_000;
  return Math.round((target.getTime() - startOfToday().getTime()) / msPerDay);
}

function formatDateOnly(value: string | null) {
  const date = parseDateOnly(value);
  if (!date) return "-";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function dueText(days: number) {
  if (days < 0) return `ເກີນກຳນົດ ${Math.abs(days)} ມື້`;
  if (days === 0) return "ຄົບກຳນົດມື້ນີ້";
  return `ອີກ ${days} ມື້`;
}

function buildFactoryBillLink(factoryBillCode: string | null | undefined) {
  const normalized = String(factoryBillCode || "").trim();
  if (!normalized) return null;
  return `https://www.tracklifefootball.com/o/${encodeURIComponent(normalized)}`;
}

function getPreviewImageUrl(deposit: Pick<DepositAlertRow, "production_items" | "factory_bill_code">, order: Pick<OrderStateRow, "order_image_url" | "factory_bill_code"> | null) {
  const orderImageUrl = toDisplayMediaUrl(order?.order_image_url) || null;
  if (orderImageUrl) return orderImageUrl;

  const mockupUrl = extractProductionMockupUrls(deposit.production_items)[0] || null;
  if (mockupUrl) return mockupUrl;

  return buildFactoryDesignFallbackUrl(deposit.factory_bill_code || order?.factory_bill_code || null);
}

function isOrderStillOpen(order: OrderStateRow | null) {
  if (!order) return true;
  if (order.status === "completed" || order.closed_at) return false;
  if (order.production_completed_at) return false;
  if (order.shipment_status === "shipped" || order.shipment_completed_at) return false;
  return true;
}

function NotificationSection({
  title,
  description,
  items,
  tone,
}: {
  title: string;
  description: string;
  items: AlertItem[];
  tone: "amber" | "rose";
}) {
  const palette =
    tone === "rose"
      ? {
          sectionBorder: "border-rose-200/80",
          sectionGlow: "shadow-[0_20px_55px_rgba(190,24,93,.10)]",
          headerBg: "bg-[linear-gradient(135deg,#fff1f5_0%,#ffffff_54%,#ffe4e6_100%)]",
          badge: "border-rose-200 bg-rose-50 text-rose-700",
          card: "border-rose-100 bg-[linear-gradient(180deg,#ffffff_0%,#fff6f7_100%)]",
          rail: "bg-rose-400",
          alert: "border-rose-200 bg-rose-50 text-rose-700",
          metric: "border-rose-100 bg-white/80",
          accentText: "text-rose-700",
          accentSubtle: "text-rose-600",
          emptyIcon: "bg-rose-100 text-rose-500",
          sectionIcon: <TriangleAlert size={16} />,
          sectionLabel: "Overdue",
        }
      : {
          sectionBorder: "border-amber-200/80",
          sectionGlow: "shadow-[0_20px_55px_rgba(217,119,6,.10)]",
          headerBg: "bg-[linear-gradient(135deg,#fff8eb_0%,#ffffff_54%,#fef3c7_100%)]",
          badge: "border-amber-200 bg-amber-50 text-amber-700",
          card: "border-amber-100 bg-[linear-gradient(180deg,#ffffff_0%,#fffaf0_100%)]",
          rail: "bg-amber-400",
          alert: "border-amber-200 bg-amber-50 text-amber-700",
          metric: "border-amber-100 bg-white/80",
          accentText: "text-amber-700",
          accentSubtle: "text-amber-600",
          emptyIcon: "bg-amber-100 text-amber-500",
          sectionIcon: <CalendarClock size={16} />,
          sectionLabel: "Near Due",
        };

  return (
    <section className={`overflow-hidden rounded-[30px] border bg-white ${palette.sectionBorder} ${palette.sectionGlow}`}>
      <div className={`flex flex-col gap-3 border-b border-white/70 p-5 sm:flex-row sm:items-start sm:justify-between ${palette.headerBg}`}>
        <div>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${palette.badge}`}>
            {palette.sectionIcon}
            {palette.sectionLabel}
          </div>
          <div className="mt-3 text-lg font-black text-slate-900">{title}</div>
          <div className="mt-1 max-w-3xl text-sm font-medium text-slate-500">{description}</div>
        </div>
        <div className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-2 text-xs font-black ${palette.badge}`}>
          <BellRing size={14} />
          {items.length} ລາຍການ
        </div>
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center">
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${palette.emptyIcon}`}>
            <PackageSearch size={24} />
          </div>
          <div className="mt-4 text-sm font-bold text-slate-500">ບໍ່ມີລາຍການ</div>
        </div>
      ) : (
        <div className="space-y-4 p-4 sm:p-5">
          {items.map((item) => (
            <div key={item.id} className={`relative overflow-hidden rounded-[26px] border p-4 sm:p-5 ${palette.card}`}>
              {(() => {
                const factoryCode = item.factory_bill_code?.trim() || item.orderState?.factory_bill_code?.trim() || "";
                const factoryBillLink = buildFactoryBillLink(factoryCode);
                return (
                  <>
              <div className={`absolute inset-y-0 left-0 w-1.5 ${palette.rail}`} />
              <div className="flex flex-col gap-4 pl-2 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start">
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[22px] border border-white/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,.08)]">
                      {item.previewImageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.previewImageUrl}
                          alt={`ຮູບອໍເດີ ${item.order_code || item.deposit_no}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                          <PackageSearch size={24} />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-[11px] font-black ${FACTORY_DEPOSIT_ORDER_STATUS_STYLES[item.status]}`}>
                          {FACTORY_DEPOSIT_ORDER_STATUS_LABELS[item.status]}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${palette.alert}`}>{dueText(item.dueInDays)}</span>
                        {item.production_priority === "urgent" ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-black text-rose-700">ດ່ວນ</span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Order Code</div>
                          <div className="truncate text-2xl font-black tracking-tight text-slate-900">{item.order_code || "-"}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Factory Code</div>
                          <div className="mt-1 text-sm font-black text-slate-900">
                            {factoryCode || "-"}
                          </div>
                          {factoryBillLink ? (
                            <a
                              href={factoryBillLink}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 transition hover:bg-sky-100"
                            >
                              ເປີດບິນໂຮງງານ
                            </a>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 text-sm font-bold text-slate-700">
                        {item.customer_name || "-"} {item.team_name?.trim() ? `• ${item.team_name}` : ""}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <Phone size={13} />
                          {item.customer_phone || "-"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <FileText size={13} />
                          ໃບສັ່ງຜະລິດ: {item.deposit_no}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 size={13} />
                          ໂຮງງານ: {factoryCode || "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className={`rounded-[20px] border p-3 ${palette.metric}`}>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">ວັນທີ່ສົ່ງຜະລິດ</div>
                      <div className="mt-2 text-sm font-black text-slate-900">{formatDateOnly(item.production_sent_date)}</div>
                    </div>
                    <div className={`rounded-[20px] border p-3 ${palette.metric}`}>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">ກຳນົດສົ່ງລູກຄ້າ</div>
                      <div className="mt-2 text-sm font-black text-slate-900">{formatDateOnly(item.delivery_date)}</div>
                    </div>
                    <div className={`rounded-[20px] border p-3 ${palette.metric}`}>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">ສະຖານະແຈ້ງເຕືອນ</div>
                      <div className={`mt-2 text-sm font-black ${palette.accentText}`}>{dueText(item.dueInDays)}</div>
                    </div>
                    <div className={`rounded-[20px] border p-3 ${palette.metric}`}>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">ປະເພດວຽກ</div>
                      <div className="mt-2 text-sm font-black text-slate-900">
                        {item.production_priority === "urgent" ? "ວຽກດ່ວນ" : "ວຽກປົກກະຕິ"}
                      </div>
                      <div className={`mt-1 text-xs font-semibold ${palette.accentSubtle}`}>
                        {item.urgent_due_date ? `urgent due ${formatDateOnly(item.urgent_due_date)}` : "ບໍ່ມີ urgent due date"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 xl:w-[210px] xl:flex-col xl:items-stretch">
                  <Link
                    href={`/factory-deposit-orders/new?id=${item.id}`}
                    className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-100"
                  >
                    ເບິ່ງໃບສັ່ງຜະລິດ
                  </Link>
                  {item.order_id ? (
                    <Link
                      href={`/orders/${item.order_id}/edit`}
                      className="inline-flex items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100"
                    >
                      ເປີດອໍເດີ
                    </Link>
                  ) : null}
                </div>
              </div>
                  </>
                );
              })()}
            </div>
          ))}
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
      const { data: depositData, error: depositError } = await supabase
        .from("factory_deposit_orders")
        .select(
          "id,deposit_no,order_code,order_id,factory_bill_code,customer_name,customer_phone,team_name,production_sent_date,delivery_date,production_priority,urgent_due_date,production_items,status,created_at"
        )
        .not("order_id", "is", null)
        .not("delivery_date", "is", null)
        .order("delivery_date", { ascending: true });

      if (depositError) throw depositError;

      const deposits = (depositData ?? []) as DepositAlertRow[];
      const orderIds = Array.from(new Set(deposits.map((row) => row.order_id).filter((value): value is string => Boolean(value))));

      const ordersById = new Map<string, OrderStateRow>();
      const receivedOrderIds = new Set<string>();
      if (orderIds.length > 0) {
        const [{ data: orderData, error: orderError }, { data: receiptData, error: receiptError }] = await Promise.all([
          supabase
            .from("orders")
            .select("id,status,closed_at,production_completed_at,shipment_status,shipment_completed_at,order_image_url,factory_bill_code")
            .in("id", orderIds),
          supabase.from("factory_receipt_items").select("order_id").in("order_id", orderIds),
        ]);

        if (orderError) throw orderError;
        if (receiptError) throw receiptError;

        for (const row of (orderData ?? []) as OrderStateRow[]) {
          ordersById.set(row.id, row);
        }

        for (const row of (receiptData ?? []) as Array<{ order_id: string }>) {
          if (row.order_id) receivedOrderIds.add(row.order_id);
        }
      }

      const merged = deposits
        .map((row) => {
          const dueInDays = diffDaysFromToday(row.delivery_date);
          if (dueInDays === null) return null;
          const orderState = row.order_id ? ordersById.get(row.order_id) || null : null;
          return {
            ...row,
            dueInDays,
            orderState,
            previewImageUrl: getPreviewImageUrl(row, orderState),
          } satisfies AlertItem;
        })
        .filter((row): row is AlertItem => Boolean(row))
        .filter((row) => !row.order_id || !receivedOrderIds.has(row.order_id))
        .filter((row) => isOrderStillOpen(row.orderState));

      setRows(merged);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, []);

  const overdueItems = useMemo(() => rows.filter((row) => row.dueInDays < 0).sort((a, b) => a.dueInDays - b.dueInDays), [rows]);
  const nearDueItems = useMemo(
    () => rows.filter((row) => row.dueInDays >= 0 && row.dueInDays <= NEAR_DUE_DAYS).sort((a, b) => a.dueInDays - b.dueInDays),
    [rows]
  );

  return (
    <div className="space-y-6 text-slate-900">
      <div className="overflow-hidden rounded-[32px] border border-[#d8dfeb] bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_45%,#d97706_120%)] p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,.20)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-black text-white/90 backdrop-blur">
              <BellRing size={14} />
              ແຈ້ງເຕືອນອໍເດີ
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white">ອໍເດີໃກ້ກຳນົດສົ່ງ / ເກີນກຳນົດ</h1>
            <div className="mt-2 max-w-3xl text-sm font-medium text-slate-200">
              ດຶງຂໍ້ມູນຈາກໃບສັ່ງຜະລິດທີ່ບັນທຶກເປັນອໍເດີແລ້ວ ໂດຍໃຊ້ `ວັນທີ່ສົ່ງຜະລິດ` ແລະ `ກຳນົດສົ່ງລູກຄ້າ`
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-[138px] rounded-[24px] border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-rose-200">
                <Clock3 size={14} />
                ເກີນກຳນົດ
              </div>
              <div className="mt-2 text-3xl font-black text-white">{overdueItems.length}</div>
            </div>
            <div className="min-w-[138px] rounded-[24px] border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-100">
                <CalendarClock size={14} />
                ໃກ້ກຳນົດ {NEAR_DUE_DAYS} ມື້
              </div>
              <div className="mt-2 text-3xl font-black text-white">{nearDueItems.length}</div>
            </div>
            <button
              type="button"
              onClick={() => void loadAlerts()}
              className="inline-flex items-center gap-2 rounded-[24px] border border-white/20 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15"
            >
              <RefreshCw size={16} />
              ໂຫຼດໃໝ່
            </button>
          </div>
        </div>
      </div>

      {err ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

      {loading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-400 shadow-sm">
          ກຳລັງໂຫຼດຂໍ້ມູນແຈ້ງເຕືອນ...
        </div>
      ) : (
        <>
          <NotificationSection
            title="ສິນຄ້າເກີນວັນກຳນົດສົ່ງລູກຄ້າ"
            description="ລາຍການທີ່ວັນກຳນົດສົ່ງລູກຄ້າຜ່ານມາແລ້ວ ແຕ່ອໍເດີຍັງບໍ່ປິດ ແລະ ຍັງບໍ່ຈັດສົ່ງ"
            items={overdueItems}
            tone="rose"
          />

          <NotificationSection
            title="ອໍເດີໃກ້ກຳນົດສົ່ງລູກຄ້າ"
            description={`ລາຍການທີ່ຈະຄົບກຳນົດສົ່ງພາຍໃນ ${NEAR_DUE_DAYS} ມື້ ແລະ ຍັງບໍ່ຈັດສົ່ງ`}
            items={nearDueItems}
            tone="amber"
          />

          {overdueItems.length === 0 && nearDueItems.length === 0 ? (
            <div className="rounded-[28px] border border-slate-100 bg-white p-10 text-center text-sm font-medium text-slate-400 shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <PackageSearch size={24} />
              </div>
              <div className="mt-4 font-black text-slate-500">ບໍ່ມີອໍເດີແຈ້ງເຕືອນໃນຕອນນີ້</div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
