"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Activity, ArrowDown, ArrowRight, Banknote, CheckCheck, ChevronDown, Clock3, History, PackageCheck, PencilLine, Plus, RotateCcw, ShieldCheck, Truck, XCircle } from "lucide-react";
import { ORDER_ACTIVITY_ACTION_LABELS, getOrderActivityDetail, getOrderActivityFieldLabel } from "@/lib/order-activity";

export type OrderActivityItem = {
  id: string;
  action: string;
  detail: string | null;
  action_at: string;
  actor_name?: string | null;
  actor_role?: string | null;
  actor_id?: string | null;
  order?: { id: string; order_code: string } | null;
  action_meta?: unknown;
};

type ChangedField = { label: string; before: string; after: string };

function parseMeta(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { fields: [] as ChangedField[], summaries: [] as string[] };
  const meta = value as { changed_fields?: unknown; summary_lines?: unknown };
  const fields = Array.isArray(meta.changed_fields) ? meta.changed_fields.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const field = item as Record<string, unknown>;
    const displayValue = (value: unknown) => value === null || value === undefined || value === "" ? "—" : String(value);
    return [{ label: getOrderActivityFieldLabel(field.label, field.key || field.field), before: displayValue(field.before), after: displayValue(field.after) }];
  }) : [];
  const summaries = Array.isArray(meta.summary_lines) ? meta.summary_lines.filter((line): line is string => typeof line === "string" && Boolean(line.trim())) : [];
  return { fields, summaries };
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: "ຜູ້ດູແລລະບົບ", admin: "ແອັດມິນ", manager: "ຜູ້ຈັດການ", staff: "ພະນັກງານ",
  accountant: "ບັນຊີ", graphic: "ກຣາຟິກ", production: "ຝ່າຍຜະລິດ",
};

function getActionAppearance(action: string) {
  if (action.includes("cancel") || action.includes("reject")) return { Icon: XCircle, icon: "border-rose-200 bg-rose-50 text-rose-600", badge: "bg-rose-50 text-rose-700" };
  if (action === "receive_customer_payment" || action === "pay_factory") return { Icon: Banknote, icon: "border-emerald-200 bg-emerald-50 text-emerald-600", badge: "bg-emerald-50 text-emerald-700" };
  if (action === "create_order") return { Icon: Plus, icon: "border-sky-200 bg-sky-50 text-sky-600", badge: "bg-sky-50 text-sky-700" };
  if (action === "update_order") return { Icon: PencilLine, icon: "border-blue-200 bg-blue-50 text-blue-600", badge: "bg-blue-50 text-blue-700" };
  if (action === "production_completed") return { Icon: PackageCheck, icon: "border-teal-200 bg-teal-50 text-teal-600", badge: "bg-teal-50 text-teal-700" };
  if (action === "close_order") return { Icon: CheckCheck, icon: "border-violet-200 bg-violet-50 text-violet-600", badge: "bg-violet-50 text-violet-700" };
  if (action === "reopen_order") return { Icon: RotateCcw, icon: "border-amber-200 bg-amber-50 text-amber-600", badge: "bg-amber-50 text-amber-700" };
  if (action.includes("approve")) return { Icon: ShieldCheck, icon: "border-emerald-200 bg-emerald-50 text-emerald-600", badge: "bg-emerald-50 text-emerald-700" };
  if (action.includes("shipment")) return { Icon: Truck, icon: "border-indigo-200 bg-indigo-50 text-indigo-600", badge: "bg-indigo-50 text-indigo-700" };
  return { Icon: Activity, icon: "border-slate-200 bg-slate-50 text-slate-500", badge: "bg-slate-100 text-slate-700" };
}

export function getActivityDateKey(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getDateLabel(value: string, referenceDate: Date) {
  const key = getActivityDateKey(value);
  if (key === "unknown") return "ບໍ່ລະບຸວັນທີ";
  if (key === getActivityDateKey(referenceDate)) return "ມື້ນີ້";
  const yesterday = new Date(referenceDate);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === getActivityDateKey(yesterday)) return "ມື້ວານນີ້";
  return new Date(value).toLocaleDateString("lo-LA", { day: "numeric", month: "long", year: "numeric" });
}

function ActivityEntry({ item, last }: { item: OrderActivityItem; last: boolean }) {
  const { Icon, icon, badge } = getActionAppearance(item.action);
  const { fields, summaries } = parseMeta(item.action_meta);
  const actionLabel = ORDER_ACTIVITY_ACTION_LABELS[item.action] || item.action;
  const detail = getOrderActivityDetail(item.detail);
  const date = new Date(item.action_at);
  const time = Number.isNaN(date.getTime()) ? item.action_at : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0 sm:gap-4" data-activity-entry={item.id}>
      {!last ? <span aria-hidden="true" className="absolute bottom-0 left-[17px] top-10 w-px bg-slate-200" /> : null}
      <span aria-hidden="true" className={`relative z-10 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${icon}`}><Icon size={16} strokeWidth={1.8} /></span>
      <article className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3.5 py-3.5 shadow-sm transition-colors hover:border-slate-300 sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-sm leading-6">
          <span className="font-black text-slate-900 [overflow-wrap:anywhere]">{item.actor_name?.trim() || "ບໍ່ຮູ້ຜູ້ດຳເນີນການ"}</span>
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold leading-5 ${badge}`}>{actionLabel}</span>
          {item.order ? <Link href={`/orders/${item.order.id}/edit`} className="font-bold text-blue-600 underline decoration-blue-200 underline-offset-4 hover:text-blue-800">{item.order.order_code}</Link> : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium leading-5 text-slate-500">
          <time dateTime={Number.isNaN(date.getTime()) ? undefined : item.action_at} title={Number.isNaN(date.getTime()) ? item.action_at : date.toLocaleString("en-GB")} className="inline-flex items-center gap-1.5"><Clock3 size={12} />{time}</time>
          {item.actor_role ? <><span aria-hidden="true">·</span><span>{ROLE_LABELS[item.actor_role] || item.actor_role}</span></> : null}
          {item.actor_id ? <span className="min-w-0 break-all font-mono text-[10px]" title={item.actor_id}>· ID: {item.actor_id}</span> : null}
        </div>
        {detail && detail !== actionLabel ? <p className="mt-2.5 whitespace-pre-wrap text-xs font-medium leading-6 text-slate-600 [overflow-wrap:anywhere]">{detail}</p> : null}
        {summaries.length ? <div className="mt-2 space-y-0.5 text-[11px] font-medium leading-5 text-slate-500 [overflow-wrap:anywhere]">{summaries.map((line, index) => <p key={index}>{line}</p>)}</div> : null}
        {fields.length ? (
          <details className="group mt-3 border-t border-slate-100 pt-3" open={fields.length <= 3}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold text-slate-700 [&::-webkit-details-marker]:hidden">
              <span>ລາຍລະອຽດການປ່ຽນແປງ <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{fields.length}</span></span>
              <ChevronDown size={14} className="shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 space-y-2">
              {fields.map((field, index) => (
                <div key={index} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-[11px] leading-5">
                  <div className="mb-1.5 font-bold text-slate-700">{field.label}</div>
                  <div className="grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] items-start gap-2">
                    <div className="min-w-0 text-slate-500"><span className="mb-0.5 block text-[10px] text-slate-400">ກ່ອນແກ້ໄຂ</span><span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{field.before}</span></div>
                    <ArrowRight size={13} className="mt-6 text-slate-400" aria-hidden="true" />
                    <div className="min-w-0 text-slate-900"><span className="mb-0.5 block text-[10px] font-medium text-emerald-600">ຫຼັງແກ້ໄຂ</span><span className="whitespace-pre-wrap font-bold [overflow-wrap:anywhere]">{field.after}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </article>
    </li>
  );
}

export function OrderActivityTimeline({ items, loading = false, title = "ປະຫວັດການແກ້ໄຂ", showActionFilter = true, pageSize = 10 }: {
  items: OrderActivityItem[];
  loading?: boolean;
  title?: string;
  showActionFilter?: boolean;
  pageSize?: number;
}) {
  const headingId = useId();
  const [action, setAction] = useState("all");
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [referenceDate] = useState(() => new Date());
  const filteredItems = useMemo(() => items.filter(item => action === "all" || item.action === action).slice().sort((a, b) => (Date.parse(b.action_at) || 0) - (Date.parse(a.action_at) || 0)), [action, items]);
  const groups = new Map<string, OrderActivityItem[]>();
  filteredItems.slice(0, visibleCount).forEach(item => {
    const key = getActivityDateKey(item.action_at);
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  const actions = Array.from(new Set(items.map(item => item.action)));
  return (
    <section aria-labelledby={headingId} data-order-activity-timeline className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><History size={19} /></span>
          <div><h2 id={headingId} className="text-sm font-black text-slate-900">{title}</h2><p className="mt-1 text-[11px] font-medium text-slate-500">{filteredItems.length.toLocaleString()} ລາຍການ · ລ່າສຸດກ່ອນ</p></div>
        </div>
        {showActionFilter ? (
          <select aria-label="ປະເພດກິດຈະກຳ" value={action} onChange={event => { setAction(event.target.value); setVisibleCount(pageSize); }} className="max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">ກິດຈະກຳທັງໝົດ</option>
            {actions.map(value => <option key={value} value={value}>{ORDER_ACTIVITY_ACTION_LABELS[value] || value}</option>)}
          </select>
        ) : null}
      </div>
      {loading ? <div role="status" className="px-6 py-12 text-center text-sm text-slate-500">ກຳລັງໂຫຼດປະຫວັດ...</div> : !filteredItems.length ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center"><History size={28} className="text-slate-300" /><p className="text-sm font-bold text-slate-500">ບໍ່ມີລາຍການກິດຈະກຳ</p></div>
      ) : (
        <div className="space-y-8 px-4 py-6 sm:px-6">
          {Array.from(groups, ([key, entries]) => (
            <section key={key} aria-label={getDateLabel(entries[0].action_at, referenceDate)}>
              <div className="mb-4 flex items-center gap-3"><h3 className="shrink-0 text-[11px] font-black text-slate-500">{getDateLabel(entries[0].action_at, referenceDate)}</h3><span aria-hidden="true" className="h-px flex-1 bg-slate-100" /></div>
              <ol>{entries.map((item, index) => <ActivityEntry key={item.id} item={item} last={index === entries.length - 1} />)}</ol>
            </section>
          ))}
        </div>
      )}
      {!loading && filteredItems.length > 0 ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-4 sm:px-6"><span className="text-[11px] font-medium text-slate-400">ສະແດງ {Math.min(visibleCount, filteredItems.length)} ຈາກ {filteredItems.length.toLocaleString()} ລາຍການ</span>{visibleCount < filteredItems.length ? <button type="button" onClick={() => setVisibleCount(count => count + pageSize)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-blue-600 transition hover:bg-blue-50"><ArrowDown size={14} />ເບິ່ງກິດຈະກຳກ່ອນໜ້າ</button> : null}</div> : null}
    </section>
  );
}
