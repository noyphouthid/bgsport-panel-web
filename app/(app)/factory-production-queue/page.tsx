"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ArrowUpRight, CheckCheck, RefreshCw, RotateCcw, UserRound } from "lucide-react";
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
  getFactoryProductionQueueStatusActorId,
  getFactoryProductionQueueStatusIndex,
  type FactoryProductionQueueActorFields,
  type FactoryProductionQueueStatus,
} from "@/lib/factory-production-queue";
import { buildFactoryDesignFallbackUrl, extractProductionMockupUrls } from "@/lib/order-media";
import { getPantsTotalQty, parsePantsDraftItems } from "@/lib/order-items";

type UserRow = {
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
  admin_user_id: string | null;
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
  production_items?: unknown;
  pants_items?: unknown;
};

type QueueEntryRow = FactoryProductionQueueActorFields & {
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

type StageFilter = "all" | FactoryProductionQueueStatus;
type PriorityFilter = "all" | "urgent" | "normal";

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

function parseDateOnly(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function diffDaysFromToday(value: string | null) {
  const target = parseDateOnly(value);
  if (!target) return null;
  const msPerDay = 86_400_000;
  return Math.round((target.getTime() - startOfToday().getTime()) / msPerDay);
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

function getPreviewImageUrl(deposit: QueueDepositRow | null) {
  if (!deposit) return null;
  const firstMockup = extractProductionMockupUrls(deposit.production_items)[0] || null;
  return firstMockup || buildFactoryDesignFallbackUrl(deposit.factory_bill_code);
}

function getStyleCount(deposit: QueueDepositRow | null) {
  if (!deposit) return 0;
  return extractProductionMockupUrls(deposit.production_items).length;
}

function getCurrentStageTimestamp(row: QueueEntryRow) {
  if (row.status === "pattern_laid") return row.pattern_laid_at;
  if (row.status === "all_sizes_laid") return row.all_sizes_laid_at;
  if (row.status === "ready_for_print") return row.ready_for_print_at;
  if (row.status === "sent_to_factory") return row.sent_to_factory_at;
  return null;
}

function getDeadlineMeta(deposit: QueueDepositRow | null) {
  const targetDate =
    deposit?.production_priority === "urgent" ? deposit.urgent_due_date || deposit.delivery_date : deposit?.delivery_date || null;

  if (!targetDate) {
    return {
      label: "ບໍ່ມີກຳນົດສົ່ງ",
      sublabel: "ກະລຸນາກຳນົດວັນສົ່ງ",
      className: "text-slate-500",
    };
  }

  const diffDays = diffDaysFromToday(targetDate);
  if (diffDays === null) {
    return {
      label: formatDisplayDate(targetDate),
      sublabel: "ກຳນົດສົ່ງ",
      className: "text-slate-700",
    };
  }

  if (diffDays < 0) {
    return {
      label: "ເກີນກຳນົດ",
      sublabel: `${Math.abs(diffDays)} ມື້ • ${formatDisplayDate(targetDate)}`,
      className: "text-rose-700",
    };
  }
  if (diffDays === 0) {
    return {
      label: "ມື້ນີ້",
      sublabel: formatDisplayDate(targetDate),
      className: "text-amber-700",
    };
  }
  if (diffDays === 1) {
    return {
      label: "ມື້ອື່ນ",
      sublabel: formatDisplayDate(targetDate),
      className: "text-sky-700",
    };
  }

  return {
    label: `ອີກ ${diffDays} ມື້`,
    sublabel: formatDisplayDate(targetDate),
    className: "text-slate-700",
  };
}

function getUserIdentityLabel(userId: string | null, userNameMap: Map<string, string>) {
  if (!userId) return "-";
  const name = userNameMap.get(userId);
  if (!name) return userId;
  return `${name} (${userId})`;
}

export default function FactoryProductionQueuePage() {
  const today = useMemo(() => new Date(), []);
  const [rows, setRows] = useState<QueueEntryRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
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
  const [stageFilter, setStageFilter] = useState<StageFilter>("queued");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
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
        setUsers([]);
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
          "id,factory_deposit_order_id,queue_date,queue_year,queue_month,queue_sequence,queue_number,order_sequence,order_no,planner_user_id,status,notes,pattern_laid_at,all_sizes_laid_at,ready_for_print_at,sent_to_factory_at,assigned_by_user_id,pattern_laid_by_user_id,all_sizes_laid_by_user_id,ready_for_print_by_user_id,sent_to_factory_by_user_id,last_status_updated_by_user_id,created_by_user_id,updated_by_user_id,created_at,updated_at,deposit:factory_deposit_orders!factory_production_queue_entries_factory_deposit_order_id_fkey(id,deposit_no,order_code,status,customer_name,customer_phone,team_name,fabric_name,graphic_user_id,admin_user_id,production_sent_date,delivery_date,production_priority,urgent_due_date,factory_bill_code,short_qty,long_qty,free_qty,qty_3xl,qty_4xl,qty_5xl,qty_6xl,production_items,pants_items)"
        )
        .order("queue_date", { ascending: false })
        .order("queue_sequence", { ascending: true });

      if (profile?.role === "graphic" && profile.id) {
        queueQuery = queueQuery.eq("planner_user_id", profile.id);
      }

      const [queueResult, userResult] = await Promise.all([
        queueQuery,
        supabase.from("users").select("id,full_name,role,is_active").eq("is_active", true).order("full_name", { ascending: true }),
      ]);

      if (queueResult.error) throw queueResult.error;
      if (userResult.error) throw userResult.error;

      const normalizedRows = ((queueResult.data ?? []) as QueueEntryRow[]).filter((row) => {
        const deposit = normalizeDeposit(row);
        return Boolean(deposit && deposit.status !== "draft" && deposit.status !== "cancelled");
      });

      setRows(normalizedRows);
      setUsers((userResult.data ?? []) as UserRow[]);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "ໂຫຼດຄິວວາງຜະລິດບໍ່ສຳເລັດ");
      setRows([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const plannerOptions = useMemo(
    () => users.filter((user) => GRAPHIC_ASSIGNABLE_ROLES.includes(user.role as AppRole)),
    [users]
  );
  const userNameMap = useMemo(() => new Map(users.map((user) => [user.id, user.full_name])), [users]);
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
        if (stageFilter !== "all" && row.status !== stageFilter) return false;
        if (priorityFilter === "urgent" && deposit.production_priority !== "urgent") return false;
        if (priorityFilter === "normal" && deposit.production_priority === "urgent") return false;
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
          row.planner_user_id ? getUserIdentityLabel(row.planner_user_id, userNameMap) : "",
          row.assigned_by_user_id ? getUserIdentityLabel(row.assigned_by_user_id, userNameMap) : "",
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

        const deadlineA =
          diffDaysFromToday((depositA?.production_priority === "urgent" ? depositA?.urgent_due_date : depositA?.delivery_date) || null) ?? 9999;
        const deadlineB =
          diffDaysFromToday((depositB?.production_priority === "urgent" ? depositB?.urgent_due_date : depositB?.delivery_date) || null) ?? 9999;
        if (deadlineA !== deadlineB) return deadlineA - deadlineB;

        return a.queue_sequence - b.queue_sequence;
      });
  }, [
    activePlannerFilter,
    dateFromFilter,
    dateToFilter,
    monthFilter,
    priorityFilter,
    query,
    rows,
    stageFilter,
    userNameMap,
    yearFilter,
  ]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const deposit = normalizeDeposit(row);
        acc.total += 1;
        if (row.status === "queued") acc.queued += 1;
        if (row.status === "pattern_laid" || row.status === "all_sizes_laid") acc.processing += 1;
        if (row.status === "ready_for_print") acc.ready += 1;
        if (row.status === "sent_to_factory") acc.sent += 1;
        if (deposit?.production_priority === "urgent") acc.urgent += 1;
        return acc;
      },
      { total: 0, queued: 0, processing: 0, ready: 0, sent: 0, urgent: 0 }
    );
  }, [rows]);

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
          assigned_by_user_id: viewerUserId,
          updated_by_user_id: viewerUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;

      toast.success("ມອບໝາຍຜູ້ວາງ Pattern ສຳເລັດແລ້ວ");
      await load({ syncFirst: false });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ອັບເດດການມອບໝາຍບໍ່ສຳເລັດ");
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
      const updatePayload = buildFactoryProductionQueueStatusUpdate(nextStatus, row, viewerUserId);
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

  const stageTabs: Array<{ value: StageFilter; label: string }> = [
    { value: "queued", label: "ລໍຖ້າວາງ" },
    { value: "pattern_laid", label: "ວາງແລ້ວ" },
    { value: "all_sizes_laid", label: "ຄົບໄຊທ໌" },
    { value: "ready_for_print", label: "ພ້ອມພິມ" },
    { value: "sent_to_factory", label: "ສົ່ງໂຮງງານ" },
    { value: "all", label: "ທັງໝົດ" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">ຄິວວາງຜະລິດ</h1>
          <p className="mt-2 max-w-4xl text-sm font-medium text-slate-500">
            ສະແດງຄິວວາງ Pattern ແບບອ່ານງ່າຍ ເຫັນຮູບ mockup, ລາຍລະອຽດ order, ຈຳນວນ, ກຳນົດສົ່ງ, ແລະ ຜູ້ຮັບຜິດຊອບໄດ້ຈາກໜ້າດຽວ.
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
            {syncing ? "ກຳລັງ sync..." : "ດຶງຄິວໃໝ່"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            ໂຫຼດຄືນ
          </button>
        </div>
      </div>

      {err ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{err}</div> : null}
      {!canEditQueue ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">user ນີ້ມີສິດເບິ່ງຄິວໄດ້ ແຕ່ບໍ່ສາມາດມອບໝາຍ ຫຼື ປ່ຽນສະຖານະຄິວ</div> : null}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">ຄິວທັງໝົດ</div>
          <div className="mt-2 text-3xl font-black text-slate-900">{summary.total.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-widest text-amber-700">ລໍຖ້າວາງ</div>
          <div className="mt-2 text-3xl font-black text-amber-700">{summary.queued.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-widest text-sky-700">ກຳລັງວາງ</div>
          <div className="mt-2 text-3xl font-black text-sky-700">{summary.processing.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-cyan-100 bg-cyan-50 p-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-widest text-cyan-700">ພ້ອມພິມ</div>
          <div className="mt-2 text-3xl font-black text-cyan-700">{summary.ready.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-widest text-emerald-700">ສົ່ງໂຮງງານແລ້ວ</div>
          <div className="mt-2 text-3xl font-black text-emerald-700">{summary.sent.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-rose-100 bg-rose-50 p-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-widest text-rose-700">ງານດ່ວນ</div>
          <div className="mt-2 text-3xl font-black text-rose-700">{summary.urgent.toLocaleString()}</div>
        </div>
      </div>

      <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {stageTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStageFilter(tab.value)}
              className={`rounded-2xl px-4 py-2 text-sm font-black transition ${
                stageFilter === tab.value
                  ? "bg-slate-900 text-white shadow-sm"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.7fr)_repeat(5,minmax(0,1fr))]">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ຄົ້ນຫາ queue / deposit / order / ລູກຄ້າ / ທີມ"
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          />
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          >
            <option value="all">ປະເພດວຽກ</option>
            <option value="urgent">ງານດ່ວນ</option>
            <option value="normal">ງານປົກກະຕິ</option>
          </select>
          <select
            value={activePlannerFilter}
            onChange={(event) => setPlannerFilterUserId(event.target.value)}
            disabled={isGraphicViewer}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400 disabled:bg-slate-50"
          >
            <option value={ALL_PLANNER_FILTER}>ທຸກຄົນວາງ Pattern</option>
            {plannerOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </select>
          <select
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value === "ALL" ? "ALL" : Number(event.target.value))}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
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
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          >
            {buildYearOptions().map((year) => (
              <option key={year} value={year}>
                ປີ {year}
              </option>
            ))}
          </select>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-600">
            ສະແດງ <span className="text-slate-900">{filteredRows.length}</span> ລາຍການ
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <input
            type="date"
            value={dateFromFilter}
            max={dateToFilter || undefined}
            onChange={(event) => setDateFromFilter(event.target.value)}
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          />
          <input
            type="date"
            value={dateToFilter}
            min={dateFromFilter || undefined}
            onChange={(event) => setDateToFilter(event.target.value)}
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">ລາຍການຄິວວາງຜະລິດ</div>
        </div>

        {loading ? (
          <div className="px-4 py-16 text-center text-sm font-bold text-slate-500">ກຳລັງໂຫຼດຄິວວາງຜະລິດ...</div>
        ) : filteredRows.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm font-bold text-slate-500">ບໍ່ມີຄິວໃນສະຖານະນີ້</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1480px] w-full text-sm">
              <thead className="bg-white text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 font-black">ເລກຄິວ</th>
                  <th className="px-4 py-3 font-black">ຮູບແບບ</th>
                  <th className="px-4 py-3 font-black">ລາຍລະອຽດອໍເດີ</th>
                  <th className="px-4 py-3 font-black">ຈຳນວນ</th>
                  <th className="px-4 py-3 font-black">ສະຖານະຜະລິດ</th>
                  <th className="px-4 py-3 font-black">ກຳນົດສົ່ງ</th>
                  <th className="px-4 py-3 font-black">ຜູ້ຮັບຜິດຊອບ</th>
                  <th className="px-4 py-3 font-black">ຈັດການ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => {
                  const deposit = normalizeDeposit(row);
                  if (!deposit) return null;

                  const previewImageUrl = getPreviewImageUrl(deposit);
                  const styleCount = getStyleCount(deposit);
                  const shirtQty = getShirtTotalQty(deposit);
                  const pantsQty = getPantsQty(deposit);
                  const totalQty = shirtQty + pantsQty;
                  const isUrgent = deposit.production_priority === "urgent";
                  const deadlineMeta = getDeadlineMeta(deposit);
                  const currentStageTime = getCurrentStageTimestamp(row);
                  const currentIndex = getFactoryProductionQueueStatusIndex(row.status);
                  const statusActorUserId = getFactoryProductionQueueStatusActorId(row.status, row);

                  return (
                    <tr key={row.id} className={`align-top transition hover:bg-slate-50/70 ${isUrgent ? "bg-rose-50/30" : ""}`}>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <div className="font-black text-slate-900">#{row.queue_number}</div>
                          <div className="text-xs font-bold text-slate-500">ຄິວເດືອນ {row.order_no}</div>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${
                              isUrgent
                                ? "border border-rose-200 bg-rose-50 text-rose-700"
                                : "border border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                          >
                            {isUrgent ? "ງານດ່ວນ" : "ງານປົກກະຕິ"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="w-[92px]">
                          <div className="flex h-[92px] w-[92px] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            {previewImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={previewImageUrl} alt={deposit.order_code || deposit.deposit_no} className="h-full w-full object-contain" />
                            ) : (
                              <div className="px-2 text-center text-[11px] font-bold text-slate-400">ບໍ່ມີຮູບ</div>
                            )}
                          </div>
                          <div className="mt-2 text-center text-[11px] font-black text-slate-500">
                            {styleCount > 0 ? `${styleCount} ແບບ` : "ບໍ່ມີ mockup"}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="max-w-[360px] space-y-2">
                          <div>
                            <div className="text-base font-black text-slate-900">{deposit.order_code || deposit.deposit_no}</div>
                            <div className="text-base font-medium text-slate-700">{deposit.team_name || deposit.customer_name || "-"}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-600">
                              {deposit.fabric_name || "-"}
                            </span>
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-600">
                              {deposit.deposit_no}
                            </span>
                          </div>
                          <div className="text-xs font-bold leading-5 text-slate-500">
                            <div>ລູກຄ້າ: <span className="text-slate-700">{deposit.customer_name || "-"}</span></div>
                            <div>ເບີໂທ: <span className="text-slate-700">{deposit.customer_phone || "-"}</span></div>
                            <div>ລະຫັດໂຮງງານ: <span className="text-slate-700">{deposit.factory_bill_code || "-"}</span></div>
                            <div>ວັນເຂົ້າຄິວ: <span className="text-slate-700">{formatDisplayDate(row.queue_date)}</span></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <div className="text-2xl font-black text-slate-900">{totalQty.toLocaleString()}</div>
                          <div className="text-xs font-bold text-slate-500">
                            <div>ເສື້ອ: <span className="text-sky-700">{shirtQty.toLocaleString()}</span></div>
                            <div>ໂສ້ງ: <span className="text-violet-700">{pantsQty.toLocaleString()}</span></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-3">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${FACTORY_PRODUCTION_QUEUE_STATUS_STYLES[row.status]}`}>
                            {FACTORY_PRODUCTION_QUEUE_STATUS_LABELS[row.status]}
                          </span>
                          <div className="flex gap-1">
                            {FACTORY_PRODUCTION_QUEUE_STATUS_ORDER.map((status, index) => (
                              <div
                                key={status}
                                className={`h-2 flex-1 rounded-full ${index <= currentIndex ? "bg-slate-900" : "bg-slate-200"}`}
                              />
                            ))}
                          </div>
                          <div className="text-xs font-bold leading-5 text-slate-500">
                            <div>ຜູ້ລົງສະຖານະ: <span className="break-all text-slate-700">{getUserIdentityLabel(statusActorUserId, userNameMap)}</span></div>
                            <div>ເວລາລ່າສຸດ: <span className="text-slate-700">{formatDateTime(currentStageTime || row.updated_at)}</span></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <div className={`text-base font-black ${deadlineMeta.className}`}>{deadlineMeta.label}</div>
                          <div className="text-xs font-bold text-slate-500">{deadlineMeta.sublabel}</div>
                          <div className="text-xs font-bold text-slate-500">
                            <div>ສົ່ງລູກຄ້າ: <span className="text-slate-700">{formatDisplayDate(deposit.delivery_date)}</span></div>
                            <div>ກຳນົດດ່ວນ: <span className="text-slate-700">{formatDisplayDate(deposit.urgent_due_date)}</span></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="w-[270px] space-y-3">
                          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
                            <UserRound size={14} />
                            ຜູ້ຮັບຜິດຊອບ
                          </div>
                          <select
                            value={row.planner_user_id || ""}
                            onChange={(event) => void handlePlannerChange(row, event.target.value)}
                            disabled={!canAssignPlanner || workingRowId === row.id}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400 disabled:bg-slate-50"
                          >
                            <option value="">ຍັງບໍ່ມອບໝາຍ</option>
                            {plannerOptions.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.full_name}
                              </option>
                            ))}
                          </select>
                          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-bold leading-5 text-slate-500">
                            <div>ໄອດີຜູ້ວາງ: <span className="break-all text-slate-700">{getUserIdentityLabel(row.planner_user_id, userNameMap)}</span></div>
                            <div>ໄອດີຜູ້ມອບໝາຍ: <span className="break-all text-slate-700">{getUserIdentityLabel(row.assigned_by_user_id || deposit.admin_user_id, userNameMap)}</span></div>
                            <div>ໄອດີ Graphic: <span className="break-all text-slate-700">{getUserIdentityLabel(deposit.graphic_user_id, userNameMap)}</span></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="w-[240px] space-y-3">
                          <select
                            value={row.status}
                            onChange={(event) => void handleStatusChange(row, event.target.value as FactoryProductionQueueStatus)}
                            disabled={!canEditQueue || workingRowId === row.id}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400 disabled:bg-slate-50"
                          >
                            {FACTORY_PRODUCTION_QUEUE_STATUS_ORDER.map((status) => (
                              <option key={status} value={status}>
                                {FACTORY_PRODUCTION_QUEUE_STATUS_LABELS[status]}
                              </option>
                            ))}
                          </select>

                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/factory-deposit-orders/new?id=${deposit.id}`}
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <CheckCheck size={14} />
                              ເບິ່ງໃບມັດຈຳ
                            </Link>
                            {deposit.order_code ? (
                              <Link
                                href={`/search?q=${encodeURIComponent(deposit.order_code)}`}
                                className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 transition hover:bg-sky-100"
                              >
                                <ArrowUpRight size={14} />
                                ຄົ້ນຫາອໍເດີ
                              </Link>
                            ) : null}
                          </div>

                          {row.status !== "queued" ? (
                            <button
                              type="button"
                              onClick={() => void handleStatusChange(row, "queued")}
                              disabled={!canEditQueue || workingRowId === row.id}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                            >
                              <RotateCcw size={14} />
                              ກັບໄປລໍຖ້າວາງ
                            </button>
                          ) : null}

                          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-bold leading-5 text-slate-500">
                            <div>ວາງແລ້ວ: <span className="text-slate-700">{formatDateTime(row.pattern_laid_at)}</span></div>
                            <div>ຄົບໄຊທ໌: <span className="text-slate-700">{formatDateTime(row.all_sizes_laid_at)}</span></div>
                            <div>ພ້ອມພິມ: <span className="text-slate-700">{formatDateTime(row.ready_for_print_at)}</span></div>
                            <div>ສົ່ງໂຮງງານ: <span className="text-slate-700">{formatDateTime(row.sent_to_factory_at)}</span></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rounded-[28px] border border-slate-100 bg-slate-50 px-5 py-4 text-sm font-medium text-slate-500">
        ຫນ້າຫຼັກຈະເປີດຢູ່ທີ່ “ລໍຖ້າວາງ” ເປັນຄ່າເລີ່ມຕົ້ນ ເພາະສະນັ້ນເມື່ອລາຍການໃດຖືກວາງແລ້ວ ລາຍການນັ້ນຈະບໍ່ສະແດງໃນຫນ້າຫຼັກອີກ ແຕ່ຍັງສາມາດເບິ່ງໄດ້ຈາກ tab ຂັ້ນຕອນອື່ນ.
      </div>
    </div>
  );
}
