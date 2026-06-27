"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CheckCheck, Factory, RefreshCw, RotateCcw, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { GRAPHIC_ASSIGNABLE_ROLES } from "@/lib/role-groups";
import type { AppRole } from "@/lib/access-control";
import { buildYearOptions, type MonthFilter } from "../reports/_lib";
import { canEditWithPermissions, normalizeUserPermissionSettings, type UserPermissionSettings } from "@/lib/user-permissions";
import {
  buildFactoryProductionQueueStatusUpdate,
  FACTORY_PRODUCTION_QUEUE_STATUS_LABELS,
  FACTORY_PRODUCTION_QUEUE_STATUS_ORDER,
  FACTORY_PRODUCTION_QUEUE_STATUS_STYLES,
  isFactoryProductionQueueCompleted,
  type FactoryProductionQueueStatus,
} from "@/lib/factory-production-queue";
import { getPantsTotalQty, parsePantsDraftItems } from "@/lib/order-items";

type PlannerRow = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

type ViewerProfile = {
  id: string;
  role: AppRole;
  permission_settings?: UserPermissionSettings | null;
};

type QueueDepositRow = {
  id: string;
  deposit_no: string;
  order_code: string | null;
  status: string;
  customer_name: string;
  customer_phone: string;
  team_name: string | null;
  fabric_name: string;
  graphic_user_id: string | null;
  production_sent_date: string | null;
  delivery_date: string | null;
  production_priority: "normal" | "urgent" | null;
  urgent_due_date: string | null;
  factory_bill_code: string | null;
  short_qty: number;
  long_qty: number;
  free_qty: number;
  qty_3xl: number;
  qty_4xl: number;
  qty_5xl: number;
  qty_6xl: number;
  pants_items?: unknown;
};

type QueueEntryRow = {
  id: string;
  factory_deposit_order_id: string;
  queue_date: string;
  queue_year: number;
  queue_month: number;
  queue_sequence: number;
  queue_number: string;
  order_sequence: number;
  order_no: string;
  planner_user_id: string | null;
  status: FactoryProductionQueueStatus;
  notes: string;
  pattern_laid_at: string | null;
  all_sizes_laid_at: string | null;
  ready_for_print_at: string | null;
  sent_to_factory_at: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deposit: QueueDepositRow | QueueDepositRow[] | null;
};

type StageFilter = "all" | "pending" | "completed" | FactoryProductionQueueStatus;

const ALL_PLANNER_FILTER = "__ALL__";

function buildMonthOptions() {
  return [
    { value: "ALL" as const, label: "ທຸກເດືອນ" },
    ...Array.from({ length: 12 }, (_, index) => ({
      value: index + 1,
      label: `ເດືອນ ${index + 1}`,
    })),
  ];
}

function formatDisplayDate(dateValue: string | null) {
  if (!dateValue) return "-";
  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) return dateValue;
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB");
}

function normalizeDeposit(row: QueueEntryRow) {
  if (Array.isArray(row.deposit)) return row.deposit[0] ?? null;
  return row.deposit ?? null;
}

function getShirtTotalQty(deposit: QueueDepositRow | null) {
  if (!deposit) return 0;
  return (
    (Number(deposit.short_qty) || 0) +
    (Number(deposit.long_qty) || 0) +
    (Number(deposit.free_qty) || 0) +
    (Number(deposit.qty_3xl) || 0) +
    (Number(deposit.qty_4xl) || 0) +
    (Number(deposit.qty_5xl) || 0) +
    (Number(deposit.qty_6xl) || 0)
  );
}

function getPantsQty(deposit: QueueDepositRow | null) {
  if (!deposit) return 0;
  return parsePantsDraftItems(deposit.pants_items).reduce((sum, item) => sum + getPantsTotalQty(item), 0);
}

function matchesStageFilter(status: FactoryProductionQueueStatus, filter: StageFilter) {
  if (filter === "all") return true;
  if (filter === "pending") return !isFactoryProductionQueueCompleted(status);
  if (filter === "completed") return isFactoryProductionQueueCompleted(status);
  return status === filter;
}

export default function FactoryProductionQueuePage() {
  const today = useMemo(() => new Date(), []);
  const [rows, setRows] = useState<QueueEntryRow[]>([]);
  const [planners, setPlanners] = useState<PlannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerPermissions, setViewerPermissions] = useState<UserPermissionSettings>({});
  const [workingRowId, setWorkingRowId] = useState<string | null>(null);

  const [monthFilter, setMonthFilter] = useState<MonthFilter>(today.getMonth() + 1);
  const [yearFilter, setYearFilter] = useState(today.getFullYear());
  const [plannerFilterUserId, setPlannerFilterUserId] = useState<string>(ALL_PLANNER_FILTER);
  const [stageFilter, setStageFilter] = useState<StageFilter>("pending");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [query, setQuery] = useState("");

  const canEditQueue = canEditWithPermissions(viewerPermissions, "factory_production_queue", Boolean(viewerRole));
  const isGraphicViewer = viewerRole === "graphic";
  const canAssignPlanner = canEditQueue && viewerRole !== "graphic";

  const load = async (options?: { syncFirst?: boolean }) => {
    setLoading(true);
    setErr(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user.id;
      if (!authUserId) {
        setRows([]);
        setPlanners([]);
        setViewerRole(null);
        setViewerUserId(null);
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("users")
        .select("id,role,permission_settings")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      if (profileError) throw profileError;

      const profile = (profileData ?? null) as ViewerProfile | null;
      setViewerRole(profile?.role ?? null);
      setViewerUserId(profile?.id ?? null);
      setViewerPermissions(normalizeUserPermissionSettings(profile?.permission_settings));

      if (options?.syncFirst !== false) {
        await supabase.rpc("sync_factory_production_queue_entries", {
          p_actor_user_id: profile?.id ?? null,
        });
      }

      let queueQuery = supabase
        .from("factory_production_queue_entries")
        .select(
          "id,factory_deposit_order_id,queue_date,queue_year,queue_month,queue_sequence,queue_number,order_sequence,order_no,planner_user_id,status,notes,pattern_laid_at,all_sizes_laid_at,ready_for_print_at,sent_to_factory_at,created_by_user_id,updated_by_user_id,created_at,updated_at,deposit:factory_deposit_orders!factory_production_queue_entries_factory_deposit_order_id_fkey(id,deposit_no,order_code,status,customer_name,customer_phone,team_name,fabric_name,graphic_user_id,production_sent_date,delivery_date,production_priority,urgent_due_date,factory_bill_code,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl,qty_6xl,pants_items)"
        )
        .order("queue_date", { ascending: false })
        .order("queue_sequence", { ascending: true });

      if (profile?.role === "graphic" && profile.id) {
        queueQuery = queueQuery.eq("planner_user_id", profile.id);
      }

      const [queueResult, plannerResult] = await Promise.all([
        queueQuery,
        supabase
          .from("users")
          .select("id,full_name,role,is_active")
          .eq("is_active", true)
          .in("role", GRAPHIC_ASSIGNABLE_ROLES)
          .order("full_name", { ascending: true }),
      ]);

      if (queueResult.error) throw queueResult.error;
      if (plannerResult.error) throw plannerResult.error;

      const normalizedRows = ((queueResult.data ?? []) as QueueEntryRow[]).filter((row) => {
        const deposit = normalizeDeposit(row);
        return Boolean(deposit && deposit.status !== "draft" && deposit.status !== "cancelled");
      });

      setRows(normalizedRows);
      setPlanners((plannerResult.data ?? []) as PlannerRow[]);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "ໂຫຼດຄິວວາງຜະລິດບໍ່ສຳເລັດ");
      setRows([]);
      setPlanners([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const plannerNameMap = useMemo(() => new Map(planners.map((user) => [user.id, user.full_name])), [planners]);
  const availablePlannerUsers = useMemo(
    () => (isGraphicViewer && viewerUserId ? planners.filter((user) => user.id === viewerUserId) : planners),
    [isGraphicViewer, planners, viewerUserId]
  );
  const activePlannerFilter = isGraphicViewer && viewerUserId ? viewerUserId : plannerFilterUserId;

  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();

    return rows
      .filter((row) => {
        const deposit = normalizeDeposit(row);
        if (!deposit) return false;
        if (monthFilter !== "ALL" && row.queue_month !== monthFilter) return false;
        if (row.queue_year !== yearFilter) return false;
        if (activePlannerFilter !== ALL_PLANNER_FILTER && row.planner_user_id !== activePlannerFilter) return false;
        if (!matchesStageFilter(row.status, stageFilter)) return false;
        if (dateFromFilter && row.queue_date < dateFromFilter) return false;
        if (dateToFilter && row.queue_date > dateToFilter) return false;

        if (!search) return true;

        const haystack = [
          row.queue_number,
          row.order_no,
          deposit.deposit_no,
          deposit.order_code || "",
          deposit.customer_name || "",
          deposit.customer_phone || "",
          deposit.team_name || "",
          deposit.fabric_name || "",
          row.planner_user_id ? plannerNameMap.get(row.planner_user_id) || "" : "",
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(search);
      })
      .sort((a, b) => {
        const depositA = normalizeDeposit(a);
        const depositB = normalizeDeposit(b);
        const urgentDiff = Number(depositB?.production_priority === "urgent") - Number(depositA?.production_priority === "urgent");
        if (urgentDiff !== 0) return urgentDiff;

        return a.queue_sequence - b.queue_sequence;
      });
  }, [
    activePlannerFilter,
    dateFromFilter,
    dateToFilter,
    monthFilter,
    plannerNameMap,
    query,
    rows,
    stageFilter,
    yearFilter,
  ]);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        const deposit = normalizeDeposit(row);
        acc.total += 1;
        if (row.status === "queued") acc.queued += 1;
        if (row.status === "ready_for_print") acc.ready += 1;
        if (row.status === "sent_to_factory") acc.completed += 1;
        if (deposit?.production_priority === "urgent") acc.urgent += 1;
        return acc;
      },
      { total: 0, queued: 0, ready: 0, completed: 0, urgent: 0 }
    );
  }, [filteredRows]);

  const handleSync = async () => {
    setSyncing(true);
    setErr(null);
    try {
      const { error } = await supabase.rpc("sync_factory_production_queue_entries", {
        p_actor_user_id: viewerUserId,
      });
      if (error) throw error;
      await load({ syncFirst: false });
      toast.success("ດຶງຄິວຈາກໃບມັດຈຳສຳເລັດແລ້ວ");
    } catch (error) {
      const message = error instanceof Error ? error.message : "sync ຄິວບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  };

  const handlePlannerChange = async (row: QueueEntryRow, nextPlannerId: string) => {
    if (!canAssignPlanner) {
      toast.error("ທ່ານບໍ່ມີສິດມອບໝາຍຄິວ");
      return;
    }

    setWorkingRowId(row.id);
    try {
      const { error } = await supabase
        .from("factory_production_queue_entries")
        .update({
          planner_user_id: nextPlannerId || null,
          updated_by_user_id: viewerUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;

      toast.success("ປ່ຽນຜູ້ວາງ Pattern ສຳເລັດແລ້ວ");
      await load({ syncFirst: false });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ອັບເດດຜູ້ຮັບຜິດຊອບບໍ່ສຳເລັດ");
    } finally {
      setWorkingRowId(null);
    }
  };

  const handleStatusChange = async (row: QueueEntryRow, nextStatus: FactoryProductionQueueStatus) => {
    if (!canEditQueue) {
      toast.error("ທ່ານບໍ່ມີສິດອັບເດດຄິວ");
      return;
    }

    if (row.status === nextStatus) return;

    setWorkingRowId(row.id);
    try {
      const updatePayload = buildFactoryProductionQueueStatusUpdate(nextStatus, row);
      const { error } = await supabase
        .from("factory_production_queue_entries")
        .update({
          ...updatePayload,
          updated_by_user_id: viewerUserId,
        })
        .eq("id", row.id);
      if (error) throw error;

      toast.success(`ອັບເດດເປັນ "${FACTORY_PRODUCTION_QUEUE_STATUS_LABELS[nextStatus]}" ແລ້ວ`);
      await load({ syncFirst: false });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ອັບເດດສະຖານະບໍ່ສຳເລັດ");
    } finally {
      setWorkingRowId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">ຄິວວາງຜະລິດ</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
            ດຶງອໍເດີຈາກໃບມັດຈຳທີ່ສົ່ງແລ້ວ ເພື່ອມອບໝາຍຜູ້ວາງ Pattern ແລະ ຕິດຕາມຂັ້ນຕອນຕັ້ງແຕ່ລໍຖ້າວາງຈົນສົ່ງໂຮງງານ.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing || loading}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? "ກຳລັງ sync..." : "ດຶງຄິວຈາກໃບມັດຈຳ"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            ໂຫຼດໃໝ່
          </button>
        </div>
      </div>

      {err ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{err}</div> : null}
      {!canEditQueue ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">user ນີ້ມີສິດເບິ່ງຄິວໄດ້ ແຕ່ບໍ່ສາມາດປ່ຽນສະຖານະ ຫຼື ມອບໝາຍຄິວ</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-slate-500">ຄິວທັງໝົດ</div>
          <div className="mt-2 text-3xl font-black text-slate-900">{summary.total.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-amber-700">ລໍຖ້າວາງ</div>
          <div className="mt-2 text-3xl font-black text-amber-700">{summary.queued.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-cyan-100 bg-cyan-50 p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-cyan-700">ພ້ອມພິມ</div>
          <div className="mt-2 text-3xl font-black text-cyan-700">{summary.ready.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-emerald-700">ສົ່ງໂຮງງານແລ້ວ</div>
          <div className="mt-2 text-3xl font-black text-emerald-700">{summary.completed.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-rose-700">ງານດ່ວນ</div>
          <div className="mt-2 text-3xl font-black text-rose-700">{summary.urgent.toLocaleString()}</div>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ຄົ້ນຫາ queue / deposit / order / ລູກຄ້າ / ທີມ"
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400 xl:col-span-2"
          />
          <select
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value === "ALL" ? "ALL" : Number(event.target.value))}
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          >
            {buildMonthOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={yearFilter}
            onChange={(event) => setYearFilter(Number(event.target.value))}
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          >
            {buildYearOptions().map((year) => (
              <option key={year} value={year}>
                ປີ {year}
              </option>
            ))}
          </select>
          <select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value as StageFilter)}
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          >
            <option value="all">ທຸກສະຖານະ</option>
            <option value="pending">ສະເພາະຄິວທີ່ຍັງບໍ່ສຳເລັດ</option>
            <option value="completed">ສະເພາະທີ່ສົ່ງໂຮງງານແລ້ວ</option>
            {FACTORY_PRODUCTION_QUEUE_STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {FACTORY_PRODUCTION_QUEUE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-4">
          <select
            value={activePlannerFilter}
            onChange={(event) => setPlannerFilterUserId(event.target.value)}
            disabled={isGraphicViewer}
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400 disabled:bg-slate-50"
          >
            <option value={ALL_PLANNER_FILTER}>ທຸກຄົນວາງ Pattern</option>
            {availablePlannerUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </select>
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-500">ວັນທີເລີ່ມ</label>
            <input
              type="date"
              value={dateFromFilter}
              max={dateToFilter || undefined}
              onChange={(event) => setDateFromFilter(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-500">ວັນທີສິ້ນສຸດ</label>
            <input
              type="date"
              value={dateToFilter}
              min={dateFromFilter || undefined}
              onChange={(event) => setDateToFilter(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
            ຈຳນວນທີ່ສະແດງ: <span className="text-slate-900">{filteredRows.length}</span> ລາຍການ
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-3xl border border-slate-100 bg-white px-4 py-16 text-center text-sm font-bold text-slate-500 shadow-sm">
            ກຳລັງໂຫຼດຄິວວາງຜະລິດ...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-3xl border border-slate-100 bg-white px-4 py-16 text-center text-sm font-bold text-slate-500 shadow-sm">
            ຍັງບໍ່ມີຄິວວາງຜະລິດໃນຊ່ວງທີ່ເລືອກ
          </div>
        ) : (
          filteredRows.map((row) => {
            const deposit = normalizeDeposit(row);
            if (!deposit) return null;

            const shirtQty = getShirtTotalQty(deposit);
            const pantsQty = getPantsQty(deposit);
            const totalQty = shirtQty + pantsQty;
            const isUrgent = deposit.production_priority === "urgent";

            return (
              <article
                key={row.id}
                className={`overflow-hidden rounded-[28px] border bg-white shadow-sm transition ${
                  isUrgent ? "border-rose-200 shadow-rose-100/50" : "border-slate-100"
                }`}
              >
                <div className={`px-5 py-4 ${isUrgent ? "bg-gradient-to-r from-rose-50 via-white to-amber-50" : "bg-slate-50/80"}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white">
                          Queue #{row.queue_number}
                        </span>
                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-700">
                          ເລກຄິວ {row.order_no}
                        </span>
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${FACTORY_PRODUCTION_QUEUE_STATUS_STYLES[row.status]}`}>
                          {FACTORY_PRODUCTION_QUEUE_STATUS_LABELS[row.status]}
                        </span>
                        {isUrgent ? (
                          <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">
                            ງານດ່ວນ
                          </span>
                        ) : null}
                      </div>

                      <div>
                        <div className="text-lg font-black text-slate-900">{deposit.team_name || deposit.customer_name || deposit.deposit_no}</div>
                        <div className="text-sm font-medium text-slate-500">
                          {deposit.deposit_no} {deposit.order_code ? `• ${deposit.order_code}` : ""} {deposit.factory_bill_code ? `• ${deposit.factory_bill_code}` : ""}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-black uppercase text-slate-500">ຈຳນວນລວມ</div>
                        <div className="mt-1 text-2xl font-black text-slate-900">{totalQty.toLocaleString()}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-black uppercase text-slate-500">ເສື້ອ</div>
                        <div className="mt-1 text-2xl font-black text-sky-700">{shirtQty.toLocaleString()}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-black uppercase text-slate-500">ໂສ້ງ</div>
                        <div className="mt-1 text-2xl font-black text-violet-700">{pantsQty.toLocaleString()}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-black uppercase text-slate-500">ວັນຄິວ</div>
                        <div className="mt-1 text-base font-black text-slate-900">{formatDisplayDate(row.queue_date)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <div className="text-xs font-black uppercase text-slate-500">ລູກຄ້າ / ເບີໂທ</div>
                          <div className="mt-1 font-black text-slate-900">{deposit.customer_name || "-"}</div>
                          <div className="text-sm font-bold text-slate-500">{deposit.customer_phone || "-"}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <div className="text-xs font-black uppercase text-slate-500">ຜ້າ / ແບບ</div>
                          <div className="mt-1 font-black text-slate-900">{deposit.fabric_name || "-"}</div>
                          <div className="text-sm font-bold text-slate-500">Deposit status: {deposit.status}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <div className="text-xs font-black uppercase text-slate-500">ກຳນົດຜະລິດ</div>
                          <div className="mt-1 font-black text-slate-900">{formatDisplayDate(deposit.production_sent_date)}</div>
                          <div className="text-sm font-bold text-slate-500">ສົ່ງລູກຄ້າ {formatDisplayDate(deposit.delivery_date)}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <div className="text-xs font-black uppercase text-slate-500">ກຳນົດດ່ວນ</div>
                          <div className={`mt-1 font-black ${isUrgent ? "text-rose-700" : "text-slate-900"}`}>
                            {isUrgent ? formatDisplayDate(deposit.urgent_due_date) : "ງານປົກກະຕິ"}
                          </div>
                          <div className="text-sm font-bold text-slate-500">ຜູ້ອອກແບບ {deposit.graphic_user_id ? plannerNameMap.get(deposit.graphic_user_id) || deposit.graphic_user_id.slice(0, 8) : "-"}</div>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-700">
                          <Factory size={16} />
                          ສະຖານະການຈັດຄິວ
                        </div>
                        <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
                          {FACTORY_PRODUCTION_QUEUE_STATUS_ORDER.slice(1).map((status) => {
                            const active = row.status === status;
                            return (
                              <button
                                key={status}
                                type="button"
                                onClick={() => void handleStatusChange(row, status)}
                                disabled={!canEditQueue || workingRowId === row.id}
                                className={`rounded-2xl px-4 py-3 text-left text-sm font-black transition ${
                                  active
                                    ? FACTORY_PRODUCTION_QUEUE_STATUS_STYLES[status]
                                    : "border border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50"
                                } disabled:opacity-50`}
                              >
                                {FACTORY_PRODUCTION_QUEUE_STATUS_LABELS[status]}
                              </button>
                            );
                          })}
                        </div>
                        {row.status !== "queued" ? (
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(row, "queued")}
                            disabled={!canEditQueue || workingRowId === row.id}
                            className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                          >
                            <RotateCcw size={15} />
                            ກັບໄປລໍຖ້າວາງ Pattern
                          </button>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                          <div className="text-xs font-black uppercase text-slate-500">ວາງແພທເທິນແລ້ວ</div>
                          <div className="mt-1 text-sm font-black text-slate-900">{formatDateTime(row.pattern_laid_at)}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                          <div className="text-xs font-black uppercase text-slate-500">ຄົບໄຊທ໌</div>
                          <div className="mt-1 text-sm font-black text-slate-900">{formatDateTime(row.all_sizes_laid_at)}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                          <div className="text-xs font-black uppercase text-slate-500">ພ້ອມພິມ</div>
                          <div className="mt-1 text-sm font-black text-slate-900">{formatDateTime(row.ready_for_print_at)}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                          <div className="text-xs font-black uppercase text-slate-500">ສົ່ງໂຮງງານແລ້ວ</div>
                          <div className="mt-1 text-sm font-black text-slate-900">{formatDateTime(row.sent_to_factory_at)}</div>
                        </div>
                      </div>
                    </div>

                    <aside className="space-y-4 rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-2 text-sm font-black text-slate-700">
                        <UserRound size={16} />
                        ມອບໝາຍຜູ້ວາງ Pattern
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-black uppercase text-slate-500">ຜູ້ຮັບຜິດຊອບ</label>
                        <select
                          value={row.planner_user_id || ""}
                          onChange={(event) => void handlePlannerChange(row, event.target.value)}
                          disabled={!canAssignPlanner || workingRowId === row.id}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400 disabled:bg-slate-50"
                        >
                          <option value="">ຍັງບໍ່ມອບໝາຍ</option>
                          {planners.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.full_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="text-xs font-black uppercase text-slate-500">ຜູ້ທີ່ມອບໝາຍໄວ້</div>
                        <div className="mt-1 font-black text-slate-900">{row.planner_user_id ? plannerNameMap.get(row.planner_user_id) || row.planner_user_id.slice(0, 8) : "-"}</div>
                      </div>

                      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="text-xs font-black uppercase text-slate-500">ອັບເດດຫຼ້າສຸດ</div>
                        <div className="mt-1 font-black text-slate-900">{formatDateTime(row.updated_at)}</div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/factory-deposit-orders/new?id=${deposit.id}`}
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                        >
                          <CheckCheck size={15} />
                          ເບິ່ງໃບມັດຈຳ
                        </Link>
                        {deposit.order_code ? (
                          <Link
                            href={`/search?q=${encodeURIComponent(deposit.order_code)}`}
                            className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-black text-sky-700 transition hover:bg-sky-100"
                          >
                            ຄົ້ນຫາອໍເດີ
                          </Link>
                        ) : null}
                      </div>
                    </aside>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
