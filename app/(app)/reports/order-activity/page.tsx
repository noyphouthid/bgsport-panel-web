"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { History, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";

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

type ChangedField = {
  label: string;
  before: string;
  after: string;
};

const ACTION_LABELS: Record<string, string> = {
  create_order: "ສ້າງອໍເດີ",
  update_order: "ແກ້ໄຂອໍເດີ",
  receive_customer_payment: "ຮັບເງິນລູກຄ້າ",
  pay_factory: "ຈ່າຍເງິນໂຮງງານ",
  production_completed: "ຜະລິດສຳເລັດ",
  close_order: "ປິດອໍເດີ",
  reopen_order: "ເປີດອໍເດີຄືນ",
  cancel_factory_receipt: "ຍົກເລີກນຳເຂົ້າ",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB");
}

function parseActivityMeta(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { changedFields: [] as ChangedField[], summaryLines: [] as string[] };
  }

  const meta = value as { changed_fields?: unknown; summary_lines?: unknown };
  const changedFields = Array.isArray(meta.changed_fields)
    ? meta.changed_fields.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const field = item as Record<string, unknown>;
        return [{
          label: typeof field.label === "string" ? field.label : "ຟິວບໍ່ລະບຸ",
          before: typeof field.before === "string" ? field.before : "-",
          after: typeof field.after === "string" ? field.after : "-",
        }];
      })
    : [];
  const summaryLines = Array.isArray(meta.summary_lines)
    ? meta.summary_lines.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return { changedFields, summaryLines };
}

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
      const date = row.action_at.slice(0, 10);
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      if (!query) return true;
      return [row.order?.order_code, row.actor?.full_name, row.actor?.id, row.action, row.detail]
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
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><History size={26} /> Statement ການເຄື່ອນໄຫວອໍເດີ</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">ເບິ່ງວ່າ ID ໃດແກ້ໄຂອໍເດີໃດ, ແກ້ໄຂຫຍັງ ແລະ ເມື່ອໃດ</p>
      </div>

      {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">ຂໍ້ຜິດພາດ: {err}</div> : null}

      <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <select value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
            <option value="all">ID ຜູ້ດຳເນີນການທັງໝົດ</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.full_name} ({user.id.slice(0, 8)})</option>)}
          </select>
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
            <option value="all">ການດຳເນີນການທັງໝົດ</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" aria-label="ຈາກວັນທີ" />
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" aria-label="ເຖິງວັນທີ" />
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600">
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

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b bg-slate-50 p-4 text-sm font-black text-slate-800">ລາຍການ Statement ({filteredRows.length.toLocaleString()})</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-slate-700"><tr>
              <th className="p-3 text-left text-xs font-black">ເວລາ</th><th className="p-3 text-left text-xs font-black">ID / ຜູ້ແກ້</th><th className="p-3 text-left text-xs font-black">ອໍເດີ</th><th className="p-3 text-left text-xs font-black">ການດຳເນີນງານ</th><th className="p-3 text-left text-xs font-black">ລາຍລະອຽດການປ່ຽນແປງ</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && filteredRows.length === 0 ? <tr><td colSpan={5} className="p-10 text-center font-bold text-slate-500">ບໍ່ມີຂໍ້ມູນ statement</td></tr> : null}
              {filteredRows.map((row) => {
                const meta = parseActivityMeta(row.action_meta);
                return <tr key={row.id} className="align-top">
                  <td className="p-3 whitespace-nowrap font-medium text-slate-600">{formatDateTime(row.action_at)}</td>
                  <td className="p-3"><div className="font-black">{row.actor?.full_name || "ບໍ່ຮູ້ຜູ້ດຳເນີນການ"}</div><div className="mt-1 font-mono text-[11px] text-slate-500">{row.action_by_user_id || "-"}</div></td>
                  <td className="p-3 font-black text-blue-700">{row.order ? <Link href={`/orders/${row.order.id}/edit`} className="hover:underline">{row.order.order_code}</Link> : "-"}</td>
                  <td className="p-3"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700">{ACTION_LABELS[row.action] || row.action}</span></td>
                  <td className="p-3"><div className="space-y-1.5 text-slate-700">{row.detail ? <div>{row.detail}</div> : null}{meta.summaryLines.map((line, index) => <div key={index} className="text-xs font-medium">{line}</div>)}{meta.changedFields.map((field, index) => <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"><span className="font-black">{field.label}: </span><span className="text-slate-500">{field.before}</span><span className="mx-1 text-slate-400">→</span><span className="font-bold text-slate-800">{field.after}</span></div>)}</div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
