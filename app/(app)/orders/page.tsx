"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const PREFIXES = ["PKF26", "PKLF26", "MKF26", "MKLF26", "PMF26", "PMLF26", "MMF26", "MMLF26"] as const;
type Prefix = (typeof PREFIXES)[number];

type StatusFilter = "all" | "in_progress" | "completed";

type OrderRow = {
  id: string;
  order_code: string;
  order_date: string;
  customer_phone: string | null;
  factory_bill_code: string | null;
  fabric_name: string;
  net_total: number;
  initial_deposit: number;
  balance: number;
  factory_cost: number;
  status: "in_progress" | "completed";
  updated_at: string;
};

export default function OrdersPage() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [prefix, setPrefix] = useState<Prefix | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = async () => {
    setLoading(true);
    setErr(null);

    let q = supabase
      .from("orders")
      .select(
        "id,order_code,order_date,customer_phone,factory_bill_code,fabric_name,net_total,initial_deposit,balance,factory_cost,status,updated_at",
        { count: "exact" }
      )
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (fromDate) q = q.gte("order_date", fromDate);
    if (toDate) q = q.lte("order_date", toDate);
    if (status !== "all") q = q.eq("status", status);
    if (prefix !== "ALL") q = q.ilike("order_code", `${prefix}%`);

    const s = query.trim();
    if (s) {
      const escaped = s.replace(/%/g, "\\%").replace(/_/g, "\\_");
      q = q.or(
        `order_code.ilike.%${escaped}%,factory_bill_code.ilike.%${escaped}%,customer_phone.ilike.%${escaped}%`
      );
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    q = q.range(from, to);

    const { data, error } = await q;
    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as OrderRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [page]);

  const allSelectedOnPage = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.every((r) => selectedIds.includes(r.id));
  }, [rows, selectedIds]);

  const runSearch = () => {
    setPage(1);
    load();
  };

  const resetAll = () => {
    setFromDate("");
    setToDate("");
    setStatus("all");
    setPrefix("ALL");
    setQuery("");
    setPage(1);
    setTimeout(load, 0);
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllOnPage = () => {
    const pageIds = rows.map((r) => r.id);
    setSelectedIds((prev) => {
      if (pageIds.every((id) => prev.includes(id))) {
        return prev.filter((id) => !pageIds.includes(id));
      }
      return [...new Set([...prev, ...pageIds])];
    });
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const ok = confirm(`ຢືນຢັນລົບ ${selectedIds.length} ອໍເດີ?`);
    if (!ok) return;

    setDeleting(true);
    setErr(null);
    const { error } = await supabase.from("orders").delete().in("id", selectedIds);
    setDeleting(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSelectedIds([]);
    await load();
  };

  const markCompleted = async (id: string) => {
    setErr(null);
    const ok = confirm("ຢືນຢັນປິດງານ? (Completed)\n* ຕ້ອງໃຫ້ຍອດຄ້າງ = 0 ກ່ອນ");
    if (!ok) return;

    const { error } = await supabase
      .from("orders")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      setErr(error.message);
      return;
    }
    await load();
  };

  const statusBadge = (s: OrderRow["status"]) =>
    s === "completed" ? (
      <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
        ສຳເລັດແລ້ວ
      </span>
    ) : (
      <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">
        ກຳລັງຜະລິດ
      </span>
    );

  return (
    <div className="text-slate-900 antialiased">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">ອໍເດີ</h1>
        <Link
          href="/orders/new"
          className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-md transition-all active:scale-95"
        >
          + ເພີ່ມອໍເດີ
        </Link>
      </div>

      {err && (
        <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-sm font-medium">
          ຂໍ້ຜິດພາດ: {err}
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ຈາກວັນທີ</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ຫາວັນທີ</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ສະຖານະ</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
            >
              <option value="all">ທັງໝົດ</option>
              <option value="in_progress">ກຳລັງຜະລິດ</option>
              <option value="completed">ສຳເລັດແລ້ວ</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ກຸ່ມລະຫັດ</label>
            <select
              value={prefix}
              onChange={(e) => setPrefix(e.target.value as Prefix | "ALL")}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
            >
              <option value="ALL">ທັງໝົດ</option>
              {PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">ຄົ້ນຫາ</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ລະຫັດ / ບິນ / ເບີໂທ"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder-slate-300"
            />
          </div>
          <div className="flex gap-2 md:col-span-6 mt-2">
            <button
              onClick={runSearch}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
            >
              ຄົ້ນຫາ
            </button>
            <button
              onClick={resetAll}
              className="bg-slate-100 text-slate-600 px-6 py-2 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors border border-slate-200"
            >
              ລ້າງ
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 flex items-center justify-between border-b border-slate-50 bg-slate-50/50">
          <div className="text-sm font-bold text-slate-700 uppercase tracking-widest">ລາຍການອໍເດີທັງໝົດ</div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-500 font-bold">{loading ? "ກຳລັງໂຫຼດ..." : `ສະແດງ ${rows.length} ລາຍການ`}</div>
            <button
              onClick={deleteSelected}
              disabled={deleting || selectedIds.length === 0}
              className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? "ກຳລັງລົບ..." : `ລົບທີ່ເລືອກ (${selectedIds.length})`}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-slate-700 border-b border-slate-100">
                <th className="p-4 text-center font-bold uppercase text-[14px] tracking-widest">
                  <input type="checkbox" checked={allSelectedOnPage} onChange={toggleSelectAllOnPage} aria-label="select all on page" />
                </th>
                <th className="p-4 text-left font-bold uppercase text-[14px] tracking-widest">ວັນທີ</th>
                <th className="p-4 text-left font-bold uppercase text-[14px] tracking-widest">ລະຫັດອໍເດີ</th>
                <th className="p-4 text-left font-bold uppercase text-[14px] tracking-widest">ບິນໂຮງງານ</th>
                <th className="p-4 text-left font-bold uppercase text-[14px] tracking-widest">ເບີໂທ</th>
                <th className="p-4 text-left font-bold uppercase text-[14px] tracking-widest">ຜ້າ</th>
                <th className="p-4 text-right font-bold uppercase text-[14px] tracking-widest">ຍອດສຸດທິ</th>
                <th className="p-4 text-right font-bold uppercase text-[14px] tracking-widest">ຄ້າງ</th>
                <th className="p-4 text-center font-bold uppercase text-[14px] tracking-widest">ສະຖານະ</th>
                <th className="p-4 text-center font-bold uppercase text-[14px] tracking-widest">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="p-10 text-slate-400 text-center font-medium" colSpan={10}>
                    ບໍ່ພົບຂໍ້ມູນໃນລະບົບ
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="p-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(r.id)}
                        onChange={() => toggleSelectRow(r.id)}
                        aria-label={`select ${r.order_code}`}
                      />
                    </td>
                    <td className="p-4 text-slate-600 font-medium">{r.order_date}</td>
                    <td className="p-4 font-bold text-slate-600">{r.order_code}</td>
                    <td className="p-4 text-slate-500">{r.factory_bill_code?.trim() ? r.factory_bill_code : "-"}</td>
                    <td className="p-4 font-semibold text-slate-700">{r.customer_phone ?? "-"}</td>
                    <td className="p-4 text-slate-600 font-medium">{r.fabric_name}</td>
                    <td className="p-4 text-right font-bold text-slate-600">{r.net_total.toLocaleString()}</td>
                    <td className="p-4 text-right font-bold text-rose-600 bg-rose-50/30">{r.balance.toLocaleString()}</td>
                    <td className="p-4 text-center">{statusBadge(r.status)}</td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-4">
                        <Link href={`/orders/${r.id}/edit`} className="text-blue-600 font-bold hover:text-blue-800 underline-offset-4 hover:underline transition-all">
                          ແກ້ໄຂ
                        </Link>
                        {r.status !== "completed" && (
                          <button
                            onClick={() => markCompleted(r.id)}
                            className="text-emerald-600 font-bold hover:text-emerald-800 transition-all active:scale-90"
                          >
                            ປິດງານ
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 flex items-center justify-between border-t border-slate-100 bg-slate-50/30">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-tighter">ໜ້າທີ: {page}</div>
          <div className="flex gap-2">
            <button
              className="bg-white border border-slate-200 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 disabled:opacity-40 transition-all shadow-sm text-slate-600"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← ກ່ອນໜ້າ
            </button>
            <button
              className="bg-white border border-slate-200 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all shadow-sm text-slate-600"
              onClick={() => setPage((p) => p + 1)}
            >
              ຖັດໄປ →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

