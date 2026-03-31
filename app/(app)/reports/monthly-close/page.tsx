"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { Download, Lock, RefreshCcw, TrendingUp, Wallet, Boxes, Unlock, ReceiptText } from "lucide-react";
import { supabase } from "@/lib/supabase";

type OrderRow = {
  id: string;
  order_code: string;
  order_date: string;
  status: "in_progress" | "completed";
  shipment_completed_at: string | null;
  net_total: number;
  factory_cost: number;
  balance: number;
};

type MonthlyClosingRow = {
  id: string;
  month_key: string;
  start_date: string;
  end_date: string;
  total_sales: number;
  total_cost: number;
  total_profit: number;
  total_orders: number;
  completed_orders: number;
  outstanding_balance: number;
  status: "draft" | "closed";
  notes: string | null;
  closed_at: string | null;
  closed_by_name: string | null;
};

function monthKeyOf(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthDateRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(year, month, 0);
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return { start, endDate };
}

function formatMoney(value: number) {
  return `₭ ${Number(value || 0).toLocaleString("en-US")}`;
}

export default function MonthlyClosePage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [historyRows, setHistoryRows] = useState<MonthlyClosingRow[]>([]);
  const [notes, setNotes] = useState("");
  const [viewerName, setViewerName] = useState("");
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const monthKey = monthKeyOf(year, month);
  const range = monthDateRange(year, month);

  const currentClosing = useMemo(
    () => historyRows.find((item) => item.month_key === monthKey) ?? null,
    [historyRows, monthKey]
  );

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => order.order_date >= range.start && order.order_date <= range.endDate);
  }, [orders, range.endDate, range.start]);

  const summary = useMemo(() => {
    const totalSales = filteredOrders.reduce((sum, row) => sum + (Number(row.net_total) || 0), 0);
    const totalCost = filteredOrders.reduce((sum, row) => sum + (Number(row.factory_cost) || 0), 0);
    const totalProfit = totalSales - totalCost;
    const totalOrders = filteredOrders.length;
    const completedOrders = filteredOrders.filter((row) => Boolean(row.shipment_completed_at)).length;
    const outstandingBalance = filteredOrders.reduce((sum, row) => sum + (Number(row.balance) || 0), 0);
    const outstandingOrders = filteredOrders.filter((row) => Number(row.balance) > 0).length;

    const deliveredInMonth = orders.filter(
      (row) => row.shipment_completed_at && row.shipment_completed_at >= `${range.start}T00:00:00` && row.shipment_completed_at <= `${range.endDate}T23:59:59`
    );
    const recognizedProfit = deliveredInMonth.reduce(
      (sum, row) => sum + ((Number(row.net_total) || 0) - (Number(row.factory_cost) || 0)),
      0
    );

    return {
      totalSales,
      totalCost,
      totalProfit,
      totalOrders,
      completedOrders,
      outstandingBalance,
      outstandingOrders,
      recognizedProfit,
    };
  }, [filteredOrders, orders, range.endDate, range.start]);

  const loadPage = async () => {
    setLoading(true);
    setErrorMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id;

    const tasks = [
      supabase
        .from("orders")
        .select("id,order_code,order_date,status,shipment_completed_at,net_total,factory_cost,balance")
        .order("order_date", { ascending: false }),
      supabase
        .from("monthly_closings")
        .select("id,month_key,start_date,end_date,total_sales,total_cost,total_profit,total_orders,completed_orders,outstanding_balance,status,notes,closed_at,closed_by_name")
        .order("month_key", { ascending: false }),
    ] as const;

    const [ordersResult, historyResult, userResult] = await Promise.all([
      tasks[0],
      tasks[1],
      authUserId
        ? supabase.from("users").select("id,full_name").eq("auth_user_id", authUserId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (ordersResult.error) {
      setErrorMessage(ordersResult.error.message);
      setOrders([]);
      setHistoryRows([]);
      setLoading(false);
      return;
    }

    if (historyResult.error) {
      const tableMissing = historyResult.error.message.includes("Could not find the table");
      setErrorMessage(
        tableMissing
          ? "ຍັງບໍ່ພົບຕາຕະລາງ monthly_closings ກະລຸນາລັນ migration 20260331_create_monthly_closings.sql ກ່ອນ"
          : historyResult.error.message
      );
      setOrders((ordersResult.data ?? []) as OrderRow[]);
      setHistoryRows([]);
      setLoading(false);
      return;
    }

    setOrders((ordersResult.data ?? []) as OrderRow[]);
    const nextHistoryRows = (historyResult.data ?? []) as MonthlyClosingRow[];
    setHistoryRows(nextHistoryRows);
    setViewerName(String(userResult.data?.full_name || ""));
    setViewerUserId(userResult.data?.id ? String(userResult.data.id) : null);
    setNotes(nextHistoryRows.find((item) => item.month_key === monthKeyOf(year, month))?.notes || "");
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPage();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMonthChange = (value: number) => {
    setMonth(value);
    const nextMonthKey = monthKeyOf(year, value);
    setNotes(historyRows.find((item) => item.month_key === nextMonthKey)?.notes || "");
  };

  const handleYearChange = (value: number) => {
    setYear(value);
    const nextMonthKey = monthKeyOf(value, month);
    setNotes(historyRows.find((item) => item.month_key === nextMonthKey)?.notes || "");
  };

  const handleCloseMonth = async () => {
    if (filteredOrders.length === 0) {
      toast.error("ບໍ່ມີອໍເດີ້ໃນເດືອນນີ້");
      return;
    }

    setSaving(true);
    const payload = {
      month_key: monthKey,
      start_date: range.start,
      end_date: range.endDate,
      total_sales: summary.totalSales,
      total_cost: summary.totalCost,
      total_profit: summary.totalProfit,
      total_orders: summary.totalOrders,
      completed_orders: summary.completedOrders,
      outstanding_balance: summary.outstandingBalance,
      status: "closed" as const,
      notes: notes.trim() || null,
      closed_at: new Date().toISOString(),
      closed_by_user_id: viewerUserId,
      closed_by_name: viewerName || null,
      summary_snapshot: {
        orders: filteredOrders.map((row) => ({
          id: row.id,
          order_code: row.order_code,
          order_date: row.order_date,
          status: row.status,
          net_total: Number(row.net_total) || 0,
          factory_cost: Number(row.factory_cost) || 0,
          balance: Number(row.balance) || 0,
        })),
      },
    };

    const { error } = await supabase.from("monthly_closings").upsert(payload, { onConflict: "month_key" });
    setSaving(false);

    if (error) {
      toast.error(`ປິດຍອດບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    toast.success(`ປິດຍອດເດືອນ ${monthKey} ແລ້ວ`);
    await loadPage();
  };

  const handleReopenMonth = async () => {
    if (!currentClosing) return;
    setSaving(true);
    const { error } = await supabase
      .from("monthly_closings")
      .update({
        status: "draft",
        notes: notes.trim() || null,
      })
      .eq("id", currentClosing.id);
    setSaving(false);

    if (error) {
      toast.error(`ເປີດເດືອນຄືນບໍ່ສຳເລັດ: ${error.message}`);
      return;
    }

    toast.success(`ເປີດເດືອນ ${monthKey} ຄືນແລ້ວ`);
    await loadPage();
  };

  const exportExcel = () => {
    const exportRows = filteredOrders.map((row) => ({
      "ເດືອນ": monthKey,
      "ວັນທີສັ່ງ": row.order_date,
      "ລະຫັດອໍເດີ້": row.order_code,
      "ສົ່ງມອບສຳເລັດ": row.shipment_completed_at ? new Date(row.shipment_completed_at).toISOString().slice(0, 10) : "-",
      "ສະຖານະ": row.shipment_completed_at ? "ສົ່ງມອບສຳເລັດ" : "ຍັງບໍ່ສົ່ງມອບ",
      "ຍອດຂາຍ": Number(row.net_total) || 0,
      "ຕົ້ນທຶນ": Number(row.factory_cost) || 0,
      "ກຳໄລ": (Number(row.net_total) || 0) - (Number(row.factory_cost) || 0),
      "ຄ້າງຊຳລະ": Number(row.balance) || 0,
    }));

    exportRows.push({
      "ເດືອນ": monthKey,
      "ວັນທີສັ່ງ": "ສະຫຼຸບ",
      "ລະຫັດອໍເດີ້": `${summary.totalOrders} ອໍເດີ້`,
      "ສົ່ງມອບສຳເລັດ": `${summary.completedOrders} ອໍເດີ້`,
      "ສະຖານະ": `${summary.outstandingOrders} ອໍເດີ້ຄ້າງ`,
      "ຍອດຂາຍ": summary.totalSales,
      "ຕົ້ນທຶນ": summary.totalCost,
      "ກຳໄລ": summary.recognizedProfit,
      "ຄ້າງຊຳລະ": summary.outstandingBalance,
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "monthly_close");
    XLSX.writeFile(wb, `monthly-close-${monthKey}.xlsx`);
  };

  const exportPdf = () => {
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      toast.error("ບໍ່ສາມາດເປີດໜ້າ PDF ໄດ້");
      return;
    }

    const rowsHtml = filteredOrders
      .map(
        (row) => `
          <tr>
            <td>${row.order_date}</td>
            <td>${row.order_code}</td>
            <td>${row.shipment_completed_at ? "ສົ່ງມອບສຳເລັດ" : "ຍັງບໍ່ສົ່ງມອບ"}</td>
            <td style="text-align:right">${Number(row.net_total || 0).toLocaleString("en-US")}</td>
            <td style="text-align:right">${Number(row.factory_cost || 0).toLocaleString("en-US")}</td>
            <td style="text-align:right">${(Number(row.net_total || 0) - Number(row.factory_cost || 0)).toLocaleString("en-US")}</td>
            <td style="text-align:right">${Number(row.balance || 0).toLocaleString("en-US")}</td>
          </tr>
        `
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>monthly-close-${monthKey}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 8px; font-size: 24px; }
            p { margin: 0 0 16px; color: #475569; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
            .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
            .label { font-size: 12px; color: #64748b; margin-bottom: 8px; }
            .value { font-size: 20px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; font-size: 12px; }
            th { background: #f8fafc; text-align: left; }
          </style>
        </head>
        <body>
          <h1>ປິດຍອດຂາຍ-ກຳໄລປະຈໍາເດືອນ</h1>
          <p>ເດືອນ ${monthKey}</p>
          <div class="grid">
            <div class="card"><div class="label">ຍອດຂາຍລວມ</div><div class="value">${formatMoney(summary.totalSales)}</div></div>
            <div class="card"><div class="label">ກຳໄລໃນເດືອນ</div><div class="value">${formatMoney(summary.recognizedProfit)}</div></div>
            <div class="card"><div class="label">ຈຳນວນອໍເດີ້</div><div class="value">${summary.totalOrders}</div></div>
            <div class="card"><div class="label">ອໍເດີ້ຄ້າງຊຳລະ</div><div class="value">${summary.outstandingOrders}</div></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>ລະຫັດອໍເດີ້</th>
                <th>ສະຖານະສົ່ງມອບ</th>
                <th>ຍອດຂາຍ</th>
                <th>ຕົ້ນທຶນ</th>
                <th>ກຳໄລ</th>
                <th>ຄ້າງຊຳລະ</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const yearOptions = Array.from({ length: 6 }, (_, index) => now.getFullYear() - 3 + index);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ປິດຍອດຂາຍ-ກຳໄລປະຈໍາເດືອນ</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            ສ່ວນນີ້ແມ່ນສຳລັບ `ຍອດຂາຍ / ກຳໄລ / ຈຳນວນອໍເດີ້` ແລະ ປະຫວັດການປິດຍອດຝັ່ງຂາຍ
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={month}
            onChange={(event) => handleMonthChange(Number(event.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-400"
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                ເດືອນ {value}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(event) => handleYearChange(Number(event.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-400"
          >
            {yearOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <button
            onClick={() => void loadPage()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            <RefreshCcw size={16} />
            ໂຫຼດຄືນ
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="ຍອດຂາຍລວມ" value={formatMoney(summary.totalSales)} icon={<Wallet size={20} />} tone="bg-emerald-100 text-emerald-700" />
        <MetricCard title="ກຳໄລໃນເດືອນ" value={formatMoney(summary.recognizedProfit)} icon={<TrendingUp size={20} />} tone="bg-sky-100 text-sky-700" />
        <MetricCard title="ຈຳນວນອໍເດີ້" value={String(summary.totalOrders)} icon={<Boxes size={20} />} tone="bg-amber-100 text-amber-700" />
        <MetricCard title="ອໍເດີ້ຄ້າງຊຳລະ" value={`${summary.outstandingOrders} ອໍເດີ້`} icon={<ReceiptText size={20} />} tone="bg-rose-100 text-rose-700" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">ຂໍ້ມູນກ່ອນປິດຍອດ</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                ໄລຍະ {range.start} ຫາ {range.endDate}
              </p>
            </div>
            {currentClosing?.status === "closed" ? (
              <button
                onClick={handleReopenMonth}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <Unlock size={16} />
                ເປີດຍອດຄືນ
              </button>
            ) : (
              <button
                onClick={handleCloseMonth}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Lock size={16} />
                {saving ? "ກຳລັງປິດຍອດ..." : "ປິດຍອດເດືອນ"}
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={exportExcel}
              disabled={filteredOrders.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              <Download size={16} />
              Export Excel
            </button>
            <button
              onClick={exportPdf}
              disabled={filteredOrders.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              <Download size={16} />
              Export PDF
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SmallStat label="ຕົ້ນທຶນລວມ" value={formatMoney(summary.totalCost)} />
            <SmallStat label="ອໍເດີ້ສົ່ງມອບສຳເລັດ" value={String(summary.completedOrders)} />
            <SmallStat label="ຍອດຄ້າງຮັບ" value={formatMoney(summary.outstandingBalance)} />
            <SmallStat label="ຜູ້ປິດຍອດຫຼ້າສຸດ" value={currentClosing?.closed_by_name || "-"} />
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">ໝາຍເຫດປິດຍອດ</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="ບັນທຶກເຫດຜົນ ຫຼື ຈຸດສັງເກດກ່ອນປິດຍອດ"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-400"
            />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">ປະຫວັດປິດຍອດ</h2>
          <div className="mt-4 space-y-3">
            {!loading && historyRows.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400">ຍັງບໍ່ມີປະຫວັດປິດຍອດ</div>
            ) : null}
            {historyRows.slice(0, 6).map((row) => (
              <div key={row.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="font-black text-slate-900">{row.month_key}</div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${row.status === "closed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {row.status === "closed" ? "ປິດຍອດແລ້ວ" : "ຮ່າງ"}
                  </span>
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-600">ຍອດຂາຍ {formatMoney(row.total_sales)} · ກຳໄລ {formatMoney(row.total_profit)}</div>
                <div className="mt-1 text-xs font-bold text-slate-400">
                  {row.closed_at ? `ປິດເມື່ອ ${new Date(row.closed_at).toLocaleString()}` : "ຍັງບໍ່ທັນປິດ"} · {row.closed_by_name || "-"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-900">ລາຍການອໍເດີ້ໃນເດືອນ</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">ອ້າງອີງຕາມ `order_date` ຂອງເດືອນທີ່ເລືອກ</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-bold">ວັນທີ</th>
                <th className="px-5 py-3 font-bold">ລະຫັດອໍເດີ້</th>
                <th className="px-5 py-3 font-bold">ສະຖານະ</th>
                <th className="px-5 py-3 font-bold text-right">ຍອດຂາຍ</th>
                <th className="px-5 py-3 font-bold text-right">ຕົ້ນທຶນ</th>
                <th className="px-5 py-3 font-bold text-right">ກຳໄລ</th>
                <th className="px-5 py-3 font-bold text-right">ຄ້າງຮັບ</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm font-bold text-slate-400">
                    ບໍ່ມີອໍເດີ້ໃນເດືອນນີ້
                  </td>
                </tr>
              ) : null}
              {filteredOrders.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-5 py-4 font-semibold text-slate-600">{row.order_date}</td>
                  <td className="px-5 py-4 font-black text-slate-900">{row.order_code}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${row.shipment_completed_at ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {row.shipment_completed_at ? "ສົ່ງມອບສຳເລັດ" : "ຍັງບໍ່ສົ່ງມອບ"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-slate-700">{formatMoney(row.net_total)}</td>
                  <td className="px-5 py-4 text-right font-bold text-slate-700">{formatMoney(row.factory_cost)}</td>
                  <td className="px-5 py-4 text-right font-black text-sky-700">{formatMoney((Number(row.net_total) || 0) - (Number(row.factory_cost) || 0))}</td>
                  <td className="px-5 py-4 text-right font-bold text-rose-600">{formatMoney(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-slate-500">{title}</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
        </div>
        <div className={`rounded-2xl p-3 ${tone}`}>{icon}</div>
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-black text-slate-900">{value}</div>
    </div>
  );
}
