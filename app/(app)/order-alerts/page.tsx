"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarClock, Clock3, PackageSearch } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { FACTORY_DEPOSIT_ORDER_STATUS_LABELS, FACTORY_DEPOSIT_ORDER_STATUS_STYLES, type FactoryDepositOrderStatus } from "@/lib/factory-deposit-orders";

const NEAR_DUE_DAYS = 3;

type DepositAlertRow = {
  id: string;
  deposit_no: string;
  order_code: string | null;
  order_id: string | null;
  customer_name: string;
  customer_phone: string;
  team_name: string;
  production_sent_date: string | null;
  delivery_date: string | null;
  production_priority: "normal" | "urgent" | null;
  urgent_due_date: string | null;
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
};

type AlertItem = DepositAlertRow & {
  dueInDays: number;
  orderState: OrderStateRow | null;
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
  const toneClass =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-4">
        <div>
          <div className="text-sm font-black text-slate-900">{title}</div>
          <div className="mt-1 text-xs font-medium text-slate-500">{description}</div>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-black ${toneClass}`}>{items.length} ລາຍການ</div>
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center text-sm font-medium text-slate-400">ບໍ່ມີລາຍການ</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div key={item.id} className="p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-black text-slate-900">{item.order_code || "-"}</div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-black ${FACTORY_DEPOSIT_ORDER_STATUS_STYLES[item.status]}`}>
                      {FACTORY_DEPOSIT_ORDER_STATUS_LABELS[item.status]}
                    </span>
                    {item.production_priority === "urgent" ? (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-black text-rose-700">ດ່ວນ</span>
                    ) : null}
                  </div>

                  <div className="mt-2 text-sm font-bold text-slate-700">
                    {item.customer_name || "-"} {item.team_name?.trim() ? `• ${item.team_name}` : ""}
                  </div>
                  <div className="mt-1 text-xs font-medium text-slate-500">
                    ເບີໂທ: {item.customer_phone || "-"} • ໃບສັ່ງຜະລິດ: {item.deposit_no}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">ວັນທີ່ສົ່ງຜະລິດ</div>
                      <div className="mt-1 text-sm font-black text-slate-900">{formatDateOnly(item.production_sent_date)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">ກຳນົດສົ່ງລູກຄ້າ</div>
                      <div className="mt-1 text-sm font-black text-slate-900">{formatDateOnly(item.delivery_date)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">ສະຖານະແຈ້ງເຕືອນ</div>
                      <div className={`mt-1 text-sm font-black ${tone === "rose" ? "text-rose-700" : "text-amber-700"}`}>{dueText(item.dueInDays)}</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Link
                    href={`/factory-deposit-orders/new?id=${item.id}`}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-100"
                  >
                    ເບິ່ງໃບສັ່ງຜະລິດ
                  </Link>
                  {item.order_id ? (
                    <Link
                      href={`/orders/${item.order_id}/edit`}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-100"
                    >
                      ເປີດອໍເດີ
                    </Link>
                  ) : null}
                </div>
              </div>
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
          "id,deposit_no,order_code,order_id,customer_name,customer_phone,team_name,production_sent_date,delivery_date,production_priority,urgent_due_date,status,created_at"
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
          supabase.from("orders").select("id,status,closed_at,production_completed_at,shipment_status,shipment_completed_at").in("id", orderIds),
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
          return {
            ...row,
            dueInDays,
            orderState: row.order_id ? ordersById.get(row.order_id) || null : null,
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
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
            <BellRing size={14} />
            ແຈ້ງເຕືອນອໍເດີ
          </div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">ອໍເດີໃກ້ກຳນົດສົ່ງ / ເກີນກຳນົດ</h1>
          <div className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
            ດຶງຂໍ້ມູນຈາກໃບສັ່ງຜະລິດທີ່ບັນທຶກເປັນອໍເດີແລ້ວ ໂດຍໃຊ້ `ວັນທີ່ສົ່ງຜະລິດ` ແລະ `ກຳນົດສົ່ງລູກຄ້າ`
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="rounded-2xl bg-rose-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-rose-600">
              <Clock3 size={14} />
              ເກີນກຳນົດ
            </div>
            <div className="mt-1 text-2xl font-black text-rose-700">{overdueItems.length}</div>
          </div>
          <div className="rounded-2xl bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-600">
              <CalendarClock size={14} />
              ໃກ້ກຳນົດ {NEAR_DUE_DAYS} ມື້
            </div>
            <div className="mt-1 text-2xl font-black text-amber-700">{nearDueItems.length}</div>
          </div>
          <button
            type="button"
            onClick={() => void loadAlerts()}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            ໂຫຼດໃໝ່
          </button>
        </div>
      </div>

      {err ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm font-bold text-slate-400">ກຳລັງໂຫຼດຂໍ້ມູນແຈ້ງເຕືອນ...</div>
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
            <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm font-medium text-slate-400">
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
