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
  order_date: string; // YYYY-MM-DD
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

  // Filters
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const [status, setStatus] = useState<StatusFilter>("all");
  const [prefix, setPrefix] = useState<Prefix | "ALL">("ALL");
  const [query, setQuery] = useState("");

  // Pagination
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

    // Date range
    if (fromDate) q = q.gte("order_date", fromDate);
    if (toDate) q = q.lte("order_date", toDate);

    // Status
    if (status !== "all") q = q.eq("status", status);

    // Prefix
    if (prefix !== "ALL") q = q.ilike("order_code", `${prefix}%`);

    // Search: order_code OR factory_bill_code OR customer_phone
    const s = query.trim();
    if (s) {
      const escaped = s.replace(/%/g, "\\%").replace(/_/g, "\\_");
      q = q.or(
        `order_code.ilike.%${escaped}%,factory_bill_code.ilike.%${escaped}%,customer_phone.ilike.%${escaped}%`
      );
    }

    // Pagination range
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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

  const markCompleted = async (id: string) => {
    setErr(null);

    // โชว์ข้อความเตือน
    const ok = confirm("ຢືນຢັນ: ປິດງານ (Completed)?\n* ຕ້ອງ Balance = 0 ກ່ອນ");
    if (!ok) return;

    const { error } = await supabase
      .from("orders")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      // ถ้า balance ยังไม่ 0 DB จะ reject ตาม constraint
      setErr(error.message);
      return;
    }

    await load();
  };

  const statusBadge = (s: OrderRow["status"]) =>
    s === "completed" ? (
      <span className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-semibold">
        ສຳເລັດແລ້ວ
      </span>
    ) : (
      <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800 text-xs font-semibold">
        ກຳລັງຜະລິດ
      </span>
    );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">ອໍເດີ້</h1>

        <Link
          href="/orders/new"
          className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-700"
        >
          + ເພີ່ມອໍເດີ້
        </Link>
      </div>

      {err && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
          Error: {err}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded shadow mb-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div>
            <label className="text-xs font-semibold text-gray-600">ຈາກວັນທີ</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">ຫາວັນທີ</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">ສະຖານະ</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="all">ທັງໝົດ</option>
              <option value="in_progress">ກຳລັງຜະລິດ</option>
              <option value="completed">ສຳເລັດແລ້ວ</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">ກຸ່ມລະຫັດ</label>
            <select
              value={prefix}
              onChange={(e) => setPrefix(e.target.value as any)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="ALL">ທັງໝົດ</option>
              {PREFIXES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-gray-600">ຄົ້ນຫາ</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ລະຫັດອໍເດີ້ / ບິນໂຮງງານ / ເບີໂທ"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-2 md:col-span-6">
            <button
              onClick={runSearch}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700"
            >
              ຄົ້ນຫາ
            </button>
            <button
              onClick={resetAll}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm font-semibold hover:bg-gray-300"
            >
              ລ້າງ
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded shadow overflow-hidden">
        <div className="p-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-700">ລາຍການອໍເດີ້</div>
          <div className="text-sm text-gray-500">{loading ? "ກຳລັງໂຫຼດ..." : `ສະແດງ ${rows.length}`}</div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="p-3 text-left">ວັນທີ</th>
              <th className="p-3 text-left">ລະຫັດອໍເດີ້</th>
              <th className="p-3 text-left">ບິນໂຮງງານ</th>
              <th className="p-3 text-left">ເບີໂທ</th>
              <th className="p-3 text-left">ຜ້າ</th>
              <th className="p-3 text-right">ຍອດສຸດທິ</th>
              <th className="p-3 text-right">ຈ່າຍແລ້ວ</th>
              <th className="p-3 text-right">ຄ້າງ</th>
              <th className="p-3 text-right">ຕົ້ນທຶນໂຮງງານ</th>
              <th className="p-3 text-center">ສະຖານະ</th>
              <th className="p-3 text-center">ຈັດການ</th>
            </tr>
          </thead>

          <tbody>
            {!loading && rows.length === 0 ? (
              <tr className="border-t">
                <td className="p-4 text-gray-500" colSpan={11}>
                  ບໍ່ພົບຂໍ້ມູນ
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.order_date}</td>
                  <td className="p-3 font-semibold">{r.order_code}</td>
                  <td className="p-3 text-gray-600">{r.factory_bill_code?.trim() ? r.factory_bill_code : "—"}</td>
                  <td className="p-3">{r.customer_phone ?? "—"}</td>
                  <td className="p-3">{r.fabric_name}</td>

                  <td className="p-3 text-right">{r.net_total.toLocaleString()}</td>
                  <td className="p-3 text-right text-green-700 font-semibold">{r.initial_deposit.toLocaleString()}</td>
                  <td className="p-3 text-right text-red-600 font-semibold">{r.balance.toLocaleString()}</td>
                  <td className="p-3 text-right">{r.factory_cost.toLocaleString()}</td>

                  <td className="p-3 text-center">{statusBadge(r.status)}</td>

                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-3">
                      <Link href={`/orders/${r.id}/edit`} className="text-blue-600 font-semibold hover:underline">
                        ແກ້ໄຂ
                      </Link>

                      {r.status !== "completed" && (
                        <button
                          onClick={() => markCompleted(r.id)}
                          className="text-green-700 font-semibold hover:underline"
                          title="ປິດງານ (Completed)"
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

        {/* Pagination simple */}
        <div className="p-3 flex items-center justify-between border-t">
          <div className="text-xs text-gray-500">ໜ້າ: {page}</div>
          <div className="flex gap-2">
            <button
              className="border px-3 py-1 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ກ່ອນໜ້າ
            </button>
            <button
              className="border px-3 py-1 rounded text-sm hover:bg-gray-50"
              onClick={() => setPage((p) => p + 1)}
            >
              ຖັດໄປ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
