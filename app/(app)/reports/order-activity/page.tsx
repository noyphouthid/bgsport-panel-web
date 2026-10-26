"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ORDER_ACTIVITY_ACTION_LABELS as ACTION_LABELS, getOrderActivityDetail } from "@/lib/order-activity";
import type { AppRole } from "@/lib/access-control";
import { OrderActivityTimeline, getActivityDateKey } from "../../_components/order-activity-timeline";

type ActivityRow = {
  id: string;
  action: string;
  detail: string | null;
  action_at: string;
  action_meta: unknown;
  action_by_user_id: string | null;
  order?: { id: string; order_code: string } | null;
  actor?: { id: string; full_name: string; role: AppRole } | null;
};

type UserOption = {
  id: string;
  full_name: string;
  role: AppRole;
};

export default function OrderActivityReportPage() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [actorFilter, setActorFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErr(null);
      const [{ data: historyData, error: historyError }, { data: userData, error: userError }] = await Promise.all([
        supabase
          .from("order_status_history")
          .select("id,action,detail,action_at,action_meta,action_by_user_id,order:orders!order_status_history_order_id_fkey(id,order_code),actor:users!order_status_history_action_by_user_id_fkey(id,full_name,role)")
          .order("action_at", { ascending: false })
          .limit(1000),
        supabase.from("users").select("id,full_name,role").eq("is_active", true).order("full_name"),
      ]);

      if (!active) return;
      if (historyError || userError) {
        setErr(historyError?.message || userError?.message || "load_order_activity_failed");
        setLoading(false);
        return;
      }

      setRows((historyData ?? []).map((row) => {
        const item = row as ActivityRow & { order?: ActivityRow["order"] | ActivityRow["order"][]; actor?: ActivityRow["actor"] | ActivityRow["actor"][] };
        return {
          ...item,
          order: Array.isArray(item.order) ? item.order[0] || null : item.order || null,
          actor: Array.isArray(item.actor) ? item.actor[0] || null : item.actor || null,
        };
      }));
      setUsers((userData ?? []) as UserOption[]);
      setLoading(false);
    };

    void load();
    return () => { active = false; };
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (actorFilter !== "all" && row.action_by_user_id !== actorFilter) return false;
      if (actionFilter !== "all" && row.action !== actionFilter) return false;
      const date = getActivityDateKey(row.action_at);
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      if (!query) return true;
      return [row.order?.order_code, row.actor?.full_name, row.actor?.id, row.action, row.detail, ACTION_LABELS[row.action], getOrderActivityDetail(row.detail)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [actionFilter, actorFilter, fromDate, rows, search, toDate]);

  const summary = useMemo(() => {
    const editors = new Set(filteredRows.map((row) => row.action_by_user_id).filter(Boolean));
    const orders = new Set(filteredRows.map((row) => row.order?.id).filter(Boolean));
    return { activities: filteredRows.length, editors: editors.size, orders: orders.size };
  }, [filteredRows]);

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><History size={26} /> ປະຫວັດການເຄື່ອນໄຫວອໍເດີ</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">ຕິດຕາມຜູ້ດຳເນີນການ ແລະ ລາຍລະອຽດການປ່ຽນແປງ ຕາມລຳດັບເວລາ</p>
      </div>

      {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

      <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <select aria-label="ຜູ້ດຳເນີນການ" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} className="min-w-0 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
            <option value="all">ID ຜູ້ດຳເນີນການທັງໝົດ</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.full_name} ({user.id.slice(0, 8)})</option>)}
          </select>
          <select aria-label="ປະເພດກິດຈະກຳ" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="min-w-0 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
            <option value="all">ການດຳເນີນການທັງໝົດ</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="min-w-0 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" aria-label="ຈາກວັນທີ" />
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="min-w-0 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" aria-label="ເຖິງວັນທີ" />
          <label className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 sm:col-span-2 xl:col-span-1">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ອໍເດີ, ID, ຊື່..." className="min-w-0 flex-1 outline-none" />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-violet-50 p-3"><div className="text-xs font-bold text-violet-700">ລາຍການເຄື່ອນໄຫວ</div><div className="text-2xl font-black text-violet-900">{summary.activities.toLocaleString()}</div></div>
          <div className="rounded-xl bg-sky-50 p-3"><div className="text-xs font-bold text-sky-700">ຈຳນວນ ID ຜູ້ດຳເນີນການ</div><div className="text-2xl font-black text-sky-900">{summary.editors.toLocaleString()}</div></div>
          <div className="rounded-xl bg-emerald-50 p-3"><div className="text-xs font-bold text-emerald-700">ຈຳນວນອໍເດີ</div><div className="text-2xl font-black text-emerald-900">{summary.orders.toLocaleString()}</div></div>
        </div>
      </div>

      <OrderActivityTimeline
        key={[actorFilter, actionFilter, fromDate, toDate, search].join("|")}
        title="ລາຍການກິດຈະກຳ"
        showActionFilter={false}
        loading={loading}
        items={filteredRows.map(row => ({
          ...row,
          actor_name: row.actor?.full_name,
          actor_role: row.actor?.role,
          actor_id: row.action_by_user_id,
        }))}
        pageSize={20}
      />
    </div>
  );
}
