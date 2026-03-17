"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CalendarRange, Plus, RefreshCw, Search, Trash2, Wallet } from "lucide-react";
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
  order_id: string;
  amount: number;
};

type CandidateRow = OrderRow & {
  total_shirts: number;
  paid_amount: number;
  outstanding_amount: number;
};

const today = new Date().toISOString().slice(0, 10);

function toDateOnly(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function buildPeriodTitle(start: string, end: string) {
  if (start && end) return `${start} - ${end}`;
  if (start) return `ເລີ່ມຈາກ ${start}`;
  if (end) return `ເຖິງ ${end}`;
  return "ຍັງບໍ່ໄດ້ເລືອກງວດຊຳລະ";
}

export default function FactoryPaymentsPage() {
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [searchCode, setSearchCode] = useState("");
  const [availableRows, setAvailableRows] = useState<CandidateRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const enrichOrders = async (orders: OrderRow[]) => {
    if (orders.length === 0) return [] as CandidateRow[];

    const ids = orders.map((order) => order.id);
    const { data: paymentData, error: paymentError } = await supabase
      .from("factory_payments")
      .select("order_id,amount")
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
      const message = error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ";
      setErr(message);
      setAvailableRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAvailableOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedIds = useMemo(() => new Set(selectedRows.map((row) => row.id)), [selectedRows]);

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

  const addToSelection = (row: CandidateRow) => {
    if (selectedIds.has(row.id)) {
      toast("ອໍເດີນີ້ຢູ່ໃນລາຍການແລ້ວ");
      return;
    }

    setSelectedRows((prev) => [...prev, row]);
    toast.success(`ເພີ່ມ ${row.order_code} ເຂົ້າລາຍການແລ້ວ`);
  };

  const removeFromSelection = (id: string) => {
    setSelectedRows((prev) => prev.filter((row) => row.id !== id));
  };

  const handleAddByCode = async () => {
    const code = searchCode.trim();
    if (!code) {
      toast.error("ກະລຸນາປ້ອນລະຫັດອໍເດີກ່ອນ");
      return;
    }

    setAdding(true);
    setErr(null);

    try {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id,order_code,factory_bill_code,production_completed_at,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl,factory_cost,factory_paid_full_at"
        )
        .ilike("order_code", code)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error("ບໍ່ພົບລະຫັດອໍເດີນີ້");
        return;
      }

      const [row] = await enrichOrders([data as OrderRow]);
      if (!row) {
        toast.error("ອໍເດີນີ້ຊຳລະໂຮງງານຄົບແລ້ວ");
        return;
      }

      addToSelection(row);
      setSearchCode("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "ເພີ່ມອໍເດີບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
    } finally {
      setAdding(false);
    }
  };

  const handlePayAll = async () => {
    if (selectedRows.length === 0) {
      toast.error("ຍັງບໍ່ມີລາຍການໃຫ້ຊຳລະ");
      return;
    }

    const confirmed = window.confirm(`ຢືນຢັນຊຳລະທັງໝົດ ${selectedRows.length} ລາຍການ ແມ່ນບໍ?`);
    if (!confirmed) return;

    setPaying(true);
    setErr(null);

    try {
      const paidAt = new Date().toISOString();
      const payload = selectedRows.map((row) => ({
        order_id: row.id,
        amount: row.outstanding_amount,
        paid_at: paidAt,
        note: `Factory batch payment ${buildPeriodTitle(periodStart, periodEnd)}`,
      }));

      const { error: insertError } = await supabase.from("factory_payments").insert(payload);
      if (insertError) throw insertError;

      const completedIds = selectedRows.map((row) => row.id);
      const { error: updateError } = await supabase
        .from("orders")
        .update({ factory_paid_full_at: paidAt })
        .in("id", completedIds);
      if (updateError) throw updateError;

      toast.success(`ຊຳລະສຳເລັດ ${selectedRows.length} ລາຍການ`);
      setSelectedRows([]);
      await loadAvailableOrders();
    } catch (error) {
      const message = error instanceof Error ? error.message : "ຊຳລະທັງໝົດບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-900">
            <Wallet className="text-emerald-600" size={24} />
            ຊຳລະຄ່າໂຮງງານແບບກຸ່ມ
          </h1>
          <div className="text-sm font-medium text-slate-500">ເລືອກງວດຊຳລະ ຄົ້ນຫາລະຫັດອໍເດີ ເພີ່ມເຂົ້າລາຍການ ແລະກົດຊຳລະທັງໝົດໄດ້ໃນຄັ້ງດຽວ</div>
        </div>

        <button
          type="button"
          onClick={loadAvailableOrders}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {loading ? "ກຳລັງໂຫຼດ..." : "ໂຫຼດຂໍ້ມູນໃໝ່"}
        </button>
      </div>

      {err && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">ຂໍ້ຜິດພາດ: {err}</div>}

      <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-700">
            <CalendarRange size={18} className="text-blue-600" />
            ງວດຊຳລະ
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
                ສະແດງອໍເດີໃນງວດ
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
            ງວດທີ່ເລືອກ: {buildPeriodTitle(periodStart, periodEnd)}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[1fr,140px]">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຄົ້ນຫາລະຫັດອໍເດີ</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleAddByCode();
                    }
                  }}
                  placeholder="ຕົວຢ່າງ PKF26-001"
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleAddByCode}
                disabled={adding}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <Plus size={16} />
                {adding ? "ກຳລັງເພີ່ມ..." : "ເພີ່ມ"}
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div className="text-sm font-black text-slate-700">ອໍເດີທີ່ຍັງບໍ່ທັນຊຳລະໃນງວດນີ້</div>
              <div className="text-xs font-bold text-slate-500">{loading ? "ກຳລັງໂຫຼດ..." : `${availableRows.length} ລາຍການ`}</div>
            </div>

            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ລະຫັດອໍເດີ</th>
                    <th className="p-3 text-right text-[11px] font-black uppercase">ຈຳນວນເສື້ອ</th>
                    <th className="p-3 text-right text-[11px] font-black uppercase">ຍອດຄ້າງ</th>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ຜະລິດສຳເລັດ</th>
                    <th className="p-3 text-center text-[11px] font-black uppercase">ເພີ່ມ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {!loading && availableRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center font-medium text-slate-400">
                        ບໍ່ພົບອໍເດີທີ່ຍັງຄ້າງຊຳລະໃນງວດນີ້
                      </td>
                    </tr>
                  ) : (
                    availableRows.map((row) => (
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

        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 text-sm font-black uppercase tracking-wider text-slate-700">ລາຍການທີ່ເລືອກ</div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ຈຳນວນອໍເດີ</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{summary.orders.toLocaleString()}</div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ຈຳນວນເສື້ອທັງໝົດ</div>
              <div className="mt-2 text-2xl font-black text-blue-700">{summary.shirts.toLocaleString()}</div>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">ຈຳນວນເງິນທັງໝົດ</div>
              <div className="mt-2 text-2xl font-black text-emerald-700">{summary.amount.toLocaleString()}</div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">ລາຍການຊຳລະຮອບນີ້</div>

            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ລຳດັບ</th>
                    <th className="p-3 text-right text-[11px] font-black uppercase">ຈຳນວນເສື້ອ</th>
                    <th className="p-3 text-right text-[11px] font-black uppercase">ຈຳນວນເງິນ</th>
                    <th className="p-3 text-left text-[11px] font-black uppercase">ວັນທີຜະລິດສຳເລັດ</th>
                    <th className="p-3 text-center text-[11px] font-black uppercase">ລົບ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {selectedRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center font-medium text-slate-400">
                        ຍັງບໍ່ມີອໍເດີໃນລາຍການຊຳລະ
                      </td>
                    </tr>
                  ) : (
                    selectedRows.map((row, index) => (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="p-3">
                          <div className="font-black text-slate-900">{index + 1}</div>
                          <div className="text-xs font-medium text-slate-500">{row.order_code}</div>
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
                {selectedRows.length > 0 && (
                  <tfoot className="border-t border-slate-200 bg-amber-50">
                    <tr>
                      <td className="p-3 text-sm font-black text-slate-900">ລວມທັງໝົດ</td>
                      <td className="p-3 text-right text-sm font-black text-slate-900">{summary.shirts.toLocaleString()}</td>
                      <td className="p-3 text-right text-sm font-black text-emerald-700">{summary.amount.toLocaleString()}</td>
                      <td className="p-3 text-sm font-black text-slate-700" colSpan={2}>
                        {summary.orders.toLocaleString()} ລາຍການ
                      </td>
                    </tr>
                  </tfoot>
                )}
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
            {paying ? "ກຳລັງຊຳລະທັງໝົດ..." : "ຊຳລະທັງໝົດ"}
          </button>
        </section>
      </div>
    </div>
  );
}
