"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CalendarRange, RefreshCw, Search, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";

type OrderRow = {
  id: string;
  order_code: string;
  factory_bill_code: string | null;
  production_completed_at: string | null;
  short_qty: number;
  long_qty: number;
  free_qty: number;
  qty_3xl: number;
  qty_4xl: number;
  qty_5xl: number;
  factory_cost: number;
  factory_paid_full_at: string | null;
};

type FactoryPaymentRow = {
  id: string;
  order_id: string;
  amount: number;
  paid_at: string;
  note: string | null;
  batch_id: string | null;
  created_at?: string | null;
};

type CandidateRow = OrderRow & {
  total_shirts: number;
  paid_amount: number;
  outstanding_amount: number;
};

type PaymentHistoryRow = FactoryPaymentRow & {
  order_code: string;
  factory_bill_code: string | null;
};

type PaymentBatchSummary = {
  batch_id: string;
  paid_at: string;
  note: string | null;
  orders: number;
  amount: number;
};

const today = new Date().toISOString().slice(0, 10);

function toDateOnly(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function normalizeCode(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function buildPeriodTitle(start: string, end: string) {
  if (start && end) return `${start} - ${end}`;
  if (start) return `ເລີ່ມຈາກ ${start}`;
  if (end) return `ເຖິງ ${end}`;
  return "ຍັງບໍ່ໄດ້ເລືອກງວດ";
}

export default function FactoryPaymentsPage() {
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [searchCode, setSearchCode] = useState("");
  const [availableRows, setAvailableRows] = useState<CandidateRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<CandidateRow[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cancellingPaymentId, setCancellingPaymentId] = useState<string | null>(null);
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const enrichOrders = async (orders: OrderRow[]) => {
    if (orders.length === 0) return [] as CandidateRow[];

    const ids = orders.map((order) => order.id);
    const { data: paymentData, error: paymentError } = await supabase
      .from("factory_payments")
      .select("id,order_id,amount,paid_at,note,batch_id,created_at")
      .in("order_id", ids);

    if (paymentError && !paymentError.message.includes("Could not find the table")) {
      throw paymentError;
    }

    const paidByOrder = new Map<string, number>();
    ((paymentData ?? []) as FactoryPaymentRow[]).forEach((row) => {
      paidByOrder.set(row.order_id, (paidByOrder.get(row.order_id) || 0) + (Number(row.amount) || 0));
    });

    return orders
      .map((order) => {
        const totalShirts =
          (Number(order.short_qty) || 0) +
          (Number(order.long_qty) || 0) +
          (Number(order.free_qty) || 0) +
          (Number(order.qty_3xl) || 0) +
          (Number(order.qty_4xl) || 0) +
          (Number(order.qty_5xl) || 0);
        const paidAmount = paidByOrder.get(order.id) || 0;
        const outstandingAmount = Math.max(0, (Number(order.factory_cost) || 0) - paidAmount);

        return {
          ...order,
          total_shirts: totalShirts,
          paid_amount: paidAmount,
          outstanding_amount: outstandingAmount,
        } satisfies CandidateRow;
      })
      .filter((order) => order.outstanding_amount > 0)
      .sort((a, b) => {
        const aDate = a.production_completed_at || "";
        const bDate = b.production_completed_at || "";
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        return a.order_code.localeCompare(b.order_code);
      });
  };

  const refreshFactoryPaidStatus = async (orderIds: string[]) => {
    const uniqueIds = Array.from(new Set(orderIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;

    const [{ data: ordersData, error: ordersError }, { data: paymentsData, error: paymentsError }] =
      await Promise.all([
        supabase.from("orders").select("id,factory_cost").in("id", uniqueIds),
        supabase.from("factory_payments").select("order_id,amount,paid_at").in("order_id", uniqueIds),
      ]);

    if (ordersError) throw ordersError;
    if (paymentsError && !paymentsError.message.includes("Could not find the table")) {
      throw paymentsError;
    }

    const paymentRows = (paymentsData ?? []) as Array<{ order_id: string; amount: number; paid_at: string }>;
    const paymentSummary = new Map<string, { totalPaid: number; latestPaidAt: string | null }>();

    paymentRows.forEach((row) => {
      const current = paymentSummary.get(row.order_id) || { totalPaid: 0, latestPaidAt: null };
      const amount = Number(row.amount) || 0;
      const latestPaidAt =
        !current.latestPaidAt || row.paid_at > current.latestPaidAt ? row.paid_at : current.latestPaidAt;
      paymentSummary.set(row.order_id, { totalPaid: current.totalPaid + amount, latestPaidAt });
    });

    await Promise.all(
      ((ordersData ?? []) as Array<{ id: string; factory_cost: number }>).map((order) => {
        const summary = paymentSummary.get(order.id);
        const fullyPaid = (summary?.totalPaid || 0) >= (Number(order.factory_cost) || 0) && Number(order.factory_cost) > 0;
        return supabase
          .from("orders")
          .update({ factory_paid_full_at: fullyPaid ? summary?.latestPaidAt ?? new Date().toISOString() : null })
          .eq("id", order.id);
      })
    );
  };

  const loadAvailableOrders = async () => {
    setLoading(true);
    setErr(null);

    try {
      let query = supabase
        .from("orders")
        .select(
          "id,order_code,factory_bill_code,production_completed_at,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl,factory_cost,factory_paid_full_at"
        )
        .not("production_completed_at", "is", null)
        .order("production_completed_at", { ascending: true })
        .order("created_at", { ascending: true });

      if (periodStart) query = query.gte("production_completed_at", `${periodStart}T00:00:00`);
      if (periodEnd) query = query.lte("production_completed_at", `${periodEnd}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;

      const enriched = await enrichOrders((data ?? []) as OrderRow[]);
      setAvailableRows(enriched);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ";
      setErr(message);
      setAvailableRows([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPaymentHistory = async () => {
    setHistoryLoading(true);

    try {
      const { data: paymentData, error: paymentError } = await supabase
        .from("factory_payments")
        .select("id,order_id,amount,paid_at,note,batch_id,created_at")
        .order("paid_at", { ascending: false })
        .limit(200);

      if (paymentError) {
        if (paymentError.message.includes("Could not find the table")) {
          setPaymentHistory([]);
          return;
        }
        throw paymentError;
      }

      const rows = (paymentData ?? []) as FactoryPaymentRow[];
      if (rows.length === 0) {
        setPaymentHistory([]);
        return;
      }

      const orderIds = Array.from(new Set(rows.map((row) => row.order_id)));
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id,order_code,factory_bill_code")
        .in("id", orderIds);

      if (orderError) throw orderError;

      const ordersById = new Map(
        ((orderData ?? []) as Array<{ id: string; order_code: string; factory_bill_code: string | null }>).map((row) => [
          row.id,
          row,
        ])
      );

      setPaymentHistory(
        rows.map((row) => ({
          ...row,
          order_code: ordersById.get(row.order_id)?.order_code || "-",
          factory_bill_code: ordersById.get(row.order_id)?.factory_bill_code || null,
        }))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "ໂຫຼດປະຫວັດການຈ່າຍບໍ່ສຳເລັດ";
      setErr(message);
      setPaymentHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadAll = async () => {
    await Promise.all([loadAvailableOrders(), loadPaymentHistory()]);
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedIds = useMemo(() => new Set(selectedRows.map((row) => row.id)), [selectedRows]);

  const filteredAvailableRows = useMemo(() => {
    const keyword = normalizeCode(searchCode);
    if (!keyword) return availableRows;

    return availableRows.filter((row) => {
      const orderCode = normalizeCode(row.order_code);
      const factoryCode = normalizeCode(row.factory_bill_code);
      return orderCode.includes(keyword) || factoryCode.includes(keyword);
    });
  }, [availableRows, searchCode]);

  const summary = useMemo(() => {
    return selectedRows.reduce(
      (acc, row) => {
        acc.orders += 1;
        acc.shirts += row.total_shirts;
        acc.amount += row.outstanding_amount;
        return acc;
      },
      { orders: 0, shirts: 0, amount: 0 }
    );
  }, [selectedRows]);

  const paymentBatches = useMemo(() => {
    const grouped = new Map<string, PaymentBatchSummary>();

    paymentHistory.forEach((row) => {
      if (!row.batch_id) return;
      const current = grouped.get(row.batch_id) || {
        batch_id: row.batch_id,
        paid_at: row.paid_at,
        note: row.note,
        orders: 0,
        amount: 0,
      };

      current.orders += 1;
      current.amount += Number(row.amount) || 0;
      if (row.paid_at > current.paid_at) current.paid_at = row.paid_at;
      if (!current.note && row.note) current.note = row.note;
      grouped.set(row.batch_id, current);
    });

    return Array.from(grouped.values()).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  }, [paymentHistory]);

  const addToSelection = (row: CandidateRow) => {
    if (selectedIds.has(row.id)) {
      toast("ອໍເດີນີ້ຢູ່ໃນລາຍການແລ້ວ");
      return;
    }

    setSelectedRows((prev) => [...prev, row]);
    toast.success(`ເພີ່ມ ${row.order_code} ແລ້ວ`);
  };

  const removeFromSelection = (id: string) => {
    setSelectedRows((prev) => prev.filter((row) => row.id !== id));
  };

  useEffect(() => {
    const keyword = normalizeCode(searchCode);
    if (!keyword) return;

    const exactMatches = availableRows.filter((row) => {
      const orderCode = normalizeCode(row.order_code);
      const factoryCode = normalizeCode(row.factory_bill_code);
      return orderCode === keyword || factoryCode === keyword;
    });

    if (exactMatches.length !== 1) return;
    if (selectedIds.has(exactMatches[0].id)) return;

    addToSelection(exactMatches[0]);
    setSearchCode("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableRows, searchCode, selectedIds]);

  const handlePayAll = async () => {
    if (selectedRows.length === 0) {
      toast.error("ຍັງບໍ່ມີລາຍການໃຫ້ຈ່າຍ");
      return;
    }

    const confirmed = window.confirm(`ຢືນຢັນຈ່າຍຄ່າໂຮງງານ ${selectedRows.length} ລາຍການ ຫຼື ບໍ່?`);
    if (!confirmed) return;

    setPaying(true);
    setErr(null);

    try {
      const paidAt = new Date().toISOString();
      const batchId = crypto.randomUUID();
      const payload = selectedRows.map((row) => ({
        order_id: row.id,
        amount: row.outstanding_amount,
        paid_at: paidAt,
        batch_id: batchId,
        note: `ຈ່າຍຄ່າໂຮງງານແບບກຸ່ມ ${buildPeriodTitle(periodStart, periodEnd)}`,
      }));

      const { error: insertError } = await supabase.from("factory_payments").insert(payload);
      if (insertError) throw insertError;

      const completedIds = selectedRows.map((row) => row.id);
      await refreshFactoryPaidStatus(completedIds);

      toast.success(`ບັນທຶກການຈ່າຍແບບກຸ່ມແລ້ວ ${selectedRows.length} ລາຍການ`);
      setSelectedRows([]);
      setSearchCode("");
      await loadAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "ຈ່າຍທັງໝົດບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
    } finally {
      setPaying(false);
    }
  };

  const handleCancelPayment = async (payment: PaymentHistoryRow) => {
    const confirmed = window.confirm(`ຢືນຢັນຍົກເລີກການຈ່າຍຂອງ ${payment.order_code} ຈຳນວນ ${Number(payment.amount).toLocaleString()} ຫຼື ບໍ່?`);
    if (!confirmed) return;

    setCancellingPaymentId(payment.id);
    setErr(null);

    try {
      const { error } = await supabase.from("factory_payments").delete().eq("id", payment.id);
      if (error) throw error;

      await refreshFactoryPaidStatus([payment.order_id]);
      toast.success(`ຍົກເລີກການຈ່າຍຂອງ ${payment.order_code} ແລ້ວ`);
      await loadAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "ຍົກເລີກການຈ່າຍບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
    } finally {
      setCancellingPaymentId(null);
    }
  };

  const handleCancelBatch = async (batch: PaymentBatchSummary) => {
    const relatedRows = paymentHistory.filter((row) => row.batch_id === batch.batch_id);
    if (relatedRows.length === 0) {
      toast.error("ບໍ່ພົບລາຍການຈ່າຍຂອງກຸ່ມນີ້");
      return;
    }

    const confirmed = window.confirm(
      `ຢືນຢັນຍົກເລີກການຈ່າຍແບບກຸ່ມ ${relatedRows.length} ລາຍການ ລວມ ${batch.amount.toLocaleString()} ຫຼື ບໍ່?`
    );
    if (!confirmed) return;

    setCancellingBatchId(batch.batch_id);
    setErr(null);

    try {
      const { error } = await supabase.from("factory_payments").delete().eq("batch_id", batch.batch_id);
      if (error) throw error;

      await refreshFactoryPaidStatus(relatedRows.map((row) => row.order_id));
      toast.success(`ຍົກເລີກການຈ່າຍແບບກຸ່ມແລ້ວ ${relatedRows.length} ລາຍການ`);
      await loadAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "ຍົກເລີກການຈ່າຍແບບກຸ່ມບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
    } finally {
      setCancellingBatchId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-900">
            <Wallet className="text-emerald-600" size={24} />
            ຈ່າຍຄ່າໂຮງງານແບບກຸ່ມ
          </h1>
          <div className="text-sm font-medium text-slate-500">
            ຄົ້ນຫາດ້ວຍລະຫັດໂຮງງານ ຫຼື ລະຫັດອໍເດີ ເພີ່ມເຂົ້າໃບຈ່າຍອັດຕະໂນມັດ ແລະ ເບິ່ງປະຫວັດການຈ່າຍໄດ້ໃນໜ້າດຽວ
          </div>
        </div>

        <button
          type="button"
          onClick={loadAll}
          disabled={loading || historyLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading || historyLoading ? "animate-spin" : ""} />
          {loading || historyLoading ? "ກຳລັງໂຫຼດ..." : "ໂຫຼດຂໍ້ມູນໃໝ່"}
        </button>
      </div>

      {err && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">ຂໍ້ຜິດພາດ: {err}</div>}

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-700">
            <CalendarRange size={18} className="text-blue-600" />
            ງວດຈ່າຍ
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຈາກວັນທີ</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຫາວັນທີ</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={loadAvailableOrders}
                disabled={loading}
                className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "ກຳລັງໂຫຼດ..." : "ສະແດງອໍເດີໃນງວດ"}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
            ງວດທີ່ເລືອກ: {buildPeriodTitle(periodStart, periodEnd)}
          </div>

          <div className="mt-5">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              ຄົ້ນຫາລະຫັດໂຮງງານ / ລະຫັດອໍເດີ
            </label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const firstRow = filteredAvailableRows.find((row) => !selectedIds.has(row.id));
                  if (firstRow) addToSelection(firstRow);
                }}
                placeholder="ພິມ PK26-001 / PKF26-001 ຫຼື FACTORY-001"
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="mt-2 text-xs font-medium text-slate-500">
              ຖ້າລະຫັດກົງກັບອໍເດີພຽງໃບດຽວ ລະບົບຈະເພີ່ມເຂົ້າລາຍການຈ່າຍໃຫ້ທັນທີ
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div className="text-sm font-black text-slate-700">ອໍເດີທີ່ຍັງຄ້າງຈ່າຍ</div>
              <div className="text-xs font-bold text-slate-500">
                {loading ? "ກຳລັງໂຫຼດ..." : `${filteredAvailableRows.length} / ${availableRows.length} ລາຍການ`}
              </div>
            </div>

            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ອໍເດີ</th>
                    <th className="p-3 text-right text-[11px] font-black uppercase">ຈຳນວນເສື້ອ</th>
                    <th className="p-3 text-right text-[11px] font-black uppercase">ຍອດຄ້າງ</th>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ຜະລິດສຳເລັດ</th>
                    <th className="p-3 text-center text-[11px] font-black uppercase">ເພີ່ມ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {!loading && filteredAvailableRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center font-medium text-slate-400">
                        ບໍ່ພົບອໍເດີທີ່ຄ້າງຈ່າຍຕາມເງື່ອນໄຂນີ້
                      </td>
                    </tr>
                  ) : (
                    filteredAvailableRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="p-3">
                          <div className="font-black text-slate-900">{row.order_code}</div>
                          <div className="text-xs font-medium text-slate-500">{row.factory_bill_code?.trim() || "-"}</div>
                        </td>
                        <td className="p-3 text-right font-black text-slate-700">{row.total_shirts.toLocaleString()}</td>
                        <td className="p-3 text-right font-black text-rose-600">{row.outstanding_amount.toLocaleString()}</td>
                        <td className="p-3 font-medium text-slate-600">{toDateOnly(row.production_completed_at)}</td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => addToSelection(row)}
                            disabled={selectedIds.has(row.id)}
                            className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {selectedIds.has(row.id) ? "ຢູ່ໃນລາຍການ" : "ເພີ່ມ"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 text-sm font-black uppercase tracking-wider text-slate-700">ລາຍການທີ່ເລືອກ</div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ຈຳນວນອໍເດີ</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{summary.orders.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ຈຳນວນເສື້ອລວມ</div>
                <div className="mt-2 text-2xl font-black text-blue-700">{summary.shirts.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">ຍອດຈ່າຍລວມ</div>
                <div className="mt-2 text-2xl font-black text-emerald-700">{summary.amount.toLocaleString()}</div>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">ລາຍການຈ່າຍຮອບນີ້</div>

              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="p-3 text-left text-[11px] font-black uppercase">ອໍເດີ</th>
                      <th className="p-3 text-right text-[11px] font-black uppercase">ຈຳນວນເສື້ອ</th>
                      <th className="p-3 text-right text-[11px] font-black uppercase">ຈຳນວນເງິນ</th>
                      <th className="p-3 text-left text-[11px] font-black uppercase">ຜະລິດສຳເລັດ</th>
                      <th className="p-3 text-center text-[11px] font-black uppercase">ລົບ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {selectedRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-10 text-center font-medium text-slate-400">
                          ຍັງບໍ່ມີອໍເດີໃນລາຍການຈ່າຍ
                        </td>
                      </tr>
                    ) : (
                      selectedRows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/70">
                          <td className="p-3">
                            <div className="font-black text-slate-900">{row.order_code}</div>
                            <div className="text-xs font-medium text-slate-500">{row.factory_bill_code?.trim() || "-"}</div>
                          </td>
                          <td className="p-3 text-right font-black text-slate-700">{row.total_shirts.toLocaleString()}</td>
                          <td className="p-3 text-right font-black text-emerald-700">{row.outstanding_amount.toLocaleString()}</td>
                          <td className="p-3 font-medium text-slate-600">{toDateOnly(row.production_completed_at)}</td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeFromSelection(row.id)}
                              className="inline-flex items-center justify-center rounded-lg p-2 text-rose-600 transition hover:bg-rose-50"
                              aria-label={`remove ${row.order_code}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePayAll}
              disabled={paying || selectedRows.length === 0}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-base font-black text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Wallet size={18} />
              {paying ? "ກຳລັງບັນທຶກການຈ່າຍ..." : "ບັນທຶກການຈ່າຍຄ່າໂຮງງານແບບກຸ່ມ"}
            </button>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 text-sm font-black uppercase tracking-wider text-slate-700">ປະຫວັດການຈ່າຍແບບກຸ່ມ</div>

            <div className="space-y-3">
              {historyLoading && paymentBatches.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-medium text-slate-500">ກຳລັງໂຫຼດ...</div>
              ) : paymentBatches.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-medium text-slate-400">ຍັງບໍ່ມີປະຫວັດການຈ່າຍແບບກຸ່ມ</div>
              ) : (
                paymentBatches.slice(0, 12).map((batch) => (
                  <div key={batch.batch_id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-black text-slate-900">{toDateOnly(batch.paid_at)}</div>
                        <div className="mt-1 text-xs font-medium text-slate-500">{batch.note || "ຈ່າຍຄ່າໂຮງງານແບບກຸ່ມ"}</div>
                        <div className="mt-2 text-sm font-bold text-slate-700">
                          {batch.orders.toLocaleString()} ອໍເດີ / {batch.amount.toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelBatch(batch)}
                        disabled={cancellingBatchId === batch.batch_id}
                        className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        {cancellingBatchId === batch.batch_id ? "ກຳລັງຍົກເລີກ..." : "ຍົກເລີກທັງກຸ່ມ"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-black uppercase tracking-wider text-slate-700">ປະຫວັດການຈ່າຍລາຍອໍເດີ</div>
          <div className="text-xs font-bold text-slate-500">{paymentHistory.length.toLocaleString()} ລາຍການຫຼ້າສຸດ</div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3 text-left text-[11px] font-black uppercase">ອໍເດີ</th>
                  <th className="p-3 text-left text-[11px] font-black uppercase">ລະຫັດໂຮງງານ</th>
                  <th className="p-3 text-right text-[11px] font-black uppercase">ຈຳນວນເງິນ</th>
                  <th className="p-3 text-left text-[11px] font-black uppercase">ວັນທີຈ່າຍ</th>
                  <th className="p-3 text-left text-[11px] font-black uppercase">ປະເພດ</th>
                  <th className="p-3 text-center text-[11px] font-black uppercase">ຍົກເລີກ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {!historyLoading && paymentHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center font-medium text-slate-400">
                      ຍັງບໍ່ມີປະຫວັດການຈ່າຍ
                    </td>
                  </tr>
                ) : (
                  paymentHistory.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="p-3 font-black text-slate-900">{row.order_code}</td>
                      <td className="p-3 font-medium text-slate-600">{row.factory_bill_code?.trim() || "-"}</td>
                      <td className="p-3 text-right font-black text-emerald-700">{Number(row.amount).toLocaleString()}</td>
                      <td className="p-3 font-medium text-slate-600">{toDateOnly(row.paid_at)}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                            row.batch_id ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {row.batch_id ? "ກຸ່ມ" : "ດ່ຽວ"}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleCancelPayment(row)}
                          disabled={cancellingPaymentId === row.id}
                          className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-black text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                        >
                          {cancellingPaymentId === row.id ? "ກຳລັງຍົກເລີກ..." : "ຍົກເລີກ"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
