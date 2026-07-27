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
  design_deposit: number;
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

type LedgerPoint = {
  key: string;
  label: string;
  billed: number;
  received: number;
};

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDateLao(dateStr: string) {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

// จัดกลุ่มรายการ ledger เป็นช่วงเวลา (วัน/สัปดาห์/เดือน) ตามความยาวของช่วงข้อมูลที่มีอยู่จริง
// ใช้ rows ที่โหลดมาแล้วเท่านั้น ไม่มีการยิง query เพิ่ม
function buildLedgerSeries(
  rows: OrderLedgerRow[],
  receivedByRowId: Record<string, number>
): LedgerPoint[] {
  if (rows.length === 0) return [];

  const dates = rows.map((r) => r.order_date).filter(Boolean).sort();
  const start = new Date(dates[0]);
  const end = new Date(dates[dates.length - 1]);
  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  const bucketOf = (dateStr: string): { key: string; label: string } => {
    const d = new Date(dateStr);
    if (spanDays <= 31) {
      const key = toDateInputValue(d);
      return { key, label: formatShortDateLao(key) };
    }
    if (spanDays <= 180) {
      const weekStart = new Date(d);
      const weekday = (weekStart.getDay() + 6) % 7;
      weekStart.setDate(weekStart.getDate() - weekday);
      const key = toDateInputValue(weekStart);
      return { key, label: formatShortDateLao(key) };
    }
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` };
  };

  const buckets = new Map<string, LedgerPoint>();
  rows.forEach((row) => {
    if (!row.order_date) return;
    const { key, label } = bucketOf(row.order_date);
    const billed = Number(row.net_total) || 0;
    const received = receivedByRowId[row.id] || 0;
    const existing = buckets.get(key);
    if (existing) {
      existing.billed += billed;
      existing.received += received;
    } else {
      buckets.set(key, { key, label, billed, received });
    }
  });

  return Array.from(buckets.values()).sort((a, b) => (a.key > b.key ? 1 : -1));
}

function buildLinePath(
  points: LedgerPoint[],
  accessor: (p: LedgerPoint) => number,
  width: number,
  height: number,
  maxValue: number
) {
  if (points.length === 0) return "";
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  return points
    .map((p, i) => {
      const x = points.length > 1 ? i * stepX : width / 2;
      const value = maxValue > 0 ? accessor(p) / maxValue : 0;
      const y = height - value * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

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
        "id,order_code,order_date,customer_phone,factory_bill_code,net_total,design_deposit,initial_deposit,balance,status"
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
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const baseReceivedByOrder = useMemo(() => {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.id] = (Number(row.design_deposit) || 0) + (Number(row.initial_deposit) || 0);
      return acc;
    }, {});
  }, [rows]);

  const totalReceivedByOrder = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((row) => {
      map[row.id] = (baseReceivedByOrder[row.id] || 0) + (receivedByOrder[row.id] || 0);
    });
    return map;
  }, [rows, baseReceivedByOrder, receivedByOrder]);

  const summary = useMemo(() => {
    const totalBilled = rows.reduce((sum, r) => sum + (Number(r.net_total) || 0), 0);
    const totalReceived = rows.reduce((sum, row) => {
      const baseReceived = baseReceivedByOrder[row.id] || 0;
      const txReceived = receivedByOrder[row.id] || 0;
      return sum + baseReceived + txReceived;
    }, 0);

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
  }, [baseReceivedByOrder, receivedByOrder, rows, txs.length]);

  // ---- ชุดข้อมูลกราฟแนวโน้ม (คำนวณจาก rows/receivedByOrder ที่มีอยู่แล้ว ไม่มี query เพิ่ม) ----
  const ledgerSeries = useMemo(
    () => buildLedgerSeries(rows, totalReceivedByOrder),
    [rows, totalReceivedByOrder]
  );

  const seriesMax = Math.max(1, ...ledgerSeries.map((p) => Math.max(p.billed, p.received)));
  const chartWidth = 720;
  const chartHeight = 190;
  const billedPath = buildLinePath(ledgerSeries, (p) => p.billed, chartWidth, chartHeight, seriesMax);
  const receivedPath = buildLinePath(ledgerSeries, (p) => p.received, chartWidth, chartHeight, seriesMax);
  const billedAreaPath = ledgerSeries.length > 0 ? `${billedPath} L${chartWidth},${chartHeight} L0,${chartHeight} Z` : "";

  const outstandingPct = summary.totalBilled > 0 ? (summary.totalOutstanding / summary.totalBilled) * 100 : 0;

  const formatMoney = (n: number) => n.toLocaleString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold text-slate-900 tracking-tight">ບັນຊີຮັບເງິນ</h1>
          <div className="text-sm text-slate-400 font-medium">
            ສະຫຼຸບການເງິນຕາມອໍເດີ້: ຍອດທັງໝົດ / ຮັບແລ້ວ / ຄ້າງຊຳລະ
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold hover:bg-slate-800 transition-all active:scale-95 shadow-md shadow-slate-200"
          disabled={loading}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={loading ? "animate-spin" : ""}>
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
          {loading ? "ກຳລັງໂຫຼດ..." : "ໂຫຼດຄືນ"}
        </button>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl text-sm font-semibold flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          ຂໍ້ຜິດພາດ: {err}
        </div>
      )}

      {/* Filter card */}
      <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <div>
            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">ຈາກວັນທີ</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full border border-slate-100 bg-slate-50 rounded-full px-3.5 py-2 text-sm text-slate-700 font-semibold focus:ring-2 focus:ring-[#2563EB]/40 outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">ຫາວັນທີ</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full border border-slate-100 bg-slate-50 rounded-full px-3.5 py-2 text-sm text-slate-700 font-semibold focus:ring-2 focus:ring-[#2563EB]/40 outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">ສະຖານະການຈ່າຍ</label>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
              className="w-full border border-slate-100 bg-slate-50 rounded-full px-3.5 py-2 text-sm text-slate-700 font-semibold focus:ring-2 focus:ring-[#2563EB]/40 outline-none"
            >
              <option value="all">ທັງໝົດ</option>
              <option value="paid">ຈ່າຍແລ້ວ</option>
              <option value="unpaid">ຍັງຄ້າງ</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">ຄົ້ນຫາ</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ລະຫັດອໍເດີ້ / ບິນໂຮງງານ / ເບີໂທ"
              className="w-full border border-slate-100 bg-slate-50 rounded-full px-3.5 py-2 text-sm text-slate-700 font-semibold focus:ring-2 focus:ring-[#2563EB]/40 outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="bg-[#2563EB] text-white px-4 py-2 rounded-full text-sm font-bold hover:bg-[#1D4ED8] w-full transition-all active:scale-95 shadow-sm"
            >
              ຄົ້ນຫາ
            </button>
            <button
              onClick={reset}
              className="bg-slate-100 text-slate-500 px-4 py-2 rounded-full text-sm font-bold hover:bg-slate-100 w-full transition-all"
            >
              ລ້າງ
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
          <div className="w-11 h-11 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-500 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="3" /><path d="M2 9h20" /></svg>
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">ຍອດທັງໝົດ</div>
          <div className="text-[22px] font-extrabold text-slate-900">{loading ? "..." : formatMoney(summary.totalBilled)}</div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
          <div className="w-11 h-11 bg-[#22C55E]/12 rounded-2xl flex items-center justify-center text-[#22C55E] mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">ຍອດຮັບແລ້ວ</div>
          <div className="text-[22px] font-extrabold text-[#22C55E]">{loading ? "..." : formatMoney(summary.totalReceived)}</div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
          <div className="w-11 h-11 bg-[#DC2626]/12 rounded-2xl flex items-center justify-center text-[#DC2626] mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">ຍອດຄ້າງ</div>
          <div className="text-[22px] font-extrabold text-[#DC2626]">{loading ? "..." : formatMoney(summary.totalOutstanding)}</div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
          <div className="w-11 h-11 bg-[#3B82F6]/12 rounded-2xl flex items-center justify-center text-[#3B82F6] mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">ອັດຕາເກັບເງິນ</div>
          <div className="text-[22px] font-extrabold text-[#3B82F6]">{loading ? "..." : `${summary.collectionRate.toFixed(1)}%`}</div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
          <div className="w-11 h-11 bg-[#6366F1]/12 rounded-2xl flex items-center justify-center text-[#6366F1] mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">ຈຳນວນທຸລະກໍາ</div>
          <div className="text-[22px] font-extrabold text-slate-900">{loading ? "..." : summary.txCount}</div>
        </div>
      </div>

      {/* Status pills */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400">ອໍເດີ້ຈ່າຍຄົບ</span>
          <span className="text-sm font-extrabold text-[#22C55E]">{summary.paidOrders}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400">ກຳລັງຜະລິດ</span>
          <span className="text-sm font-extrabold text-[#F59E0B]">{summary.inProgress}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400">ພ້ອມປິດງານ</span>
          <span className="text-sm font-extrabold text-[#3B82F6]">{summary.readyToClose}</span>
        </div>
      </div>

      {/* กราฟแนวโน้มยอดรับเงิน + สัดส่วนเก็บเงิน */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h2 className="text-sm font-extrabold text-slate-800">ແນວໂນ້ມການຮັບເງິນ</h2>
            <div className="flex items-center gap-4 text-[11px] font-bold text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#94A3B8]"></span>ຍອດອອກບິນ</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]"></span>ຍອດຮັບແລ້ວ</span>
            </div>
          </div>

          {loading ? (
            <div className="h-[190px] flex items-center justify-center text-slate-400 font-bold text-sm">ກຳລັງໂຫຼດ...</div>
          ) : ledgerSeries.length === 0 ? (
            <div className="h-[190px] flex items-center justify-center text-slate-400 font-bold text-sm">ບໍ່ມີຂໍ້ມູນ</div>
          ) : (
            <>
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-[190px]" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="billedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94A3B8" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#94A3B8" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75].map((f) => (
                  <line key={f} x1="0" x2={chartWidth} y1={chartHeight * f} y2={chartHeight * f} stroke="#F1F5F9" strokeWidth="1" />
                ))}
                <path d={billedAreaPath} fill="url(#billedFill)" stroke="none" />
                <path d={billedPath} fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 5" />
                <path d={receivedPath} fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex justify-between mt-2 text-[11px] font-bold text-slate-400">
                <span>{ledgerSeries[0]?.label}</span>
                {ledgerSeries.length > 2 && <span>{ledgerSeries[Math.floor(ledgerSeries.length / 2)]?.label}</span>}
                <span>{ledgerSeries[ledgerSeries.length - 1]?.label}</span>
              </div>
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
          <h2 className="text-sm font-extrabold text-slate-800 mb-6">ສັດສ່ວນເກັບເງິນ</h2>
          <div className="flex flex-col items-center">
            <div
              className="relative w-36 h-36 rounded-full flex items-center justify-center"
              style={{
                background: `conic-gradient(#22C55E 0% ${summary.collectionRate}%, #DC2626 ${summary.collectionRate}% 100%)`,
              }}
            >
              <div className="absolute w-24 h-24 bg-white rounded-full flex flex-col items-center justify-center">
                <div className="text-xl font-extrabold text-slate-900">{loading ? "..." : `${summary.collectionRate.toFixed(0)}%`}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">ເກັບແລ້ວ</div>
              </div>
            </div>
            <div className="w-full mt-6 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-2 text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]"></span>ຮັບແລ້ວ</span>
                <span className="text-slate-800">{summary.collectionRate.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-2 text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]"></span>ຄ້າງຊຳລະ</span>
                <span className="text-slate-800">{outstandingPct.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ledger table */}
      <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50 overflow-hidden">
        <div className="p-5 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-800">ລາຍການ Ledger</h2>
          <span className="text-xs text-slate-400 font-bold">{loading ? "ກຳລັງໂຫຼດ..." : `ທັງໝົດ ${rows.length} ລາຍການ`}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-t border-slate-50">
                <th className="p-4 text-left font-bold uppercase text-[11px]">ວັນທີ</th>
                <th className="p-4 text-left font-bold uppercase text-[11px]">ລະຫັດອໍເດີ້</th>
                <th className="p-4 text-left font-bold uppercase text-[11px]">ເບີໂທ</th>
                <th className="p-4 text-right font-bold uppercase text-[11px]">ຍອດທັງໝົດ</th>
                <th className="p-4 text-right font-bold uppercase text-[11px]">ຮັບແລ້ວ</th>
                <th className="p-4 text-right font-bold uppercase text-[11px]">ຍອດຄ້າງ</th>
                <th className="p-4 text-center font-bold uppercase text-[11px]">ສະຖານະ</th>
                <th className="p-4 text-center font-bold uppercase text-[11px]">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-slate-400 font-bold" colSpan={8}>
                    ບໍ່ພົບຂໍ້ມູນ
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const received = (baseReceivedByOrder[r.id] || 0) + (receivedByOrder[r.id] || 0);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-slate-500 font-semibold">{r.order_date}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-full bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center text-[11px] font-extrabold">
                            {r.order_code?.slice(0, 2)?.toUpperCase() || "OD"}
                          </span>
                          <span className="font-extrabold text-slate-700 tracking-tight">{r.order_code}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-500 font-semibold">{r.customer_phone || "-"}</td>
                      <td className="p-4 text-right text-slate-700 font-extrabold">{formatMoney(r.net_total)}</td>
                      <td className="p-4 text-right text-[#22C55E] font-extrabold">{formatMoney(received)}</td>
                      <td className="p-4 text-right text-[#DC2626] font-extrabold">{formatMoney(r.balance)}</td>
                      <td className="p-4 text-center">
                        {r.balance === 0 ? (
                          <span className="px-3 py-1 rounded-full bg-[#22C55E]/10 text-[#22C55E] text-[10px] font-extrabold uppercase">
                            ຈ່າຍແລ້ວ
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full bg-[#DC2626]/10 text-[#DC2626] text-[10px] font-extrabold uppercase">
                            ຍັງຄ້າງ
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <Link
                          href={`/orders/${r.id}/edit`}
                          className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-full text-xs font-extrabold text-[#2563EB] bg-[#2563EB]/10 hover:bg-blue-600 hover:text-white transition-all"
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