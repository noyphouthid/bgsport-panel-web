"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

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
};

type DateRangeMode = "today" | "7days" | "1month" | "custom";

export default function DashboardPage() {
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
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Date Range Filter
  const [dateMode, setDateMode] = useState<DateRangeMode>("1month");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const handleDateModeChange = (mode: DateRangeMode) => {
    setDateMode(mode);
    const today = new Date();
    const end = today.toISOString().slice(0, 10);

    switch (mode) {
      case "today":
        setStartDate(end);
        setEndDate(end);
        break;
      case "7days":
        const week = new Date(today);
        week.setDate(week.getDate() - 7);
        setStartDate(week.toISOString().slice(0, 10));
        setEndDate(end);
        break;
      case "1month":
        const month = new Date(today);
        month.setMonth(month.getMonth() - 1);
        setStartDate(month.toISOString().slice(0, 10));
        setEndDate(end);
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
        .select("id,order_code,order_date,fabric_name,net_total,balance,factory_cost,profit,status, short_qty, long_qty, free_qty");

      if (startDate) {
        query = query.gte("order_date", startDate);
      }
      if (endDate) {
        query = query.lte("order_date", endDate);
      }

      const { data: orders, error: ordersError } = await query;
      if (ordersError) throw ordersError;

      const completed = orders?.filter((o) => o.status === "completed") || [];
      const inProgress = orders?.filter((o) => o.status === "in_progress") || [];

      const totalProfit = completed.reduce((sum, o) => sum + (o.profit || 0), 0);
      const customerBalance = orders?.reduce((sum, o) => sum + (o.balance || 0), 0) || 0;
      const factoryBalance = inProgress.reduce((sum, o) => sum + (o.factory_cost || 0), 0);

      // คำนวณจำนวนเสื้อ
      const shortSleeves = orders?.reduce((sum, o) => sum + (Number(o.short_qty) || 0), 0) || 0;
      const longSleeves = orders?.reduce((sum, o) => sum + (Number(o.long_qty) || 0), 0) || 0;
      const giveawayShirts = orders?.reduce((sum, o) => sum + (Number(o.free_qty) || 0), 0) || 0;
      const totalShirts = shortSleeves + longSleeves + giveawayShirts;

      setStats({
        totalProfit,
        customerBalance,
        factoryBalance,
        inProgressOrders: inProgress.length,
        completedOrders: completed.length,
        totalOrders: orders?.length || 0,
        totalShirts,
        shortSleeves,
        longSleeves,
        giveawayShirts,
      });

      let recentQuery = supabase
        .from("orders")
        .select("id,order_code,order_date,fabric_name,net_total,balance,status")
        .order("order_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);

      if (startDate) recentQuery = recentQuery.gte("order_date", startDate);
      if (endDate) recentQuery = recentQuery.lte("order_date", endDate);

      const { data: recent, error: recentError } = await recentQuery;
      if (recentError) throw recentError;

      setRecentOrders((recent as RecentOrder[]) || []);
    } catch (error: any) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [startDate, endDate]);

  const formatCurrency = (amount: number) => {
    return `₭ ${amount.toLocaleString()}`;
  };

  const formatDateLao = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="space-y-6">
      {/* Header with Date Filter */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">ໜ້າຫຼັກ</h1>
            <div className="text-sm text-slate-500 font-bold">ພາບລວມຂໍ້ມູນບັນຊີອໍເດີ້</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadDashboard}
              className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-700 font-black text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
              disabled={loading}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={loading ? "animate-spin" : ""}>
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              {loading ? "ກຳລັງໂຫຼດ..." : "ໂຫຼດຄືນໃໝ່"}
            </button>

            <Link
              href="/orders/new"
              className="flex items-center gap-2 bg-green-600 border border-green-700 px-4 py-2 rounded-xl text-white font-black text-sm hover:bg-green-700 transition-all active:scale-95 shadow-sm shadow-green-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              ເພີ່ມອໍເດີ້ໃໝ່
            </Link>
          </div>
        </div>

        {/* Date Filter Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              {(["today", "7days", "1month", "custom"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleDateModeChange(mode)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${dateMode === mode
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
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
                className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-400 font-black">→</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDateMode("custom");
                }}
                className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={loadDashboard}
              className="bg-slate-900 text-white px-6 py-2 rounded-xl text-sm font-black hover:bg-slate-800 transition-all shadow-md shadow-slate-200"
            >
              ອັບເດດຂໍ້ມູນ
            </button>

            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              <span className="text-xs font-black text-blue-700">{formatDateLao(startDate)} - {formatDateLao(endDate)}</span>
            </div>
          </div>
        </div>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm font-bold flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          Error: {err}
        </div>
      )}

      {/* แถวที่ 1: การเงิน */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-2xl flex items-center justify-center text-green-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
            <div className="text-[14px] font-black text-slate-600 uppercase tracking-widest">ກຳໄລທັງໝົດ</div>
          </div>
          <div className="text-2xl font-black text-slate-900 leading-none mb-2">
            {loading ? "..." : formatCurrency(stats.totalProfit)}
          </div>
          <div className="text-xs text-slate-500 font-bold">ຈາກ {stats.completedOrders} ອໍເດີ້ທີ່ສຳເລັດ</div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <div className="text-[14px] font-black text-slate-600 uppercase tracking-widest">ຄ້າງຊຳລະ</div>
          </div>
          <div className="text-2xl font-black text-amber-600 leading-none mb-2">
            {loading ? "..." : formatCurrency(stats.customerBalance)}
          </div>
          <div className="text-xs text-slate-500 font-bold">ຍອດທີ່ຕ້ອງເກັບເພີ່ມ</div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-red-100 rounded-2xl flex items-center justify-center text-red-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20V9l4-2 4 2 4-2 4 2 4-2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" /><path d="M7 18h0" /><path d="M12 18h0" /><path d="M17 18h0" /><path d="M7 13h0" /><path d="M12 13h0" /><path d="M17 13h0" /></svg>
            </div>
            <div className="text-[14px] font-black text-slate-600 uppercase tracking-widest">ຄ້າງຈ່າຍໂຮງງານ</div>
          </div>
          <div className="text-2xl font-black text-red-600 leading-none mb-2">
            {loading ? "..." : formatCurrency(stats.factoryBalance)}
          </div>
          <div className="text-xs text-slate-500 font-bold">ຈາກ {stats.inProgressOrders} ອໍເດີ້ທີ່ຜະລິດ</div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><polyline points="3.29 7l9 5.19 9-5.19" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
            </div>
            <div className="text-[14px] font-black text-slate-600 uppercase tracking-widest">ກຳລັງຜະລິດ</div>
          </div>
          <div className="text-2xl font-black text-blue-600 leading-none mb-2">
            {loading ? "..." : stats.inProgressOrders}
          </div>
          <div className="text-xs text-slate-500 font-bold">ອໍເດີ້ທັງໝົດ: {stats.totalOrders}</div>
        </div>
      </div>

      {/* แถวที่ 2: จำนวนเสื้อ (พร้อมไอคอน) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* จำนวนทั้งหมด */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>
            </div>
            <div className="text-[14px] font-black text-slate-600 uppercase tracking-widest">ຈຳນວນເສື້ອທັງໝົດ</div>
          </div>
          <div className="text-2xl font-black text-slate-900 leading-none mb-2">
            {loading ? "..." : stats.totalShirts.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 font-bold">ທັງໝົດທຸກປະເພດ (ຕົວ)</div>
        </div>

        {/* แขนสั้น */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10V5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v5"/><path d="M6 10 3 11.5v3l3 1.5v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5l3-1.5v-3L18 10"/><path d="M12 2v6"/></svg>
            </div>
            <div className="text-[14px] font-black text-slate-600 uppercase tracking-widest">ແຂນສັ້ນ</div>
          </div>
          <div className="text-2xl font-black text-blue-700 leading-none mb-2">
            {loading ? "..." : stats.shortSleeves.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 font-bold">
            ກວມເອົາ {stats.totalShirts > 0 ? ((stats.shortSleeves / stats.totalShirts) * 100).toFixed(1) : 0}%
          </div>
        </div>

        {/* แขนยาว */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/><path d="M4 10v6"/><path d="M20 10v6"/></svg>
            </div>
            <div className="text-[14px] font-black text-slate-600 uppercase tracking-widest">ແຂນຍາວ</div>
          </div>
          <div className="text-2xl font-black text-indigo-700 leading-none mb-2">
            {loading ? "..." : stats.longSleeves.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 font-bold">
            ກວມເອົາ {stats.totalShirts > 0 ? ((stats.longSleeves / stats.totalShirts) * 100).toFixed(1) : 0}%
          </div>
        </div>

        {/* แถม */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-pink-50 rounded-2xl flex items-center justify-center text-pink-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5H12z"/></svg>
            </div>
            <div className="text-[14px] font-black text-slate-600 uppercase tracking-widest">ແຖມ</div>
          </div>
          <div className="text-2xl font-black text-pink-700 leading-none mb-2">
            {loading ? "..." : stats.giveawayShirts.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 font-bold">ຈຳນວນທີ່ແຈກຟຣີ</div>
        </div>
      </div>

      {/* ส่วนอื่นๆ ของ Dashboard (เหมือนเดิม) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h2 className="text-sm font-black text-slate-800 mb-6 uppercase tracking-wider">ສະຖານະອໍເດີ້</h2>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-xs font-black mb-2 uppercase tracking-tighter">
                <span className="text-slate-500">ກຳລັງຜະລິດ</span>
                <span className="text-amber-600">{stats.inProgressOrders} / {stats.totalOrders}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full transition-all duration-1000"
                  style={{ width: `${stats.totalOrders > 0 ? (stats.inProgressOrders / stats.totalOrders) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-black mb-2 uppercase tracking-tighter">
                <span className="text-slate-500">ສຳເລັດແລ້ວ</span>
                <span className="text-green-600">{stats.completedOrders} / {stats.totalOrders}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-green-500 h-full rounded-full transition-all duration-1000"
                  style={{ width: `${stats.totalOrders > 0 ? (stats.completedOrders / stats.totalOrders) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-4 text-gray-900">ສະຫຼຸບການເງິນ</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-800 font-medium">ກຳໄລທັງໝົດ</span>
              <span className="font-bold text-green-600">{formatCurrency(stats.totalProfit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-800 font-medium">ຕ້ອງເກັບຈາກລູກຄ້າ</span>
              <span className="font-bold text-orange-600">{formatCurrency(stats.customerBalance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-800 font-medium">ຕ້ອງຈ່າຍໂຮງງານ</span>
              <span className="font-bold text-red-600">{formatCurrency(stats.factoryBalance)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between">
              <span className="text-gray-900 font-semibold">Cash Flow ຄາດການ</span>
              <span className={`font-bold ${stats.customerBalance - stats.factoryBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(stats.customerBalance - stats.factoryBalance)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">ລາຍການອໍເດີ້</h2>
          <Link href="/orders" className="text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-blue-600 hover:bg-blue-50 font-black transition-all">
            ເບິ່ງທັງໝົດ →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 text-slate-600">
                <th className="p-4 text-left font-black text-[14px] uppercase">ວັນທີ</th>
                <th className="p-4 text-left font-black text-[14px] uppercase">ລະຫັດອໍເດີ້</th>
                <th className="p-4 text-left font-black text-[14px] uppercase">ຜ້າ</th>
                <th className="p-4 text-right font-black text-[14px] uppercase">ຍອດສຸດທິ</th>
                <th className="p-4 text-right font-black text-[14px] uppercase">ຄ້າງຊຳລະ</th>
                <th className="p-4 text-center font-black text-[14px] uppercase">ສະຖານະ</th>
                <th className="p-4 text-center font-black text-[14px] uppercase">ຈັດການ</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td className="p-8 text-center text-slate-400 font-bold" colSpan={7}>ກຳລັງໂຫຼດ...</td></tr>
              ) : recentOrders.length === 0 ? (
                <tr><td className="p-8 text-center text-slate-400 font-bold" colSpan={7}>ບໍ່ມີອໍເດີ້ໃນຊ່ວງວັນທີນີ້</td></tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="p-4 text-slate-600 font-bold">{formatDateLao(order.order_date)}</td>
                    <td className="p-4 font-black text-slate-600 tracking-tight">{order.order_code}</td>
                    <td className="p-4 text-slate-600 font-medium">{order.fabric_name}</td>
                    <td className="p-4 text-right text-slate-600 font-black">{order.net_total.toLocaleString()}</td>
                    <td className="p-4 text-right">
                      <span className={order.balance > 0 ? "text-red-500 font-black" : "text-green-500 font-black"}>
                        {order.balance > 0 ? order.balance.toLocaleString() : "ຊຳລະແລ້ວ"}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${order.status === "completed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}>
                        {order.status === "completed" ? "ສຳເລັດ" : "ກຳລັງຜະລິດ"}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <Link
                        href={`/orders/${order.id}/edit`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
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
    </div>
  );
}