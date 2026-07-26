"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import type { AppRole } from "@/lib/access-control";

type DashboardStats = {
  totalProfit: number;
  customerBalance: number;
  factoryBalance: number;
  inProgressOrders: number;
  completedOrders: number;
  totalOrders: number;
  // ส่วนจำนวนเสื้อ
  totalShirts: number;
  shortSleeves: number;
  longSleeves: number;
  giveawayShirts: number;
};

type RecentOrder = {
  id: string;
  order_code: string;
  order_date: string;
  fabric_name: string;
  net_total: number;
  balance: number;
  status: string;
  shipment_status?: "pending" | "shipped";
  shipment_completed_at?: string | null;
};

type FactoryPaymentSummaryRow = {
  order_id: string;
  amount: number;
};

type PerformancePoint = {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
};

type DateRangeMode = "today" | "7days" | "1month" | "custom";

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

// จัดกลุ่มออเดอร์เป็นช่วงเวลา (วัน/สัปดาห์/เดือน) ตามความยาวของช่วงวันที่ที่เลือก
// เพื่อใช้พล็อตกราฟเส้นแนวโน้มผลประกอบการ โดยไม่ต้องยิง query เพิ่ม (ใช้ orderRows ที่โหลดมาแล้ว)
function buildPerformanceSeries(
  rows: Array<{ order_date: string; net_total: number; factory_cost: number }>,
  startDate: string,
  endDate: string
): PerformancePoint[] {
  if (rows.length === 0) return [];

  const start = startDate ? new Date(startDate) : new Date(rows[0].order_date);
  const end = endDate ? new Date(endDate) : new Date(rows[rows.length - 1].order_date);
  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  const bucketOf = (dateStr: string): { key: string; label: string } => {
    const d = new Date(dateStr);
    if (spanDays <= 31) {
      const key = toDateInputValue(d);
      return { key, label: formatShortDateLao(key) };
    }
    if (spanDays <= 180) {
      // จัดกลุ่มเป็นสัปดาห์ (วันจันทร์ของสัปดาห์นั้น)
      const weekStart = new Date(d);
      const weekday = (weekStart.getDay() + 6) % 7; // Mon=0
      weekStart.setDate(weekStart.getDate() - weekday);
      const key = toDateInputValue(weekStart);
      return { key, label: formatShortDateLao(key) };
    }
    // จัดกลุ่มเป็นเดือน
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` };
  };

  const buckets = new Map<string, PerformancePoint>();
  rows.forEach((row) => {
    if (!row.order_date) return;
    const { key, label } = bucketOf(row.order_date);
    const revenue = Number(row.net_total) || 0;
    const cost = Number(row.factory_cost) || 0;
    const existing = buckets.get(key);
    if (existing) {
      existing.revenue += revenue;
      existing.cost += cost;
      existing.profit += revenue - cost;
      existing.orderCount += 1;
    } else {
      buckets.set(key, { key, label, revenue, cost, profit: revenue - cost, orderCount: 1 });
    }
  });

  return Array.from(buckets.values()).sort((a, b) => (a.key > b.key ? 1 : -1));
}

// สร้าง SVG path สำหรับกราฟเส้น จากชุดจุดข้อมูลและ accessor ค่าที่จะพล็อต
function buildLinePath(
  points: PerformancePoint[],
  accessor: (p: PerformancePoint) => number,
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

function getCurrentMonthRange() {
  const now = new Date();
  return {
    start: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export default function DashboardPage() {
  const currentMonthRange = getCurrentMonthRange();
  const [stats, setStats] = useState<DashboardStats>({
    totalProfit: 0,
    customerBalance: 0,
    factoryBalance: 0,
    inProgressOrders: 0,
    completedOrders: 0,
    totalOrders: 0,
    totalShirts: 0,
    shortSleeves: 0,
    longSleeves: 0,
    giveawayShirts: 0,
  });

  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [performanceSeries, setPerformanceSeries] = useState<PerformancePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);

  // Date Range Filter
  const [dateMode, setDateMode] = useState<DateRangeMode>("1month");
  const [startDate, setStartDate] = useState(() => currentMonthRange.start);
  const [endDate, setEndDate] = useState(() => currentMonthRange.end);

  const handleDateModeChange = (mode: DateRangeMode) => {
    setDateMode(mode);
    const today = new Date();
    const todayValue = toDateInputValue(today);

    switch (mode) {
      case "today":
        setStartDate(todayValue);
        setEndDate(todayValue);
        break;
      case "7days":
        const week = new Date(today);
        week.setDate(week.getDate() - 7);
        setStartDate(toDateInputValue(week));
        setEndDate(todayValue);
        break;
      case "1month":
        const monthRange = getCurrentMonthRange();
        setStartDate(monthRange.start);
        setEndDate(monthRange.end);
        break;
      case "custom":
        break;
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    setErr(null);

    try {
      let query = supabase
        .from("orders")
        .select("id,order_code,order_date,fabric_name,net_total,balance,factory_cost,status,production_completed_at,shipment_status,shipment_completed_at, short_qty, long_qty, free_qty");

      if (startDate) {
        query = query.gte("order_date", startDate);
      }
      if (endDate) {
        query = query.lte("order_date", endDate);
      }

      const { data: orders, error: ordersError } = await query;
      if (ordersError) throw ordersError;

      const orderRows = (orders ?? []) as Array<{
        id: string;
        order_code: string;
        order_date: string;
        fabric_name: string;
        net_total: number;
        balance: number;
        factory_cost: number;
        status: string;
        production_completed_at: string | null;
        shipment_status?: "pending" | "shipped";
        shipment_completed_at?: string | null;
        short_qty: number;
        long_qty: number;
        free_qty: number;
      }>;

      const orderIds = orderRows.map((order) => order.id).filter(Boolean);
      const paidByOrder = new Map<string, number>();

      if (orderIds.length > 0) {
        const { data: factoryPayments, error: factoryPaymentsError } = await supabase
          .from("factory_payments")
          .select("order_id,amount")
          .in("order_id", orderIds);

        if (factoryPaymentsError && !factoryPaymentsError.message.includes("Could not find the table")) {
          throw factoryPaymentsError;
        }

        ((factoryPayments ?? []) as FactoryPaymentSummaryRow[]).forEach((payment) => {
          paidByOrder.set(payment.order_id, (paidByOrder.get(payment.order_id) || 0) + (Number(payment.amount) || 0));
        });
      }

      let profitQuery = supabase
        .from("orders")
        .select("id,net_total,factory_cost,shipment_completed_at")
        .not("shipment_completed_at", "is", null);
      if (startDate) profitQuery = profitQuery.gte("shipment_completed_at", `${startDate}T00:00:00`);
      if (endDate) profitQuery = profitQuery.lte("shipment_completed_at", `${endDate}T23:59:59`);
      const { data: profitOrders, error: profitError } = await profitQuery;
      if (profitError) throw profitError;

      const inProgress = orderRows.filter((o) => o.status === "in_progress");

      const totalProfit =
        profitOrders?.reduce(
          (sum, o) => sum + ((Number(o.net_total) || 0) - (Number(o.factory_cost) || 0)),
          0
        ) || 0;
      const customerBalance = orderRows.reduce((sum, o) => sum + (Number(o.balance) || 0), 0);
      const factoryBalance = inProgress.reduce((sum, o) => {
        const paidAmount = paidByOrder.get(o.id) || 0;
        const outstandingAmount = Math.max(0, (Number(o.factory_cost) || 0) - paidAmount);
        return sum + outstandingAmount;
      }, 0);

      // คำนวณจำนวนเสื้อ
      const shortSleeves = orderRows.reduce((sum, o) => sum + (Number(o.short_qty) || 0), 0);
      const longSleeves = orderRows.reduce((sum, o) => sum + (Number(o.long_qty) || 0), 0);
      const giveawayShirts = orderRows.reduce((sum, o) => sum + (Number(o.free_qty) || 0), 0);
      const totalShirts = shortSleeves + longSleeves + giveawayShirts;

      setStats({
        totalProfit,
        customerBalance,
        factoryBalance,
        inProgressOrders: inProgress.length,
        completedOrders: profitOrders?.length || 0,
        totalOrders: orderRows.length,
        totalShirts,
        shortSleeves,
        longSleeves,
        giveawayShirts,
      });

      setPerformanceSeries(buildPerformanceSeries(orderRows, startDate, endDate));

      let recentQuery = supabase
        .from("orders")
        .select("id,order_code,order_date,fabric_name,net_total,balance,status,shipment_status,shipment_completed_at")
        .order("order_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);

      if (startDate) recentQuery = recentQuery.gte("order_date", startDate);
      if (endDate) recentQuery = recentQuery.lte("order_date", endDate);

      const { data: recent, error: recentError } = await recentQuery;
      if (recentError) throw recentError;

      setRecentOrders((recent as RecentOrder[]) || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load dashboard";
      setErr(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  useEffect(() => {
    const loadViewerRole = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user.id;
      if (!authUserId) return;
      const { data } = await supabase.from("users").select("role").eq("auth_user_id", authUserId).maybeSingle();
      if (data?.role) setViewerRole(data.role as AppRole);
    };
    void loadViewerRole();
  }, []);

  const isAdminLimited = viewerRole === "admin";
  const isGraphicLimited = viewerRole === "graphic";

  const formatCurrency = (amount: number) => {
    return `₭ ${amount.toLocaleString()}`;
  };

  const formatDateLao = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // ---- Derived, display-only values (no new business logic, just presentation math on existing stats) ----
  const completedPct = stats.totalOrders > 0 ? (stats.completedOrders / stats.totalOrders) * 100 : 0;
  const inProgressPct = stats.totalOrders > 0 ? (stats.inProgressOrders / stats.totalOrders) * 100 : 0;
  const cashFlow = stats.customerBalance - stats.factoryBalance;

  const shortPct = stats.totalShirts > 0 ? (stats.shortSleeves / stats.totalShirts) * 100 : 0;
  const longPct = stats.totalShirts > 0 ? (stats.longSleeves / stats.totalShirts) * 100 : 0;
  const freePct = stats.totalShirts > 0 ? (stats.giveawayShirts / stats.totalShirts) * 100 : 0;

  // ---- วิเคราะห์แนวโน้มผลประกอบการ จากชุดข้อมูล performanceSeries ที่คำนวณไว้แล้ว ----
  const seriesRevenueTotal = performanceSeries.reduce((s, p) => s + p.revenue, 0);
  const seriesCostTotal = performanceSeries.reduce((s, p) => s + p.cost, 0);
  const seriesProfitTotal = performanceSeries.reduce((s, p) => s + p.profit, 0);
  const seriesMax = Math.max(1, ...performanceSeries.map((p) => Math.max(p.revenue, p.cost)));
  const marginPct = seriesRevenueTotal > 0 ? (seriesProfitTotal / seriesRevenueTotal) * 100 : 0;

  const bestPoint = performanceSeries.reduce<PerformancePoint | null>(
    (best, p) => (!best || p.revenue > best.revenue ? p : best),
    null
  );

  let trendLabel = "ຂໍ້ມູນຍັງບໍ່ພຽງພໍ";
  let trendUp = true;
  if (performanceSeries.length >= 2) {
    const mid = Math.ceil(performanceSeries.length / 2);
    const firstHalf = performanceSeries.slice(0, mid);
    const secondHalf = performanceSeries.slice(mid);
    const avg = (arr: PerformancePoint[]) => (arr.length > 0 ? arr.reduce((s, p) => s + p.profit, 0) / arr.length : 0);
    const firstAvg = avg(firstHalf);
    const secondAvg = avg(secondHalf);
    const diff = secondAvg - firstAvg;
    trendUp = diff >= 0;
    const diffPct = firstAvg !== 0 ? Math.abs((diff / firstAvg) * 100) : 0;
    trendLabel = firstAvg === 0
      ? (secondAvg > 0 ? "ກຳໄລເລີ່ມເພີ່ມຂຶ້ນ" : "ຍັງບໍ່ມີກຳໄລໃນຊ່ວງນີ້")
      : `ກຳໄລ${trendUp ? "ເພີ່ມຂຶ້ນ" : "ຫຼຸດລົງ"} ${diffPct.toFixed(1)}% ທຽບກັບຕົ້ນຊ່ວງ`;
  }

  const chartWidth = 720;
  const chartHeight = 200;
  const revenuePath = buildLinePath(performanceSeries, (p) => p.revenue, chartWidth, chartHeight, seriesMax);
  const costPath = buildLinePath(performanceSeries, (p) => p.cost, chartWidth, chartHeight, seriesMax);
  const revenueAreaPath = performanceSeries.length > 0
    ? `${revenuePath} L${chartWidth},${chartHeight} L0,${chartHeight} Z`
    : "";

  const KebabIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="12" cy="19" r="1.2" />
    </svg>
  );

  return (
    <div className="min-h-full bg-[#FBF3EC] -m-6 p-6 space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold text-slate-900 tracking-tight">ໜ້າຫຼັກ</h1>
          <div className="text-sm text-slate-400 font-medium">ພາບລວມຂໍ້ມູນບັນຊີອໍເດີ້</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDashboard}
            className="flex items-center gap-2 bg-white border border-slate-100 px-4 py-2.5 rounded-full text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-[0_2px_10px_rgba(15,23,42,0.04)]"
            disabled={loading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={loading ? "animate-spin" : ""}>
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            {loading ? "ກຳລັງໂຫຼດ..." : "ໂຫຼດຄືນໃໝ່"}
          </button>

          {!isAdminLimited && !isGraphicLimited ? (
            <Link
              href="/orders/new"
              className="flex items-center gap-2 bg-[#F2653F] px-5 py-2.5 rounded-full text-white font-semibold text-sm hover:bg-[#e2572f] transition-all active:scale-95 shadow-[0_8px_20px_rgba(242,101,63,0.35)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              ເພີ່ມອໍເດີ້ໃໝ່
            </Link>
          ) : null}
        </div>
      </div>

      {/* Date Filter Card */}
      <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-[#FBF3EC] p-1 rounded-full">
            {(["today", "7days", "1month", "custom"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleDateModeChange(mode)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${dateMode === mode
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
                  }`}
              >
                {mode === "today" ? "ວັນນີ້" : mode === "7days" ? "7 ວັນ" : mode === "1month" ? "1 ເດືອນ" : "ກຳນົດເອງ"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDateMode("custom");
              }}
              className="border border-slate-100 bg-[#FBF3EC]/60 rounded-full px-3 py-1.5 text-sm font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-[#F2653F]/40"
            />
            <span className="text-slate-300 font-black">→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDateMode("custom");
              }}
              className="border border-slate-100 bg-[#FBF3EC]/60 rounded-full px-3 py-1.5 text-sm font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-[#F2653F]/40"
            />
          </div>

          <button
            onClick={loadDashboard}
            className="bg-slate-900 text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-slate-800 transition-all shadow-md shadow-slate-200"
          >
            ອັບເດດຂໍ້ມູນ
          </button>

          <div className="ml-auto flex items-center gap-2 px-3.5 py-2 bg-[#FBF3EC] rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F2653F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            <span className="text-xs font-bold text-slate-600">{formatDateLao(startDate)} - {formatDateLao(endDate)}</span>
          </div>
        </div>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl text-sm font-semibold flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          Error: {err}
        </div>
      )}

      {/* กราฟแนวโน้มผลประกอบการ + วิเคราะห์ */}
      {!isAdminLimited && !isGraphicLimited ? (
        <div className="bg-white p-6 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h2 className="text-sm font-extrabold text-slate-800">ພາບລວມຜົນປະກອບການ</h2>
            <div className="flex items-center gap-4 text-[11px] font-bold text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]"></span>ລາຍຮັບ</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#F2653F]"></span>ຕົ້ນທຶນໂຮງງານ</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 mb-6">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase">ລາຍຮັບລວມ</div>
              <div className="text-lg font-extrabold text-[#22C55E]">{loading ? "..." : formatCurrency(seriesRevenueTotal)}</div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase">ຕົ້ນທຶນລວມ</div>
              <div className="text-lg font-extrabold text-[#F2653F]">{loading ? "..." : formatCurrency(seriesCostTotal)}</div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase">ກຳໄລລວມ</div>
              <div className="text-lg font-extrabold text-slate-800">{loading ? "..." : formatCurrency(seriesProfitTotal)}</div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase">ອັດຕາກຳໄລ</div>
              <div className="text-lg font-extrabold text-slate-800">{loading ? "..." : `${marginPct.toFixed(1)}%`}</div>
            </div>
          </div>

          {loading ? (
            <div className="h-[200px] flex items-center justify-center text-slate-400 font-bold text-sm">ກຳລັງໂຫຼດ...</div>
          ) : performanceSeries.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-slate-400 font-bold text-sm">ບໍ່ມີຂໍ້ມູນໃນຊ່ວງວັນທີນີ້</div>
          ) : (
            <>
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-[200px]" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22C55E" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75].map((f) => (
                  <line key={f} x1="0" x2={chartWidth} y1={chartHeight * f} y2={chartHeight * f} stroke="#FBF3EC" strokeWidth="1" />
                ))}
                <path d={revenueAreaPath} fill="url(#revenueFill)" stroke="none" />
                <path d={revenuePath} fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d={costPath} fill="none" stroke="#F2653F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 5" />
              </svg>
              <div className="flex justify-between mt-2 text-[11px] font-bold text-slate-400">
                <span>{performanceSeries[0]?.label}</span>
                {performanceSeries.length > 2 && (
                  <span>{performanceSeries[Math.floor(performanceSeries.length / 2)]?.label}</span>
                )}
                <span>{performanceSeries[performanceSeries.length - 1]?.label}</span>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-50 flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${trendUp ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-[#F43F5E]/10 text-[#F43F5E]"}`}>
                  {trendUp ? "▲" : "▼"} {trendLabel}
                </span>
                {bestPoint && (
                  <span className="text-slate-400">
                    ຊ່ວງທີ່ຂາຍດີສຸດ: <span className="text-slate-700">{bestPoint.label}</span> ({formatCurrency(bestPoint.revenue)})
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* แถวที่ 1: การเงิน */}
      {!isAdminLimited && !isGraphicLimited ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
            <div className="flex items-center justify-between mb-5">
              <div className="w-11 h-11 bg-[#22C55E]/12 rounded-2xl flex items-center justify-center text-[#22C55E]">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
              </div>
              <span className="text-slate-300"><KebabIcon /></span>
            </div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">ກຳໄລທັງໝົດ</div>
            <div className="text-[26px] font-extrabold text-slate-900 leading-none mb-2">
              {loading ? "..." : formatCurrency(stats.totalProfit)}
            </div>
            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded-full">
              ຈາກ {stats.completedOrders} ອໍເດີ້ທີ່ສົ່ງມອບສຳເລັດ
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
            <div className="flex items-center justify-between mb-5">
              <div className="w-11 h-11 bg-[#F59E0B]/12 rounded-2xl flex items-center justify-center text-[#F59E0B]">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              </div>
              <span className="text-slate-300"><KebabIcon /></span>
            </div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">ຄ້າງຊຳລະ</div>
            <div className="text-[26px] font-extrabold text-slate-900 leading-none mb-2">
              {loading ? "..." : formatCurrency(stats.customerBalance)}
            </div>
            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 px-2 py-0.5 rounded-full">
              ຍອດທີ່ຕ້ອງເກັບເພີ່ມ
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
            <div className="flex items-center justify-between mb-5">
              <div className="w-11 h-11 bg-[#F43F5E]/12 rounded-2xl flex items-center justify-center text-[#F43F5E]">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20V9l4-2 4 2 4-2 4 2 4-2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" /><path d="M7 18h0" /><path d="M12 18h0" /><path d="M17 18h0" /><path d="M7 13h0" /><path d="M12 13h0" /><path d="M17 13h0" /></svg>
              </div>
              <span className="text-slate-300"><KebabIcon /></span>
            </div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">ຄ້າງຈ່າຍໂຮງງານ</div>
            <div className="text-[26px] font-extrabold text-slate-900 leading-none mb-2">
              {loading ? "..." : formatCurrency(stats.factoryBalance)}
            </div>
            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F43F5E] bg-[#F43F5E]/10 px-2 py-0.5 rounded-full">
              ຈາກ {stats.inProgressOrders} ອໍເດີ້ທີ່ຜະລິດ
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
            <div className="flex items-center justify-between mb-5">
              <div className="w-11 h-11 bg-[#3B82F6]/12 rounded-2xl flex items-center justify-center text-[#3B82F6]">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><polyline points="3.29 7l9 5.19 9-5.19" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
              </div>
              <span className="text-slate-300"><KebabIcon /></span>
            </div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">ກຳລັງຜະລິດ</div>
            <div className="text-[26px] font-extrabold text-slate-900 leading-none mb-2">
              {loading ? "..." : stats.inProgressOrders}
            </div>
            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3B82F6] bg-[#3B82F6]/10 px-2 py-0.5 rounded-full">
              ອໍເດີ້ທັງໝົດ: {stats.totalOrders}
            </div>
          </div>
        </div>
      ) : null}

      {/* แถวที่ 2: จำนวนเสื้อ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
          <div className="flex items-center justify-between mb-5">
            <div className="w-11 h-11 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" /></svg>
            </div>
            <span className="text-slate-300"><KebabIcon /></span>
          </div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">ຈຳນວນເສື້ອທັງໝົດ</div>
          <div className="text-[26px] font-extrabold text-slate-900 leading-none mb-2">
            {loading ? "..." : stats.totalShirts.toLocaleString()}
          </div>
          <div className="text-[11px] font-bold text-slate-400">ທັງໝົດທຸກປະເພດ (ຕົວ)</div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
          <div className="flex items-center justify-between mb-5">
            <div className="w-11 h-11 bg-[#3B82F6]/12 rounded-2xl flex items-center justify-center text-[#3B82F6]">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10V5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v5" /><path d="M6 10 3 11.5v3l3 1.5v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5l3-1.5v-3L18 10" /><path d="M12 2v6" /></svg>
            </div>
            <span className="text-slate-300"><KebabIcon /></span>
          </div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">ແຂນສັ້ນ</div>
          <div className="text-[26px] font-extrabold text-[#3B82F6] leading-none mb-2">
            {loading ? "..." : stats.shortSleeves.toLocaleString()}
          </div>
          <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3B82F6] bg-[#3B82F6]/10 px-2 py-0.5 rounded-full">
            ກວມເອົາ {shortPct.toFixed(1)}%
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
          <div className="flex items-center justify-between mb-5">
            <div className="w-11 h-11 bg-[#6366F1]/12 rounded-2xl flex items-center justify-center text-[#6366F1]">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" /><path d="M4 10v6" /><path d="M20 10v6" /></svg>
            </div>
            <span className="text-slate-300"><KebabIcon /></span>
          </div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">ແຂນຍາວ</div>
          <div className="text-[26px] font-extrabold text-[#6366F1] leading-none mb-2">
            {loading ? "..." : stats.longSleeves.toLocaleString()}
          </div>
          <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6366F1] bg-[#6366F1]/10 px-2 py-0.5 rounded-full">
            ກວມເອົາ {longPct.toFixed(1)}%
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
          <div className="flex items-center justify-between mb-5">
            <div className="w-11 h-11 bg-[#EC4899]/12 rounded-2xl flex items-center justify-center text-[#EC4899]">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5H12z" /></svg>
            </div>
            <span className="text-slate-300"><KebabIcon /></span>
          </div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">ແຖມ</div>
          <div className="text-[26px] font-extrabold text-[#EC4899] leading-none mb-2">
            {loading ? "..." : stats.giveawayShirts.toLocaleString()}
          </div>
          <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#EC4899] bg-[#EC4899]/10 px-2 py-0.5 rounded-full">
            ຈຳນວນທີ່ແຈກຟຣີ ({freePct.toFixed(1)}%)
          </div>
        </div>
      </div>

      {/* ส่วนกราฟ + สรุปการเงิน */}
      {!isAdminLimited && !isGraphicLimited ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* การ์ดซ้าย: สถานะออเดอร์ (แถบเปอร์เซ็นต์ สไตล์เดียวกับกราฟในภาพอ้างอิง) */}
          <div className="bg-white p-6 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-extrabold text-slate-800">ສະຖານະອໍເດີ້</h2>
              <span className="text-[11px] font-bold text-slate-400 bg-[#FBF3EC] px-3 py-1 rounded-full">ອໍເດີ້ທັງໝົດ {stats.totalOrders}</span>
            </div>

            <div className="flex items-center gap-6 mb-6">
              <div className="text-center">
                <div className="text-[11px] font-bold text-slate-400 uppercase">ກຳໄລ</div>
                <div className="text-lg font-extrabold text-[#22C55E]">{loading ? "..." : formatCurrency(stats.totalProfit)}</div>
              </div>
              <div className="text-center">
                <div className="text-[11px] font-bold text-slate-400 uppercase">ຄ້າງຮັບ</div>
                <div className="text-lg font-extrabold text-[#F59E0B]">{loading ? "..." : formatCurrency(stats.customerBalance)}</div>
              </div>
              <div className="text-center">
                <div className="text-[11px] font-bold text-slate-400 uppercase">ຄ້າງຈ່າຍ</div>
                <div className="text-lg font-extrabold text-[#F43F5E]">{loading ? "..." : formatCurrency(stats.factoryBalance)}</div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span className="text-slate-400">ກຳລັງຜະລິດ</span>
                  <span className="text-[#F59E0B]">{stats.inProgressOrders} / {stats.totalOrders}</span>
                </div>
                <div className="w-full bg-[#FBF3EC] rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-[#F59E0B] h-full rounded-full transition-all duration-1000"
                    style={{ width: `${inProgressPct}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span className="text-slate-400">ສຳເລັດແລ້ວ</span>
                  <span className="text-[#22C55E]">{stats.completedOrders} / {stats.totalOrders}</span>
                </div>
                <div className="w-full bg-[#FBF3EC] rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-[#22C55E] h-full rounded-full transition-all duration-1000"
                    style={{ width: `${completedPct}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* การ์ดขวา: Donut (สไตล์ Invoice Analytics ในภาพอ้างอิง) */}
          <div className="bg-white p-6 rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-extrabold text-slate-800">ສະຫຼຸບການເງິນ</h2>
              <span className="text-slate-300"><KebabIcon /></span>
            </div>

            <div className="flex items-center gap-8">
              <div
                className="relative w-40 h-40 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: `conic-gradient(#22C55E 0% ${completedPct}%, #ffab1b ${completedPct}% 100%)`,
                }}
              >
                <div className="absolute w-28 h-28 bg-white rounded-full flex flex-col items-center justify-center">
                  <div className="text-2xl font-extrabold text-slate-900">{loading ? "..." : `${completedPct.toFixed(0)}%`}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">ສຳເລັດ</div>
                </div>
              </div>

              <div className="space-y-4 flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]"></span>
                    <span className="text-xs font-bold text-slate-500">ສຳເລັດແລ້ວ</span>
                  </div>
                  <span className="text-sm font-extrabold text-slate-800">{stats.completedOrders}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></span>
                    <span className="text-xs font-bold text-slate-500">ກຳລັງຜະລິດ</span>
                  </div>
                  <span className="text-sm font-extrabold text-slate-800">{stats.inProgressOrders}</span>
                </div>
                <div className="border-t border-slate-50 pt-4 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Cash Flow ຄາດການ</span>
                  <span className={`text-sm font-extrabold ${cashFlow >= 0 ? "text-[#22C55E]" : "text-[#F43F5E]"}`}>
                    {formatCurrency(cashFlow)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* รายการอเดอร์ */}
      {!isAdminLimited && !isGraphicLimited ? (
        <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(15,23,42,0.05)] border border-slate-50 overflow-hidden">
          <div className="p-5 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-800">ລາຍການອໍເດີ້</h2>
            <Link href="/orders" className="text-xs bg-[#F2653F] px-4 py-1.5 rounded-full text-white hover:bg-[#e2572f] font-bold transition-all">
              ເບິ່ງທັງໝົດ →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-t border-slate-50">
                  <th className="p-4 text-left font-bold text-[11px] uppercase">ວັນທີ</th>
                  <th className="p-4 text-left font-bold text-[11px] uppercase">ລະຫັດອໍເດີ້</th>
                  <th className="p-4 text-left font-bold text-[11px] uppercase">ຜ້າ</th>
                  <th className="p-4 text-right font-bold text-[11px] uppercase">ຍອດສຸດທິ</th>
                  <th className="p-4 text-right font-bold text-[11px] uppercase">ຄ້າງຊຳລະ</th>
                  <th className="p-4 text-center font-bold text-[11px] uppercase">ສະຖານະ</th>
                  <th className="p-4 text-center font-bold text-[11px] uppercase">ຈັດການ</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr><td className="p-8 text-center text-slate-400 font-bold" colSpan={7}>ກຳລັງໂຫຼດ...</td></tr>
                ) : recentOrders.length === 0 ? (
                  <tr><td className="p-8 text-center text-slate-400 font-bold" colSpan={7}>ບໍ່ມີອໍເດີ້ໃນຊ່ວງວັນທີນີ້</td></tr>
                ) : (
                  recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-[#FBF3EC]/40 transition-colors group">
                      <td className="p-4 text-slate-500 font-semibold">{formatDateLao(order.order_date)}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-full bg-[#F2653F]/10 text-[#F2653F] flex items-center justify-center text-[11px] font-extrabold">
                            {order.order_code?.slice(0, 2)?.toUpperCase() || "OD"}
                          </span>
                          <span className="font-extrabold text-slate-700 tracking-tight">{order.order_code}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-500 font-medium">{order.fabric_name}</td>
                      <td className="p-4 text-right text-slate-700 font-extrabold">{order.net_total.toLocaleString()}</td>
                      <td className="p-4 text-right">
                        <span className={order.balance > 0 ? "text-[#F43F5E] font-extrabold" : "text-[#22C55E] font-extrabold"}>
                          {order.balance > 0 ? order.balance.toLocaleString() : "ຊຳລະແລ້ວ"}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase ${order.status === "completed" ? "bg-[#22C55E]/10 text-[#22C55E]" : order.shipment_status === "shipped" ? "bg-[#14B8A6]/10 text-[#14B8A6]" : "bg-[#F59E0B]/10 text-[#F59E0B]"
                          }`}>
                          {order.status === "completed" ? "ສຳເລັດ" : "ກຳລັງຜະລິດ"}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <Link
                          href={`/orders/${order.id}/edit`}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#FBF3EC] text-slate-500 hover:bg-[#F2653F] hover:text-white transition-all"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}