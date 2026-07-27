"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { CheckCheck, ClipboardList, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isProductionRole } from "@/lib/role-groups";
import type { AppRole } from "@/lib/access-control";
import { buildYearOptions, type MonthFilter } from "../../reports/_lib";
import type { UserPermissionSettings } from "@/lib/user-permissions";
import {
  FACTORY_PRODUCTION_QUEUE_STATUS_STYLES,
  FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS,
  FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_ORDER,
  getFactoryProductionQueueStatusIndex,
  normalizeFactoryProductionQueueStatus,
  type FactoryProductionQueueActorFields,
  type FactoryProductionQueueStatus,
  type FactoryProductionQueueVisibleStatus,
} from "@/lib/factory-production-queue";
import { buildFactoryDesignFallbackUrl, extractProductionMockupUrls } from "@/lib/order-media";
import { getPantsTotalQty, parsePantsDraftItems } from "@/lib/order-items";
import { SendToFactoryPreviewModal } from "./send-to-factory-preview-modal";

type UserRow = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

type ViewerProfile = {
  id: string;
  role: string | null;
  permission_settings?: UserPermissionSettings | null;
};

type QueueDepositRow = {
  id: string;
  created_by_user_id: string | null;
  deposit_no: string;
  order_code: string | null;
  status: string;
  customer_name: string;
  customer_phone: string;
  team_name: string | null;
  style_name: string | null;
  color_name: string | null;
  fabric_name: string;
  notes: string | null;
  warning_note: string | null;
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

type PageView = FactoryProductionQueueVisibleStatus | "activity";
type PriorityFilter = "all" | "urgent" | "normal";

function buildEmptyStateMessage(
  statusView: PageView,
  summary: { patternLaid: number; readyForPrint: number; sentToFactory: number }
) {
  if (statusView === "queued") {
    if (summary.patternLaid > 0 || summary.readyForPrint > 0 || summary.sentToFactory > 0) {
      return "ຕອນນີ້ບໍ່ມີຄິວລໍຖ້າຮັບເພີ່ມແລ້ວ. ລາຍການຖືກຍ້າຍໄປຢູ່ໃນ tab ຂັ້ນຕອນອື່ນໆດ້ານເທິງ.";
    }
    return "ຕອນນີ້ຍັງບໍ່ມີຄິວລໍຖ້າຮັບ.";
  }

  if (statusView === "pattern_laid") return "ຕອນນີ້ຍັງບໍ່ມີລາຍການວາງ Pattern ແລ້ວ.";
  if (statusView === "ready_for_print") return "ຕອນນີ້ຍັງບໍ່ມີລາຍການວາງພ້ອມພິມແລ້ວ.";
  if (statusView === "sent_to_factory") return "ຕອນນີ້ຍັງບໍ່ມີລາຍການສົ່ງໂຮງງານແລ້ວ.";
  return "ຍັງບໍ່ມີຂໍ້ມູນໃນໜ້ານີ້.";
}

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

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getOrderPatternSizeCount(deposit: QueueDepositRow | null) {
  if (!deposit || !Array.isArray(deposit.production_items)) return 0;

  const sizeKeys = new Set<string>();

  for (const entry of deposit.production_items) {
    const row = toRecord(entry);
    const playerRows = Array.isArray(row.player_rows) ? row.player_rows : [];

    for (const playerEntry of playerRows) {
      const playerRow = toRecord(playerEntry);
      const size = typeof playerRow.size === "string" ? playerRow.size.trim().toLowerCase() : "";
      if (size) sizeKeys.add(size);
    }

    const sizes = toRecord(row.sizes);
    for (const [sizeKey, qty] of Object.entries(sizes)) {
      if ((Number(qty) || 0) > 0) {
        sizeKeys.add(sizeKey.trim().toLowerCase());
      }
    }
  }

  return sizeKeys.size;
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

function mapQueueApiErrorMessage(errorCode: string, fallback?: string) {
  if (errorCode === "no_session" || errorCode === "forbidden") return "ບໍ່ມີສິດເຂົ້າເຖິງຄິວວາງຜະລິດ";
  if (errorCode === "queue_already_claimed") return "ລາຍການນີ້ຖືກຮັບໄປແລ້ວ";
  if (errorCode === "queue_not_found") return "ບໍ່ພົບລາຍການຄິວວາງຜະລິດ";
  if (errorCode === "missing_server_env") return "Server ຍັງບໍ່ຕັ້ງຄ່າ SUPABASE_SERVICE_ROLE_KEY";
  return fallback || errorCode || "ເກີດຂໍ້ຜິດພາດ";
}

async function callQueueApi<T>(path: string, init?: RequestInit) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("no_session");
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(mapQueueApiErrorMessage(String(payload.error || ""), payload.message));
  }

  return payload as T;
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

function getUserDisplayName(userId: string | null, userNameMap: Map<string, string>) {
  if (!userId) return "-";
  const name = userNameMap.get(userId);
  return name || "-";
}

function getCurrentStageTimestamp(row: QueueEntryRow) {
  const normalizedStatus = normalizeFactoryProductionQueueStatus(row.status);
  if (normalizedStatus === "pattern_laid") return row.pattern_laid_at;
  if (normalizedStatus === "ready_for_print") return row.ready_for_print_at;
  if (normalizedStatus === "sent_to_factory") return row.sent_to_factory_at;
  return null;
}

function resolveEffectivePlannerUserId(plannerUserId: string | null, userRoleMap: Map<string, string>) {
  if (!plannerUserId) return null;
  return isProductionRole(userRoleMap.get(plannerUserId)) ? plannerUserId : null;
}

function getStageOwnerUserId(
  row: QueueEntryRow,
  stage: FactoryProductionQueueVisibleStatus,
  effectivePlannerUserId: string | null
) {
  if (stage === "queued") return effectivePlannerUserId;
  if (stage === "pattern_laid") return row.pattern_laid_by_user_id || effectivePlannerUserId;
  if (stage === "ready_for_print") return row.ready_for_print_by_user_id || effectivePlannerUserId;
  return row.sent_to_factory_by_user_id || effectivePlannerUserId;
}

function getStageFilterLabel(view: PageView) {
  if (view === "activity") return "ສະຫຼຸບການດຳເນີນງານ";
  return FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS[view];
}

function getPrimaryActionLabel(
  row: QueueEntryRow,
  statusView: PageView,
  viewerUserId: string | null,
  userNameMap: Map<string, string>,
  userRoleMap: Map<string, string>
) {
  const effectivePlannerUserId = resolveEffectivePlannerUserId(row.planner_user_id, userRoleMap);
  if (statusView === "queued") {
    if (!effectivePlannerUserId) return "ກົດຮັບງານ";
    if (effectivePlannerUserId === viewerUserId) return "ກົດຮັບງານ";
    return `ຖືກຮັບແລ້ວໂດຍ ${getUserDisplayName(effectivePlannerUserId, userNameMap)}`;
  }
  if (statusView === "pattern_laid") return "ຢືນຢັນການວາງພ້ອມພິມ";
  if (statusView === "ready_for_print") return "ຢືນຢັນການສົ່ງໂຮງງານ";
  return "ເບິ່ງລາຍລະອຽດ";
}

function getQueueEntryHref(row: QueueEntryRow) {
  const normalizedStatus = normalizeFactoryProductionQueueStatus(row.status);
  if (normalizedStatus === "ready_for_print" || normalizedStatus === "sent_to_factory") {
    return `/factory-production-queue/${row.id}/ready-for-print`;
  }
  return `/factory-production-queue/${row.id}`;
}

function getQueueListHref(status: FactoryProductionQueueVisibleStatus) {
  if (status === "pattern_laid") return "/factory-production-queue/pattern-laid";
  if (status === "ready_for_print") return "/factory-production-queue/ready-for-print";
  if (status === "sent_to_factory") return "/factory-production-queue/sent-to-factory";
  return "/factory-production-queue";
}

const BULK_STATUS_ACTIONS: Array<{ status: FactoryProductionQueueVisibleStatus; label: string; className: string }> = [
  { status: "queued", label: "ຍົກເລີກກັບໄປລໍຖ້າວາງ", className: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" },
  { status: "pattern_laid", label: "ວາງ Pattern ແລ້ວ", className: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100" },
  { status: "ready_for_print", label: "ວາງພ້ອມພິມແລ້ວ", className: "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100" },
  { status: "sent_to_factory", label: "ສົ່ງໂຮງງານແລ້ວ", className: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
];

type FactoryProductionQueuePageContentProps = {
  statusView?: PageView;
};

export function FactoryProductionQueuePageContent({ statusView = "queued" }: FactoryProductionQueuePageContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const [rows, setRows] = useState<QueueEntryRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerResolved, setViewerResolved] = useState(false);
  const [workingRowId, setWorkingRowId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [bulkUpdatingStatus, setBulkUpdatingStatus] = useState<FactoryProductionQueueVisibleStatus | null>(null);
  const [previewRow, setPreviewRow] = useState<QueueEntryRow | null>(null);
  const [confirmingSendRowId, setConfirmingSendRowId] = useState<string | null>(null);

  const [monthFilter, setMonthFilter] = useState<MonthFilter>("ALL");
  const [yearFilter, setYearFilter] = useState(today.getFullYear());
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [query, setQuery] = useState("");

  const canEditQueue = Boolean(viewerRole && (viewerRole === "superadmin" || isProductionRole(viewerRole)));
  const isProductionViewer = isProductionRole(viewerRole);

  const load = async (options?: { syncFirst?: boolean }) => {
    setLoading(true);
    setErr(null);
    setViewerResolved(false);

    try {
      const query = options?.syncFirst === true ? "?sync=1" : "";
      const payload = await callQueueApi<{
        rows: QueueEntryRow[];
        users: UserRow[];
        profile: ViewerProfile | null;
      }>(`/api/factory-production/queue${query}`);

      const profile = payload.profile ?? null;
      const normalizedViewerRole = isProductionRole(profile?.role) ? "production" : ((profile?.role as AppRole | null) ?? null);
      setViewerRole(normalizedViewerRole);
      setViewerUserId(profile?.id ?? null);
      setViewerResolved(true);

      const normalizedRows = (payload.rows ?? []).filter((row) => {
        const deposit = normalizeDeposit(row);
        return Boolean(deposit && deposit.status !== "draft" && deposit.status !== "cancelled");
      });

      setRows(normalizedRows);
      setUsers(payload.users ?? []);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "ໂຫຼດຄິວວາງຜະລິດບໍ່ສຳເລັດ");
      setRows([]);
      setUsers([]);
      setViewerResolved(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const productionUsers = useMemo(
    () => users.filter((user) => user.is_active && isProductionRole(user.role)),
    [users]
  );
  const userNameMap = useMemo(() => new Map(users.map((user) => [user.id, user.full_name])), [users]);
  const userRoleMap = useMemo(() => new Map(users.map((user) => [user.id, user.role])), [users]);

  const viewerScopedRows = useMemo(() => {
    if (!isProductionViewer) return rows;
    // Production users should see the whole department queue.
    return rows;
  }, [isProductionViewer, rows]);

  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();

    return viewerScopedRows
      .filter((row) => {
        const deposit = normalizeDeposit(row);
        if (!deposit) return false;
        if (monthFilter !== "ALL" && row.queue_month !== monthFilter) return false;
        if (row.queue_year !== yearFilter) return false;
        if (priorityFilter === "urgent" && deposit.production_priority !== "urgent") return false;
        if (priorityFilter === "normal" && deposit.production_priority === "urgent") return false;
        if (dateFromFilter && row.queue_date < dateFromFilter) return false;
        if (dateToFilter && row.queue_date > dateToFilter) return false;

        const normalizedStatus = normalizeFactoryProductionQueueStatus(row.status);
        if (statusView !== "activity" && normalizedStatus !== statusView) return false;

        if (!search) return true;

        const effectivePlannerUserId = resolveEffectivePlannerUserId(row.planner_user_id, userRoleMap);

        const haystack = [
          row.order_no,
          deposit.deposit_no,
          deposit.order_code || "",
          deposit.customer_name || "",
          deposit.customer_phone || "",
          deposit.team_name || "",
          deposit.fabric_name || "",
          effectivePlannerUserId ? getUserDisplayName(effectivePlannerUserId, userNameMap) : "",
          row.assigned_by_user_id ? getUserDisplayName(row.assigned_by_user_id, userNameMap) : "",
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
    dateFromFilter,
    dateToFilter,
    monthFilter,
    priorityFilter,
    query,
    statusView,
    userNameMap,
    userRoleMap,
    viewerScopedRows,
    yearFilter,
  ]);

  const selectableRowIds = useMemo(() => filteredRows.map((row) => row.id), [filteredRows]);
  const selectedRows = useMemo(
    () => filteredRows.filter((row) => selectedRowIds.includes(row.id)),
    [filteredRows, selectedRowIds]
  );
  const allRowsSelected =
    selectableRowIds.length > 0 && selectableRowIds.every((rowId) => selectedRowIds.includes(rowId));

  useEffect(() => {
    setSelectedRowIds((current) => current.filter((rowId) => selectableRowIds.includes(rowId)));
  }, [selectableRowIds]);

  const summary = useMemo(() => {
    return viewerScopedRows.reduce(
      (acc, row) => {
        const deposit = normalizeDeposit(row);
        const normalizedStatus = normalizeFactoryProductionQueueStatus(row.status);
        acc.total += 1;
        if (normalizedStatus === "queued") acc.queued += 1;
        if (normalizedStatus === "pattern_laid") acc.patternLaid += 1;
        if (normalizedStatus === "ready_for_print") acc.readyForPrint += 1;
        if (normalizedStatus === "sent_to_factory") acc.sentToFactory += 1;
        if (deposit?.production_priority === "urgent") acc.urgent += 1;
        return acc;
      },
      { total: 0, queued: 0, patternLaid: 0, readyForPrint: 0, sentToFactory: 0, urgent: 0 }
    );
  }, [viewerScopedRows]);

  const activityRows = useMemo(() => {
    return productionUsers
      .map((user) => {
        const stats = viewerScopedRows.reduce(
          (acc, row) => {
            const normalizedStatus = normalizeFactoryProductionQueueStatus(row.status);
            const effectivePlannerUserId = resolveEffectivePlannerUserId(row.planner_user_id, userRoleMap);
            const deposit = normalizeDeposit(row);

            if (normalizedStatus === "queued" && effectivePlannerUserId === user.id) {
              acc.acceptedCount += 1;
            }

            if (normalizedStatus === "pattern_laid" && getStageOwnerUserId(row, "pattern_laid", effectivePlannerUserId) === user.id) {
              acc.patternLaidCount += 1;
              acc.patternSizeTotal += getOrderPatternSizeCount(deposit);
            }

            if (normalizedStatus === "ready_for_print" && getStageOwnerUserId(row, "ready_for_print", effectivePlannerUserId) === user.id) {
              acc.readyForPrintCount += 1;
              acc.readyForPrintShirtTotal += getShirtTotalQty(deposit);
            }

            if (normalizedStatus === "sent_to_factory" && getStageOwnerUserId(row, "sent_to_factory", effectivePlannerUserId) === user.id) {
              acc.sentToFactoryCount += 1;
            }

            return acc;
          },
          {
            acceptedCount: 0,
            patternLaidCount: 0,
            patternSizeTotal: 0,
            readyForPrintCount: 0,
            readyForPrintShirtTotal: 0,
            sentToFactoryCount: 0,
          }
        );

        return {
          user,
          ...stats,
          totalCount: stats.acceptedCount + stats.patternLaidCount + stats.readyForPrintCount + stats.sentToFactoryCount,
        };
      })
      .filter((row) => row.totalCount > 0 || !isProductionViewer)
      .sort((a, b) => b.totalCount - a.totalCount || a.user.full_name.localeCompare(b.user.full_name));
  }, [isProductionViewer, productionUsers, userRoleMap, viewerScopedRows]);

  const handleSync = async () => {
    setSyncing(true);
    setErr(null);
    try {
      await load({ syncFirst: true });
      toast.success("ດຶງຄິວຈາກໃບມັດຈຳສຳເລັດແລ້ວ");
    } catch (error) {
      const message = error instanceof Error ? error.message : "sync ຄິວບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  };

  const claimQueueEntryIfNeeded = async (row: QueueEntryRow) => {
    if (!viewerUserId) {
      toast.error("ບໍ່ພົບ user ທີ່ກຳລັງ login");
      return false;
    }

    const normalizedStatus = normalizeFactoryProductionQueueStatus(row.status);
    if (normalizedStatus !== "queued") {
      return true;
    }

    const effectivePlannerUserId = resolveEffectivePlannerUserId(row.planner_user_id, userRoleMap);
    if (effectivePlannerUserId && effectivePlannerUserId !== viewerUserId && isProductionViewer) {
      toast.error("ລາຍການນີ້ຖືກຮັບໄປແລ້ວ");
      return false;
    }

    if (!effectivePlannerUserId) {
      await callQueueApi("/api/factory-production/queue", {
        method: "PATCH",
        body: JSON.stringify({ action: "claim", id: row.id }),
      });
      toast.success("ຮັບອໍເດີ້ສຳເລັດແລ້ວ");
    }

    return true;
  };

  const handleOpenQueueEntry = async (row: QueueEntryRow) => {
    setWorkingRowId(row.id);
    try {
      const claimed = await claimQueueEntryIfNeeded(row);
      if (!claimed) return;
      router.push(getQueueEntryHref(row));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ຮັບອໍເດີ້ບໍ່ສຳເລັດ");
    } finally {
      setWorkingRowId(null);
    }
  };

  const handleAdvanceFromList = async (
    row: QueueEntryRow,
    targetStatus: FactoryProductionQueueVisibleStatus,
    successMessage: string
  ) => {
    if (!viewerUserId) {
      toast.error("ບໍ່ພົບ user ທີ່ກຳລັງ login");
      return;
    }

    setWorkingRowId(row.id);
    setErr(null);
    try {
      const claimed = await claimQueueEntryIfNeeded(row);
      if (!claimed) return;
      await callQueueApi("/api/factory-production/queue", {
        method: "PATCH",
        body: JSON.stringify({ action: "update_status", id: row.id, targetStatus }),
      });

      toast.success(successMessage);
      await load({ syncFirst: false });
      router.push(getQueueListHref(targetStatus));
    } catch (error) {
      const message = error instanceof Error ? error.message : "ອັບເດດສະຖານະບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
    } finally {
      setWorkingRowId(null);
    }
  };

  const handleConfirmSendToFactory = async () => {
    if (!previewRow || !viewerUserId) {
      toast.error("ບໍ່ພົບລາຍການທີ່ຈະສົ່ງໂຮງງານ");
      return;
    }

    setConfirmingSendRowId(previewRow.id);
    setErr(null);
    try {
      const claimed = await claimQueueEntryIfNeeded(previewRow);
      if (!claimed) return;
      await callQueueApi("/api/factory-production/queue", {
        method: "PATCH",
        body: JSON.stringify({ action: "update_status", id: previewRow.id, targetStatus: "sent_to_factory" }),
      });

      toast.success("ຢືນຢັນການສົ່ງໂຮງງານສຳເລັດແລ້ວ");
      setPreviewRow(null);
      await load({ syncFirst: false });
      router.push("/factory-production-queue/sent-to-factory");
    } catch (error) {
      const message = error instanceof Error ? error.message : "ຢືນຢັນການສົ່ງໂຮງງານບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
    } finally {
      setConfirmingSendRowId(null);
    }
  };

  const handleToggleSelectAll = () => {
    if (allRowsSelected) {
      setSelectedRowIds([]);
      return;
    }

    setSelectedRowIds(selectableRowIds);
  };

  const handleToggleRowSelection = (rowId: string) => {
    setSelectedRowIds((current) =>
      current.includes(rowId) ? current.filter((entryId) => entryId !== rowId) : [...current, rowId]
    );
  };

  const handleBulkStatusUpdate = async (targetStatus: FactoryProductionQueueVisibleStatus) => {
    if (!viewerUserId) {
      toast.error("ບໍ່ພົບ user ທີ່ກຳລັງ login");
      return;
    }

    if (selectedRows.length === 0) {
      toast.error("ກະລຸນາເລືອກລາຍການກ່ອນ");
      return;
    }

    setBulkUpdatingStatus(targetStatus);
    setErr(null);
    try {
      await callQueueApi("/api/factory-production/queue", {
        method: "PATCH",
        body: JSON.stringify({ action: "bulk_status", ids: selectedRows.map((row) => row.id), targetStatus }),
      });

      const successLabel =
        targetStatus === "queued" ? "ລໍຖ້າວາງຜະລິດ" : FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS[targetStatus];
      toast.success(`ອັບເດດ ${selectedRows.length.toLocaleString()} ລາຍການເປັນ ${successLabel} ສຳເລັດແລ້ວ`);
      setSelectedRowIds([]);
      await load({ syncFirst: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ອັບເດດສະຖານະລາຍການບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
    } finally {
      setBulkUpdatingStatus(null);
    }
  };

  const tabs: Array<{ href: string; label: string; activeClassName: string }> = [
    { href: "/factory-production-queue", label: "ຄິວລໍຖ້າຮັບ", activeClassName: "bg-slate-900 text-white shadow-sm" },
    { href: "/factory-production-queue/pattern-laid", label: "ວາງ Pattern ແລ້ວ", activeClassName: "bg-sky-600 text-white shadow-sm" },
    { href: "/factory-production-queue/ready-for-print", label: "ວາງພ້ອມພິມແລ້ວ", activeClassName: "bg-cyan-600 text-white shadow-sm" },
    { href: "/factory-production-queue/sent-to-factory", label: "ສົ່ງໂຮງງານແລ້ວ", activeClassName: "bg-emerald-600 text-white shadow-sm" },
    { href: "/factory-production-queue/activity", label: "ສະຫຼຸບການວາງຜະລິດ", activeClassName: "bg-violet-600 text-white shadow-sm" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">ຄິວວາງຜະລິດ</h1>
          <div className="mt-2 max-w-4xl text-sm font-medium text-slate-500">
            ຈັດຄິວໃບມັດຈຳສັ່ງຜະລິດຈາກ `factory-deposit-orders` ໃຫ້ຝ່າຍວາງຜະລິດຮັບງານ, ເບິ່ງລາຍລະອຽດ, ແລະ ຢືນຢັນຜ່ານ 3 ຂັ້ນຕອນໄດ້ຈາກໜ້ານີ້.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? "ກຳລັງ sync..." : "ດຶງຄິວໃໝ່"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            ໂຫຼດຄືນ
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center rounded-2xl px-4 py-2.5 text-sm font-black transition ${
              pathname === tab.href ? tab.activeClassName : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {err ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{err}</div> : null}
      {viewerResolved && !loading && !canEditQueue ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
          user ນີ້ມີສິດເບິ່ງຂໍ້ມູນໄດ້ ແຕ່ບໍ່ສາມາດຮັບອໍເດີ້ ຫຼື ຢືນຢັນຂັ້ນຕອນໄດ້
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-black uppercase text-slate-500">ຄິວທັງໝົດ</div>
          <div className="mt-2 text-3xl font-black text-slate-900">{summary.total.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
          <div className="text-xs font-black uppercase text-amber-700">ລໍຖ້າຮັບ</div>
          <div className="mt-2 text-3xl font-black text-amber-700">{summary.queued.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
          <div className="text-xs font-black uppercase text-sky-700">ວາງ Pattern ແລ້ວ</div>
          <div className="mt-2 text-3xl font-black text-sky-700">{summary.patternLaid.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4 shadow-sm">
          <div className="text-xs font-black uppercase text-cyan-700">ພ້ອມພິມ</div>
          <div className="mt-2 text-3xl font-black text-cyan-700">{summary.readyForPrint.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
          <div className="text-xs font-black uppercase text-emerald-700">ສົ່ງໂຮງງານແລ້ວ</div>
          <div className="mt-2 text-3xl font-black text-emerald-700">{summary.sentToFactory.toLocaleString()}</div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ຄົ້ນຫາເລກອໍເດີ້ / ລູກຄ້າ / ຜູ້ມອບໝາຍ"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400 lg:col-span-2"
          />
          <select
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value === "ALL" ? "ALL" : Number(event.target.value))}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
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
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          >
            {buildYearOptions().map((year) => (
              <option key={year} value={year}>
                ປີ {year}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-700">
            {getStageFilterLabel(statusView)}
          </div>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          >
            <option value="all">ທຸກປະເພດວຽກ</option>
            <option value="urgent">ງານດ່ວນ</option>
            <option value="normal">ງານປົກກະຕິ</option>
          </select>
          <input
            type="date"
            value={dateFromFilter}
            max={dateToFilter || undefined}
            onChange={(event) => setDateFromFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          />
          <input
            type="date"
            value={dateToFilter}
            min={dateFromFilter || undefined}
            onChange={(event) => setDateToFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
          />
        </div>
      </div>

      {statusView === "activity" ? (
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 text-sm font-black text-slate-700">
            ສະຫຼຸບຜູ້ຮັບຜິດຊອບ ({activityRows.length})
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-white">
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 font-black">ຝ່າຍວາງຜະລິດ</th>
                  <th className="px-4 py-3 font-black">ຕຳແໜ່ງ</th>
                  <th className="px-4 py-3 font-black">ຮັບອໍເດີ້ໄວ້</th>
                  <th className="px-4 py-3 font-black">ວາງ Pattern ແລ້ວ</th>
                  <th className="px-4 py-3 font-black">ລວມໄຊທ໌ Pattern</th>
                  <th className="px-4 py-3 font-black">ວາງພ້ອມພິມແລ້ວ</th>
                  <th className="px-4 py-3 font-black">ລວມຈຳນວນເສື້ອພ້ອມພິມ</th>
                  <th className="px-4 py-3 font-black">ສົ່ງໂຮງງານແລ້ວ</th>
                  <th className="px-4 py-3 font-black">ລວມ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-sm font-bold text-slate-500">
                      ກຳລັງໂຫຼດຂໍ້ມູນ...
                    </td>
                  </tr>
                ) : activityRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-sm font-bold text-slate-500">
                      ຍັງບໍ່ມີຂໍ້ມູນການວາງຜະລິດ
                    </td>
                  </tr>
                ) : (
                  activityRows.map((activity) => (
                    <tr key={activity.user.id}>
                      <td className="px-4 py-4 font-black text-slate-900">{activity.user.full_name}</td>
                      <td className="px-4 py-4 font-bold text-slate-700">ຝ່າຍວາງຜະລິດ</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                          {activity.acceptedCount.toLocaleString()} ອໍເດີ້
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
                          {activity.patternLaidCount.toLocaleString()} ອໍເດີ້
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                          {activity.patternSizeTotal.toLocaleString()} ໄຊທ໌
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700">
                          {activity.readyForPrintCount.toLocaleString()} ອໍເດີ້
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
                          {activity.readyForPrintShirtTotal.toLocaleString()} ເສື້ອ
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                          {activity.sentToFactoryCount.toLocaleString()} ອໍເດີ້
                        </span>
                      </td>
                      <td className="px-4 py-4 text-lg font-black text-slate-900">{activity.totalCount.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 text-sm font-black text-slate-700">
            ລາຍການ{getStageFilterLabel(statusView)} ({filteredRows.length})
          </div>

          <div className="border-b border-slate-100 bg-white px-5 py-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="text-sm font-bold text-slate-600">
                ເລືອກໄວ້ {selectedRows.length.toLocaleString()} ລາຍການ
                <span className="ml-2 text-slate-400">ໃຊ້ສຳລັບປັບສະຖານະອໍເດີ້ເກົ່າທີ່ຍັງຄ້າງ</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {BULK_STATUS_ACTIONS.map((action) => (
                  <button
                    key={action.status}
                    type="button"
                    onClick={() => void handleBulkStatusUpdate(action.status)}
                    disabled={!canEditQueue || selectedRows.length === 0 || bulkUpdatingStatus !== null}
                    className={`inline-flex items-center rounded-2xl border px-3 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${action.className}`}
                  >
                    {bulkUpdatingStatus === action.status ? "ກຳລັງອັບເດດ..." : action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1340px] w-full text-sm">
              <thead className="border-b border-slate-100 bg-white">
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 font-black">
                    <label className="inline-flex items-center gap-2 text-slate-600">
                      <input
                        type="checkbox"
                        checked={allRowsSelected}
                        onChange={handleToggleSelectAll}
                        disabled={!canEditQueue || filteredRows.length === 0}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                      />
                      ທັງໝົດ
                    </label>
                  </th>
                  <th className="px-4 py-3 font-black">ວັນທີສົ່ງຜະລິດ</th>
                  <th className="px-4 py-3 font-black">ເລກອໍເດີ້</th>
                  <th className="px-4 py-3 font-black">ຮູບອໍເດີ້</th>
                  <th className="px-4 py-3 font-black">ປະເພດງານ</th>
                  <th className="px-4 py-3 font-black">ຜູ້ມອບໝາຍ</th>
                  <th className="px-4 py-3 font-black">ຈຳນວນ</th>
                  <th className="px-4 py-3 font-black">ກຳນົດສົ່ງ</th>
                  <th className="px-4 py-3 font-black">ສະຖານະ</th>
                  <th className="px-4 py-3 font-black">ຈັດການ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center text-sm font-bold text-slate-500">
                      ກຳລັງໂຫຼດຂໍ້ມູນ...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center text-sm font-bold text-slate-500">
                      <div className="space-y-3">
                        <div>{buildEmptyStateMessage(statusView, summary)}</div>
                        {statusView === "queued" && (summary.patternLaid > 0 || summary.readyForPrint > 0 || summary.sentToFactory > 0) ? (
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {summary.patternLaid > 0 ? (
                              <Link
                                href="/factory-production-queue/pattern-laid"
                                className="inline-flex items-center rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 transition hover:bg-sky-100"
                              >
                                ໄປ tab ວາງ Pattern ແລ້ວ ({summary.patternLaid.toLocaleString()})
                              </Link>
                            ) : null}
                            {summary.readyForPrint > 0 ? (
                              <Link
                                href="/factory-production-queue/ready-for-print"
                                className="inline-flex items-center rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-700 transition hover:bg-cyan-100"
                              >
                                ໄປ tab ວາງພ້ອມພິມແລ້ວ ({summary.readyForPrint.toLocaleString()})
                              </Link>
                            ) : null}
                            {summary.sentToFactory > 0 ? (
                              <Link
                                href="/factory-production-queue/sent-to-factory"
                                className="inline-flex items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                              >
                                ໄປ tab ສົ່ງໂຮງງານແລ້ວ ({summary.sentToFactory.toLocaleString()})
                              </Link>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const deposit = normalizeDeposit(row);
                    if (!deposit) return null;

                    const previewImageUrl = getPreviewImageUrl(deposit);
                    const styleCount = getStyleCount(deposit);
                    const shirtQty = getShirtTotalQty(deposit);
                    const pantsQty = getPantsQty(deposit);
                    const totalQty = shirtQty + pantsQty;
                    const deadlineMeta = getDeadlineMeta(deposit);
                    const normalizedStatus = normalizeFactoryProductionQueueStatus(row.status);
                    const currentStageTime = getCurrentStageTimestamp(row);
                    const currentIndex = getFactoryProductionQueueStatusIndex(row.status);
                    const effectivePlannerUserId = resolveEffectivePlannerUserId(row.planner_user_id, userRoleMap);
                    const stageOwnerUserId = getStageOwnerUserId(row, normalizedStatus, effectivePlannerUserId);
                    const isUrgent = deposit.production_priority === "urgent";
                    const actionLabel = getPrimaryActionLabel(row, statusView, viewerUserId, userNameMap, userRoleMap);
                    const assignerName = getUserDisplayName(row.assigned_by_user_id || deposit.admin_user_id, userNameMap);
                    const isClaimedByOther = Boolean(
                      normalizedStatus === "queued" && effectivePlannerUserId && effectivePlannerUserId !== viewerUserId
                    );
                    const canUsePrimaryAction = statusView !== "sent_to_factory";

                    return (
                      <tr key={row.id} className={isUrgent ? "bg-rose-50/30" : ""}>
                        <td className="px-4 py-4 align-top">
                          <input
                            type="checkbox"
                            checked={selectedRowIds.includes(row.id)}
                            onChange={() => handleToggleRowSelection(row.id)}
                            disabled={!canEditQueue}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                          />
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-2">
                            <div className="font-black text-slate-900">{formatDisplayDate(deposit.production_sent_date)}</div>
                            <div className="text-xs font-bold text-slate-500">ເຂົ້າຄິວ {formatDisplayDate(row.queue_date)}</div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-2">
                            <div className="font-black text-slate-900">{row.order_no || "-"}</div>
                            <div className="text-sm font-bold text-slate-600">{deposit.order_code || deposit.deposit_no}</div>
                            <div className="text-xs font-bold text-slate-500">{deposit.team_name || deposit.customer_name || "-"}</div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            {previewImageUrl ? (
                              <img
                                src={previewImageUrl}
                                alt={deposit.order_code || deposit.deposit_no}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <div className="px-2 text-center text-[11px] font-bold text-slate-400">ບໍ່ມີຮູບ</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-2">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${
                                isUrgent
                                  ? "border border-rose-200 bg-rose-50 text-rose-700"
                                  : "border border-slate-200 bg-slate-50 text-slate-600"
                              }`}
                            >
                              {isUrgent ? "ງານດ່ວນ" : "ງານປົກກະຕິ"}
                            </span>
                            <div className="text-xs font-bold text-slate-500">{styleCount > 0 ? `${styleCount} ແບບ` : "ບໍ່ພົບ mockup"}</div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-2">
                            <div className="font-black text-slate-900">{assignerName}</div>
                            <div className="text-xs font-bold text-slate-500">ຜູ້ສ້າງບິນມັດຈຳ</div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-2">
                            <div className="text-2xl font-black text-slate-900">{totalQty.toLocaleString()}</div>
                            <div className="text-xs font-bold text-slate-500">
                              <div>ເສື້ອ: <span className="text-sky-700">{shirtQty.toLocaleString()}</span></div>
                              <div>ໂສ້ງ: <span className="text-violet-700">{pantsQty.toLocaleString()}</span></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-2">
                            <div className="text-xs font-bold text-slate-500">ສົ່ງລູກຄ້າ</div>
                            <div className={`text-base font-black ${deadlineMeta.className}`}>{formatDisplayDate(deposit.delivery_date)}</div>
                            <div className="text-xs font-bold text-slate-500">
                              <div>{deadlineMeta.label}</div>
                              <div>ສົ່ງຜະລິດ: <span className="text-slate-700">{formatDisplayDate(deposit.production_sent_date)}</span></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="w-[280px] space-y-3">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${FACTORY_PRODUCTION_QUEUE_STATUS_STYLES[normalizedStatus]}`}>
                              {FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS[normalizedStatus]}
                            </span>

                            <div className="flex gap-1">
                              {FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_ORDER.map((stage, index) => (
                                <div
                                  key={stage}
                                  className={`h-2 flex-1 rounded-full ${index <= currentIndex ? "bg-slate-900" : "bg-slate-200"}`}
                                />
                              ))}
                            </div>

                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-bold leading-5 text-slate-500">
                              <div>{stageOwnerUserId ? `ຜູ້ຮັບຜິດຊອບ: ${getUserDisplayName(stageOwnerUserId, userNameMap)}` : "ຍັງບໍ່ທັນມີຜູ້ຮັບວຽກ"}</div>
                              <div className="mt-1">ອັບເດດລ່າສຸດ: <span className="text-slate-700">{formatDateTime(currentStageTime || row.updated_at)}</span></div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="w-[240px] space-y-3">
                            {canUsePrimaryAction ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (statusView === "queued") {
                                    void handleOpenQueueEntry(row);
                                    return;
                                  }
                                  if (statusView === "pattern_laid") {
                                    void handleAdvanceFromList(row, "ready_for_print", "ຢືນຢັນການວາງພ້ອມພິມສຳເລັດແລ້ວ");
                                    return;
                                  }
                                  if (statusView === "ready_for_print") {
                                    setPreviewRow(row);
                                  }
                                }}
                                disabled={
                                  !canEditQueue ||
                                  workingRowId === row.id ||
                                  confirmingSendRowId === row.id ||
                                  Boolean(isClaimedByOther && isProductionViewer)
                                }
                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <CheckCheck size={14} />
                                {actionLabel}
                              </button>
                            ) : null}

                            <Link
                              href={getQueueEntryHref(row)}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm font-black text-sky-700 transition hover:bg-sky-100"
                            >
                              <ClipboardList size={14} />
                              ລາຍລະອຽດງານ
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-slate-100 bg-slate-50 px-5 py-4 text-sm font-medium text-slate-500">
        ຫນ້າຫຼັກ `factory-production-queue` ຈະສະແດງສະເພາະລາຍການທີ່ກຳລັງລໍຖ້າວາງຜະລິດ. ຫຼັງຈາກຢືນຢັນ “ວາງ Pattern ແລ້ວ” ລາຍການນັ້ນຈະຍ້າຍໄປຢູ່ຫນ້າຂັ້ນຕອນຖັດໄປທັນທີ.
      </div>

      {previewRow ? (
        <SendToFactoryPreviewModal
          row={previewRow}
          userNameMap={userNameMap}
          viewerUserId={viewerUserId}
          confirming={confirmingSendRowId === previewRow.id}
          onClose={() => {
            if (confirmingSendRowId) return;
            setPreviewRow(null);
          }}
          onConfirm={handleConfirmSendToFactory}
        />
      ) : null}
    </div>
  );
}
