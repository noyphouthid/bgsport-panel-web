"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";

type FactoryStatusFilter = "all" | "synced" | "not_synced" | "has_error";

type OrderRow = {
  id: string;
  order_code: string;
  order_date: string;
  factory_bill_code: string | null;
  customer_phone: string | null;
  fabric_name: string;
  status: "in_progress" | "completed";
  production_completed_at: string | null;
  factory_production_status: string | null;
  factory_production_status_index: number | null;
  factory_production_shipping_status: string | null;
  factory_production_due_date: string | null;
  factory_production_is_rush: boolean | null;
  factory_production_source_updated_at: string | null;
  factory_production_synced_at: string | null;
  factory_production_sync_error: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US");
}

function formatFactoryStatus(row: Pick<OrderRow, "factory_production_status" | "factory_production_status_index">) {
  const status = String(row.factory_production_status || "").trim();
  if (!status) return "-";
  const index = Number(row.factory_production_status_index || 0);
  return index > 0 ? `#${index} ${status}` : status;
}

export default function FactoryProductionStatusPage() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FactoryStatusFilter>("all");

  const load = async () => {
    setLoading(true);
    setErr(null);

    let request = supabase
      .from("orders")
      .select(
        "id,order_code,order_date,factory_bill_code,customer_phone,fabric_name,status,production_completed_at,factory_production_status,factory_production_status_index,factory_production_shipping_status,factory_production_due_date,factory_production_is_rush,factory_production_source_updated_at,factory_production_synced_at,factory_production_sync_error"
      )
      .not("factory_bill_code", "is", null)
      .neq("factory_bill_code", "")
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (fromDate) request = request.gte("order_date", fromDate);
    if (toDate) request = request.lte("order_date", toDate);

    const trimmedQuery = query.trim();
    if (trimmedQuery) {
      const escaped = trimmedQuery.replace(/%/g, "\\%").replace(/_/g, "\\_");
      request = request.or(
        `order_code.ilike.%${escaped}%,factory_bill_code.ilike.%${escaped}%,customer_phone.ilike.%${escaped}%,factory_production_status.ilike.%${escaped}%`
      );
    }

    const { data, error } = await request;
    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const filtered = ((data ?? []) as OrderRow[]).filter((row) => {
      const hasSynced = Boolean(row.factory_production_synced_at);
      const hasError = Boolean(row.factory_production_sync_error?.trim());
      if (statusFilter === "synced") return hasSynced && !hasError;
      if (statusFilter === "not_synced") return !hasSynced;
      if (statusFilter === "has_error") return hasError;
      return true;
    });

    setRows(filtered);
    setSelectedIds((prev) => prev.filter((id) => filtered.some((row) => row.id === id)));
    setLoading(false);
  };

  const resetFilters = () => {
    setFromDate("");
    setToDate("");
    setQuery("");
    setStatusFilter("all");
    setRows([]);
    setSelectedIds([]);
    setErr(null);
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const allSelected = useMemo(() => rows.length > 0 && rows.every((row) => selectedIds.includes(row.id)), [rows, selectedIds]);

  const toggleSelectAll = () => {
    const currentIds = rows.map((row) => row.id);
    setSelectedIds((prev) => {
      if (currentIds.every((id) => prev.includes(id))) {
        return prev.filter((id) => !currentIds.includes(id));
      }
      return [...new Set([...prev, ...currentIds])];
    });
  };

  const syncStatuses = async () => {
    setSyncing(true);
    setErr(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error("no_session");
      }

      const orderIds = selectedIds.length > 0 ? selectedIds : rows.map((row) => row.id);
      if (orderIds.length === 0) {
        toast("ບໍ່ມີລາຍການໃຫ້ sync");
        setSyncing(false);
        return;
      }

      const response = await fetch("/api/orders/factory-production/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderIds }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        syncedCount?: number;
        failedCount?: number;
      };
      if (!response.ok) {
        throw new Error(payload.error || "factory_sync_failed");
      }

      await load();
      const syncedCount = Number(payload.syncedCount || 0);
      const failedCount = Number(payload.failedCount || 0);
      if (syncedCount > 0) {
        toast.success(`ດຶງສະຖານະສຳເລັດ ${syncedCount} ລາຍການ`);
      } else {
        toast("ບໍ່ມີລາຍການທີ່ sync ສຳເລັດ");
      }
      if (failedCount > 0) {
        setErr(`Sync ບໍ່ສຳເລັດ ${failedCount} ລາຍການ`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "factory_sync_failed";
      setErr(message);
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">ສະຖານະໂຮງງານ</h1>
          <div className="text-sm font-medium text-slate-500">ຕິດຕາມຂັ້ນຕອນການຜະລິດຈາກໂຮງງານດ້ວຍ factory bill code</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={syncStatuses}
            disabled={syncing || loading || rows.length === 0}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
          >
            {syncing ? "ກຳລັງ sync..." : selectedIds.length > 0 ? `Sync ທີ່ເລືອກ (${selectedIds.length})` : "Sync ທັງໝົດ"}
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "ກຳລັງໂຫຼດ..." : "ຄົ້ນຫາ"}
          </button>
          <button
            onClick={resetFilters}
            className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
          >
            ລ້າງ
          </button>
        </div>
      </div>

      {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຈາກວັນທີ</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຫາວັນທີ</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ສະຖານະ sync</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FactoryStatusFilter)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">ທັງໝົດ</option>
              <option value="synced">Sync ແລ້ວ</option>
              <option value="not_synced">ຍັງບໍ່ sync</option>
              <option value="has_error">ມີ error</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ຄົ້ນຫາ</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="order code / factory bill / ເບີໂທ / ສະຖານະ"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 p-4">
          <div className="text-sm font-bold uppercase tracking-widest text-slate-700">ລາຍການສະຖານະໂຮງງານ</div>
          <div className="text-xs font-bold text-slate-500">{loading ? "ກຳລັງໂຫຼດ..." : `${rows.length} ລາຍການ`}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-700">
                <th className="p-4 text-center font-bold uppercase tracking-widest">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="select all" />
                </th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ວັນທີ</th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ອໍເດີ</th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ບິນໂຮງງານ</th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ສະຖານະໂຮງງານ</th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ອັບເດດ</th>
                <th className="p-4 text-left font-bold uppercase tracking-widest">ໝາຍເຫດ</th>
                <th className="p-4 text-center font-bold uppercase tracking-widest">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center font-medium text-slate-400">
                    ບໍ່ພົບລາຍການທີ່ມີບິນໂຮງງານ
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="p-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleSelectRow(row.id)}
                        aria-label={`select ${row.order_code}`}
                      />
                    </td>
                    <td className="p-4 font-medium text-slate-600">{row.order_date}</td>
                    <td className="p-4">
                      <div className="font-bold text-slate-800">{row.order_code}</div>
                      <div className="mt-1 text-xs text-slate-400">{row.fabric_name}</div>
                    </td>
                    <td className="p-4 font-semibold text-slate-700">{row.factory_bill_code?.trim() || "-"}</td>
                    <td className="p-4">
                      <div className="font-bold text-violet-700">{formatFactoryStatus(row)}</div>
                      <div className="mt-1 text-xs text-slate-500">ຂົນສົ່ງ: {row.factory_production_shipping_status?.trim() || "-"}</div>
                      <div className="mt-1 text-xs text-slate-500">ງານດ່ວນ: {row.factory_production_is_rush ? "ແມ່ນ" : "ບໍ່"}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-xs font-medium text-slate-600">ໂຮງງານ: {formatDateTime(row.factory_production_source_updated_at)}</div>
                      <div className="mt-1 text-xs font-medium text-slate-500">Sync: {formatDateTime(row.factory_production_synced_at)}</div>
                    </td>
                    <td className="p-4">
                      {row.factory_production_sync_error?.trim() ? (
                        <div className="text-xs font-bold text-rose-600">{row.factory_production_sync_error}</div>
                      ) : (
                        <div className="text-xs font-medium text-slate-500">ກຳນົດສົ່ງ: {formatDateTime(row.factory_production_due_date)}</div>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <Link href={`/orders/${row.id}/edit`} className="font-bold text-blue-600 hover:text-blue-800 hover:underline">
                        ເບິ່ງລາຍລະອຽດ
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
