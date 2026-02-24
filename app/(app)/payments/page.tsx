"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type OrderLedgerRow = {
  id: string;
  order_code: string;
  order_date: string;
  customer_phone: string | null;
  factory_bill_code: string | null;
  net_total: number;
  initial_deposit: number;
  balance: number;
  status: "in_progress" | "completed";
};

type PaymentTransaction = {
  id: string;
  order_id: string;
  amount: number;
  paid_at: string;
  note: string | null;
};

type PaymentFilter = "all" | "paid" | "unpaid";

export default function PaymentsPage() {
  const [rows, setRows] = useState<OrderLedgerRow[]>([]);
  const [txs, setTxs] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setErr(null);

    let q = supabase
      .from("orders")
      .select(
        "id,order_code,order_date,customer_phone,factory_bill_code,net_total,initial_deposit,balance,status"
      )
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (fromDate) q = q.gte("order_date", fromDate);
    if (toDate) q = q.lte("order_date", toDate);
    if (paymentFilter === "paid") q = q.eq("balance", 0);
    if (paymentFilter === "unpaid") q = q.gt("balance", 0);

    const s = query.trim();
    if (s) {
      const escaped = s.replace(/%/g, "\\%").replace(/_/g, "\\_");
      q = q.or(
        `order_code.ilike.%${escaped}%,factory_bill_code.ilike.%${escaped}%,customer_phone.ilike.%${escaped}%`
      );
    }

    const [{ data: orderData, error: orderError }, { data: txData, error: txError }] =
      await Promise.all([
        q,
        supabase
          .from("payment_transactions")
          .select("id,order_id,amount,paid_at,note")
          .order("paid_at", { ascending: false }),
      ]);

    if (orderError) {
      setErr(orderError.message);
      setRows([]);
      setTxs([]);
      setLoading(false);
      return;
    }

    if (txError) {
      const tableMissing = txError.message.includes(
        "Could not find the table 'public.payment_transactions'"
      );

      if (tableMissing) {
        setRows((orderData ?? []) as OrderLedgerRow[]);
        setTxs([]);
        setErr(null);
        setLoading(false);
        return;
      }

      setErr(
        `ອ່ານຂໍ້ມູນທຸລະກໍາຮັບເງິນບໍ່ໄດ້: ${txError.message} (ກວດສອບຕາຕະລາງ payment_transactions ແລະສິດເຂົ້າເຖິງ)`
      );
      setRows((orderData ?? []) as OrderLedgerRow[]);
      setTxs([]);
      setLoading(false);
      return;
    }

    setRows((orderData ?? []) as OrderLedgerRow[]);
    setTxs((txData ?? []) as PaymentTransaction[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setFromDate("");
    setToDate("");
    setPaymentFilter("all");
    setQuery("");
    setTimeout(load, 0);
  };

  const receivedByOrder = useMemo(() => {
    return txs.reduce<Record<string, number>>((acc, tx) => {
      acc[tx.order_id] = (acc[tx.order_id] || 0) + (Number(tx.amount) || 0);
      return acc;
    }, {});
  }, [txs]);

  const summary = useMemo(() => {
    const totalBilled = rows.reduce((sum, r) => sum + (Number(r.net_total) || 0), 0);
    const totalReceivedFromTx = txs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const totalReceived =
      txs.length > 0
        ? totalReceivedFromTx
        : rows.reduce((sum, r) => sum + (Number(r.initial_deposit) || 0), 0);

    const totalOutstanding = rows.reduce((sum, r) => sum + (Number(r.balance) || 0), 0);
    const paidOrders = rows.filter((r) => Number(r.balance) === 0).length;
    const inProgress = rows.filter((r) => r.status === "in_progress").length;
    const readyToClose = rows.filter((r) => r.status === "in_progress" && Number(r.balance) === 0).length;
    const collectionRate = totalBilled > 0 ? (totalReceived / totalBilled) * 100 : 0;

    return {
      totalBilled,
      totalReceived,
      totalOutstanding,
      paidOrders,
      inProgress,
      readyToClose,
      collectionRate,
      txCount: txs.length,
    };
  }, [rows, txs]);

  const formatMoney = (n: number) => n.toLocaleString();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">ບັນຊີຮັບເງິນ</h1>
          <div className="text-sm text-slate-500 font-medium">
            ສະຫຼຸບການເງິນຕາມອໍເດີ້: ຍອດທັງໝົດ / ຮັບແລ້ວ / ຄ້າງຊຳລະ
          </div>
        </div>
        <button
          onClick={load}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800"
          disabled={loading}
        >
          {loading ? "ກຳລັງໂຫຼດ..." : "ໂຫຼດຄືນ"}
        </button>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm font-bold">
          ຂໍ້ຜິດພາດ: {err}
        </div>
      )}

      {/* ส่วนที่แก้ไข: ปรับสีตัวหนังสือใน Input ให้เข้มขึ้น */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ຈາກວັນທີ</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ຫາວັນທີ</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ສະຖານະການຈ່າຍ</label>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="all">ທັງໝົດ</option>
              <option value="paid">ຈ່າຍແລ້ວ</option>
              <option value="unpaid">ຍັງຄ້າງ</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ຄົ້ນຫາ</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ລະຫັດອໍເດີ້ / ບິນໂຮງງານ / ເບີໂທ"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 w-full"
            >
              ຄົ້ນຫາ
            </button>
            <button
              onClick={reset}
              className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-200 w-full border border-slate-200"
            >
              ລ້າງ
            </button>
          </div>
        </div>
      </div>

      {/* ส่วนที่เหลือคงเดิม */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">ຍອດທັງໝົດ</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{formatMoney(summary.totalBilled)}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">ຍອດຮັບແລ້ວ</div>
          <div className="mt-2 text-2xl font-black text-emerald-600">{formatMoney(summary.totalReceived)}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">ຍອດຄ້າງ</div>
          <div className="mt-2 text-2xl font-black text-rose-600">{formatMoney(summary.totalOutstanding)}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">ອັດຕາເກັບເງິນ</div>
          <div className="mt-2 text-2xl font-black text-blue-600">{summary.collectionRate.toFixed(1)}%</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">ຈຳນວນທຸລະກໍາ</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{summary.txCount}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-sm font-bold text-slate-700">
          ອໍເດີ້ຈ່າຍຄົບ: <span className="text-emerald-600">{summary.paidOrders}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-sm font-bold text-slate-700">
          ກຳລັງຜະລິດ: <span className="text-amber-600">{summary.inProgress}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-sm font-bold text-slate-700">
          ພ້ອມປິດງານ: <span className="text-blue-600">{summary.readyToClose}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
          <div className="text-sm font-black text-slate-700 uppercase tracking-widest">ລາຍການ Ledger</div>
          <div className="text-xs text-slate-500 font-bold">{loading ? "ກຳລັງໂຫຼດ..." : `ທັງໝົດ ${rows.length} ລາຍການ`}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/60 text-slate-600 border-b border-slate-100">
              <tr>
                <th className="p-4 text-left font-bold uppercase text-[11px] tracking-wider">ວັນທີ</th>
                <th className="p-4 text-left font-bold uppercase text-[11px] tracking-wider">ລະຫັດອໍເດີ້</th>
                <th className="p-4 text-left font-bold uppercase text-[11px] tracking-wider">ເບີໂທ</th>
                <th className="p-4 text-right font-bold uppercase text-[11px] tracking-wider">ຍອດທັງໝົດ</th>
                <th className="p-4 text-right font-bold uppercase text-[11px] tracking-wider">ຮັບແລ້ວ</th>
                <th className="p-4 text-right font-bold uppercase text-[11px] tracking-wider">ຍອດຄ້າງ</th>
                <th className="p-4 text-center font-bold uppercase text-[11px] tracking-wider">ສະຖານະ</th>
                <th className="p-4 text-center font-bold uppercase text-[11px] tracking-wider">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-slate-400 font-medium" colSpan={8}>
                    ບໍ່ພົບຂໍ້ມູນ
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const txReceived = receivedByOrder[r.id];
                  const received = txReceived !== undefined ? txReceived : Number(r.initial_deposit || 0);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-4 text-slate-600 font-medium">{r.order_date}</td>
                      <td className="p-4 text-slate-900 font-black">{r.order_code}</td>
                      <td className="p-4 text-slate-600 font-bold">{r.customer_phone || "-"}</td>
                      <td className="p-4 text-right text-slate-700 font-black">{formatMoney(r.net_total)}</td>
                      <td className="p-4 text-right text-emerald-600 font-black">{formatMoney(received)}</td>
                      <td className="p-4 text-right text-rose-600 font-black">{formatMoney(r.balance)}</td>
                      <td className="p-4 text-center">
                        {r.balance === 0 ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase">
                            ຈ່າຍແລ້ວ
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black uppercase">
                            ຍັງຄ້າງ
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <Link
                          href={`/orders/${r.id}/edit`}
                          className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-black text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white transition-all"
                        >
                          ເປີດ
                        </Link>
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