"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, PackageSearch, RefreshCw, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
  production_completed_at: string | null;
  short_qty: number;
  long_qty: number;
  free_qty: number;
  factory_cost: number;
};

type BatchDetailRow = FactoryPaymentRow & {
  order_code: string;
  factory_bill_code: string | null;
  production_completed_at: string | null;
  total_shirts: number;
  factory_cost: number;
};

type FactoryPaymentBatchDetailPageProps = {
  batchId: string;
};

function toDateOnly(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return (Number(value) || 0).toLocaleString();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return fallback;
}

function getOrderTotalShirts(order: Pick<OrderRow, "short_qty" | "long_qty" | "free_qty"> | null | undefined) {
  return (Number(order?.short_qty) || 0) + (Number(order?.long_qty) || 0) + (Number(order?.free_qty) || 0);
}

export function FactoryPaymentBatchDetailPage({ batchId }: FactoryPaymentBatchDetailPageProps) {
  const [rows, setRows] = useState<BatchDetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBatch = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: paymentData, error: paymentError } = await supabase
        .from("factory_payments")
        .select("id,order_id,amount,paid_at,note,batch_id,created_at")
        .eq("batch_id", batchId)
        .order("paid_at", { ascending: false });

      if (paymentError) throw paymentError;

      const payments = (paymentData ?? []) as FactoryPaymentRow[];
      if (payments.length === 0) {
        setRows([]);
        return;
      }

      const orderIds = Array.from(new Set(payments.map((row) => row.order_id)));
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id,order_code,factory_bill_code,production_completed_at,short_qty,long_qty,free_qty,factory_cost")
        .in("id", orderIds);

      if (orderError) throw orderError;

      const orderMap = new Map(((orderData ?? []) as OrderRow[]).map((order) => [order.id, order]));

      setRows(
        payments.map((payment) => {
          const order = orderMap.get(payment.order_id);
          return {
            ...payment,
            order_code: order?.order_code || "-",
            factory_bill_code: order?.factory_bill_code || null,
            production_completed_at: order?.production_completed_at || null,
            total_shirts: getOrderTotalShirts(order),
            factory_cost: Number(order?.factory_cost) || 0,
          } satisfies BatchDetailRow;
        })
      );
    } catch (err) {
      const message = getErrorMessage(err, "ໂຫຼດລາຍລະອຽດ batch ບໍ່ສຳເລັດ");
      setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.orders += 1;
        acc.amount += Number(row.amount) || 0;
        acc.shirts += row.total_shirts;
        return acc;
      },
      { orders: 0, amount: 0, shirts: 0 }
    );
  }, [rows]);

  const latestPaidAt = rows[0]?.paid_at ?? null;
  const batchNote = rows.find((row) => row.note?.trim())?.note?.trim() || "ຈ່າຍຄ່າໂຮງງານແບບກຸ່ມ";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              href="/factory-payments"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              <ArrowLeft size={16} />
              ກັບໄປໜ້າຈ່າຍໂຮງງານ
            </Link>

            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-white">
              <Wallet size={14} />
              Batch Detail
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">ລາຍລະອຽດການຈ່າຍແບບກຸ່ມ</h1>
            <div className="mt-2 text-sm font-medium text-slate-500">Batch ID: {batchId}</div>
            <div className="mt-1 text-sm font-medium text-slate-500">{batchNote}</div>
          </div>

          <button
            type="button"
            onClick={loadBatch}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            {loading ? "ກຳລັງໂຫຼດ..." : "ໂຫຼດໃໝ່"}
          </button>
        </div>

        <div className="grid gap-3 border-t border-slate-100 bg-slate-50 p-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">ອໍເດີ້ໃນ batch</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{summary.orders.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">ຍອດຈ່າຍລວມ</div>
            <div className="mt-2 text-2xl font-black text-emerald-700">{formatMoney(summary.amount)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">ຈຳນວນເສື້ອ</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{summary.shirts.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">ຈ່າຍເມື່ອ</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{toDateOnly(latestPaidAt)}</div>
          </div>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">ຂໍ້ຜິດພາດ: {error}</div>}

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">ອໍເດີ້ທີ່ຖືກຈ່າຍໃນຮອບນີ້</div>
            <div className="mt-1 text-lg font-black text-slate-900">{rows.length.toLocaleString()} ລາຍການ</div>
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div className="py-14 text-center text-sm font-medium text-slate-500">ກຳລັງໂຫຼດລາຍລະອຽດ batch...</div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center">
            <PackageSearch className="mx-auto text-slate-300" size={42} />
            <div className="mt-4 text-lg font-black text-slate-900">ບໍ່ພົບລາຍການໃນ batch ນີ້</div>
            <div className="mt-2 text-sm font-medium text-slate-500">ອາດຈະຖືກລຶບແລ້ວ ຫຼື batch id ບໍ່ຖືກຕ້ອງ</div>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ອໍເດີ</th>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ລະຫັດໂຮງງານ</th>
                    <th className="p-3 text-right text-[11px] font-black uppercase">ຈຳນວນເສື້ອ</th>
                    <th className="p-3 text-right text-[11px] font-black uppercase">ຕົ້ນທຶນ</th>
                    <th className="p-3 text-right text-[11px] font-black uppercase">ຈ່າຍຮອບນີ້</th>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ວັນທີຈ່າຍ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="p-3">
                        <div className="font-black text-slate-900">{row.order_code}</div>
                        <div className="text-xs font-medium text-slate-500">ຜະລິດສຳເລັດ: {toDateOnly(row.production_completed_at)}</div>
                      </td>
                      <td className="p-3 font-medium text-slate-600">{row.factory_bill_code?.trim() || "-"}</td>
                      <td className="p-3 text-right font-black text-slate-700">{row.total_shirts.toLocaleString()}</td>
                      <td className="p-3 text-right font-black text-slate-700">{formatMoney(row.factory_cost)}</td>
                      <td className="p-3 text-right font-black text-emerald-700">{formatMoney(row.amount)}</td>
                      <td className="p-3 font-medium text-slate-600">{toDateOnly(row.paid_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
