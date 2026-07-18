"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, CheckCheck, RefreshCw, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isProductionRole } from "@/lib/role-groups";
import { PatternMockupViewer } from "./pattern-mockup-viewer";
import { SendToFactoryPreviewModal } from "./send-to-factory-preview-modal";
import type { AppRole } from "@/lib/access-control";
import type { UserPermissionSettings } from "@/lib/user-permissions";
import {
  FACTORY_PRODUCTION_QUEUE_STATUS_STYLES,
  FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS,
  FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_ORDER,
  getFactoryProductionQueueNextStatus,
  getFactoryProductionQueuePreviousStatus,
  getFactoryProductionQueueStatusIndex,
  normalizeFactoryProductionQueueStatus,
  type FactoryProductionQueueActorFields,
  type FactoryProductionQueueStatus,
} from "@/lib/factory-production-queue";
import { buildFactoryDesignFallbackUrl, extractProductionMockupUrls, toDisplayMediaUrl } from "@/lib/order-media";
import { getPantsTotalQty, parsePantsDraftItems } from "@/lib/order-items";

type ViewerProfile = {
  id: string;
  role: string | null;
  permission_settings?: UserPermissionSettings | null;
};

type UserRow = {
  id: string;
  full_name: string;
  role: string;
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
  queue_date: string;
  queue_number: string;
  order_no: string;
  planner_user_id: string | null;
  status: FactoryProductionQueueStatus;
  notes: string;
  pattern_laid_at: string | null;
  all_sizes_laid_at: string | null;
  ready_for_print_at: string | null;
  sent_to_factory_at: string | null;
  updated_at: string;
  deposit: QueueDepositRow | QueueDepositRow[] | null;
};

type ParsedPlayerRow = {
  id: string;
  size: string;
  playerName: string;
  jerseyNumber: string;
  note: string;
};

type ParsedProductionItem = {
  order: number;
  mockupUrl: string | null;
  sleeveType: string | null;
  collarType: string | null;
  hemType: string | null;
  playerMode: string | null;
  playerRows: ParsedPlayerRow[];
  sizes: Record<string, number>;
  totalQty: number;
  playerRowsCount: number;
};

const PRODUCTION_SIZE_LABELS: Record<string, string> = {
  xs: "XS",
  jxs: "JXS",
  js: "JS",
  jm: "JM",
  jl: "JL",
  jxl: "JXL",
  j2xl: "J2XL",
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
  "2xl": "2XL",
  "3xl": "3XL",
  "4xl": "4XL",
  "5xl": "5XL",
  "6xl": "6XL",
};

const PRODUCTION_SLEEVE_LABELS: Record<string, string> = {
  short: "ແຂນສັ້ນ",
  long: "ແຂນຍາວ",
  mixed: "ແຂນສັ້ນ/ແຂນຍາວ",
  raglan: "ແຂນກິ້ນ",
  basketball: "ເສື້ອບາສ",
};

const PRODUCTION_COLLAR_LABELS: Record<string, string> = {
  crew: "ຄໍມົນ",
  crew_dyed_rib: "ຄໍມົນຜ້າບຸ້ງຍ້ອມ",
  crew_printed_rib: "ຄໍມົນຜ້າບຸ້ງພິມລາຍ",
  polo: "ໂປໂລ",
  mandarin: "ຄໍຈີນ",
  v_cut_polo: "ຄໍໂປໂລວີຕັດ",
  v_neck: "ຄໍວີ",
  cross_v: "ຄໍວີໄຂວ່",
  cut_v: "ຄໍວີຕັດ",
  pentagon: "ຄໍ 5 ຫຼ່ຽມ",
  v_polo: "ຄໍໂປໂລວີ",
  cross_v_polo: "ຄໍໂປໂລວີໄຂວ່",
  y_neck: "ຄໍ Y",
  sharp_v: "ຄໍ V ໂຊສາບ",
};

const PRODUCTION_HEM_LABELS: Record<string, string> = {
  straight: "ຕີນຊື່",
  curved: "ຕີນໂຄ້ງ",
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return fallback;
}

function mapQueueApiErrorMessage(errorCode: string, fallback?: string) {
  if (errorCode === "no_session" || errorCode === "forbidden") return "ບໍ່ມີສິດເຂົ້າເຖິງຄິວວາງຜະລິດ";
  if (errorCode === "queue_already_claimed") return "ລາຍການນີ້ຖືກຮັບໂດຍຜູ້ອື່ນແລ້ວ";
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

function normalizeDeposit(row: QueueEntryRow | null) {
  if (!row) return null;
  if (Array.isArray(row.deposit)) return row.deposit[0] ?? null;
  return row.deposit ?? null;
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

function resolveEffectivePlannerUserId(plannerUserId: string | null, userRoleMap: Map<string, string>) {
  if (!plannerUserId) return null;
  return isProductionRole(userRoleMap.get(plannerUserId)) ? plannerUserId : null;
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

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toNumberRecord(value: unknown) {
  const record = toRecord(value);
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, Math.max(0, Number(entry) || 0)]));
}

function parsePlayerRows(value: unknown) {
  if (!Array.isArray(value)) return [] as ParsedPlayerRow[];

  return value
    .map((entry, index) => {
      const row = toRecord(entry);
      const sizeValue = typeof row.size === "string" ? row.size : "";
      const playerName = typeof row.player_name === "string" ? row.player_name.trim() : "";
      const jerseyNumber = typeof row.jersey_number === "string" ? row.jersey_number.trim() : "";
      const note = typeof row.note === "string" ? row.note.trim() : "";
      return {
        id: typeof row.id === "string" ? row.id : `player-row-${index + 1}`,
        size: sizeValue,
        playerName,
        jerseyNumber,
        note,
      };
    })
    .filter((row) => row.size || row.playerName || row.jerseyNumber || row.note);
}

function buildPlayerSizeMap(playerRows: ParsedPlayerRow[]) {
  const derived: Record<string, number> = {};
  for (const row of playerRows) {
    if (!row.size) continue;
    derived[row.size] = (Number(derived[row.size]) || 0) + 1;
  }
  return derived;
}

function parseProductionItems(raw: unknown) {
  if (!Array.isArray(raw)) return [] as ParsedProductionItem[];

  return raw
    .map((entry, index) => {
      const row = toRecord(entry);
      const playerRows = parsePlayerRows(row.player_rows);
      const playerMode = typeof row.player_mode === "string" ? row.player_mode : "none";
      const baseSizes = row.sizes ? toNumberRecord(row.sizes) : {};
      const playerSizes = buildPlayerSizeMap(playerRows);
      const sizes = Object.keys(playerSizes).length > 0 ? playerSizes : baseSizes;
      const totalQty = Math.max(
        0,
        Number(row.total_qty) || Object.values(sizes).reduce((sum, qty) => sum + qty, 0) || playerRows.length
      );

      return {
        order: Math.max(1, Number(row.order) || index + 1),
        mockupUrl: toDisplayMediaUrl(typeof row.mockup_url === "string" ? row.mockup_url : null),
        sleeveType: typeof row.sleeve_type === "string" ? row.sleeve_type : null,
        collarType: typeof row.collar_type === "string" ? row.collar_type : null,
        hemType: typeof row.hem_type === "string" ? row.hem_type : null,
        playerMode,
        playerRows,
        sizes,
        totalQty,
        playerRowsCount: playerRows.length,
      };
    })
    .filter((item) => item.totalQty > 0 || item.mockupUrl || Object.keys(item.sizes).length > 0 || item.playerRows.length > 0);
}

function formatRawLabel(value: string | null) {
  if (!value) return "-";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getNextActionLabel(status: FactoryProductionQueueStatus) {
  const nextStatus = getFactoryProductionQueueNextStatus(status);
  if (nextStatus === "pattern_laid") return "ຢືນຢັນການວາງ Pattern ສຳເລັດ";
  if (nextStatus === "ready_for_print") return "ຢືນຢັນການວາງພ້ອມພິມ";
  if (nextStatus === "sent_to_factory") return "ຢືນຢັນການສົ່ງໂຮງງານ";
  return null;
}

function getRevertActionLabel(status: FactoryProductionQueueStatus) {
  const previousStatus = getFactoryProductionQueuePreviousStatus(status);
  if (!previousStatus) return null;
  if (previousStatus === "queued") return "ຍົກເລີກກັບໄປລໍຖ້າວາງ";
  if (previousStatus === "pattern_laid") return "ຍົກເລີກກັບໄປວາງ Pattern";
  if (previousStatus === "ready_for_print") return "ຍົກເລີກກັບໄປວາງພ້ອມພິມ";
  return null;
}

function getSizeEntries(sizes: Record<string, number>) {
  return Object.entries(sizes)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([size, qty]) => ({
      key: size,
      label: PRODUCTION_SIZE_LABELS[size] || size.toUpperCase(),
      qty: Number(qty) || 0,
    }));
}

function getSleeveLabel(value: string | null) {
  if (!value) return "-";
  return PRODUCTION_SLEEVE_LABELS[value] || formatRawLabel(value);
}

function getCollarLabel(value: string | null) {
  if (!value) return "-";
  return PRODUCTION_COLLAR_LABELS[value] || formatRawLabel(value);
}

function getHemLabel(value: string | null) {
  if (!value) return "-";
  return PRODUCTION_HEM_LABELS[value] || formatRawLabel(value);
}

function playerModeNeedsName(mode: string | null) {
  return mode === "name_only" || mode === "name_and_number";
}

function playerModeNeedsNumber(mode: string | null) {
  return mode === "number_only" || mode === "name_and_number";
}

function getQueueDetailHref(queueId: string, status: FactoryProductionQueueStatus) {
  const normalizedStatus = normalizeFactoryProductionQueueStatus(status);
  if (normalizedStatus === "ready_for_print" || normalizedStatus === "sent_to_factory") {
    return `/factory-production-queue/${queueId}/ready-for-print`;
  }
  return `/factory-production-queue/${queueId}`;
}

function getQueueListHrefByStatus(status: FactoryProductionQueueStatus) {
  const normalizedStatus = normalizeFactoryProductionQueueStatus(status);
  if (normalizedStatus === "pattern_laid") return "/factory-production-queue/pattern-laid";
  if (normalizedStatus === "ready_for_print") return "/factory-production-queue/ready-for-print";
  if (normalizedStatus === "sent_to_factory") return "/factory-production-queue/sent-to-factory";
  return "/factory-production-queue";
}

function getBackHref(detailMode: "pattern" | "ready_for_print", status: FactoryProductionQueueStatus | null) {
  if (!status) return "/factory-production-queue";
  const normalizedStatus = normalizeFactoryProductionQueueStatus(status);
  if (detailMode === "ready_for_print") {
    return normalizedStatus === "sent_to_factory"
      ? "/factory-production-queue/sent-to-factory"
      : "/factory-production-queue/ready-for-print";
  }
  return normalizedStatus === "pattern_laid" ? "/factory-production-queue/pattern-laid" : "/factory-production-queue";
}

type QueueDetailPageProps = {
  queueId: string;
  detailMode?: "pattern" | "ready_for_print";
};

export function QueueDetailPage({ queueId, detailMode = "pattern" }: QueueDetailPageProps) {
  const router = useRouter();
  const [row, setRow] = useState<QueueEntryRow | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerResolved, setViewerResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showSendPreview, setShowSendPreview] = useState(false);

  const canEditQueue = Boolean(viewerRole && (viewerRole === "superadmin" || isProductionRole(viewerRole)));

  const load = async () => {
    setLoading(true);
    setErr(null);
    setViewerResolved(false);

    try {
      if (!queueId?.trim()) {
        throw new Error("ບໍ່ພົບລະຫັດຄິວວາງຜະລິດ");
      }

      const payload = await callQueueApi<{
        row: QueueEntryRow;
        users: UserRow[];
        profile: ViewerProfile | null;
      }>(`/api/factory-production/queue/${queueId}`);

      const profile = payload.profile ?? null;
      const normalizedViewerRole = isProductionRole(profile?.role) ? "production" : ((profile?.role as AppRole | null) ?? null);
      setViewerRole(normalizedViewerRole);
      setViewerUserId(profile?.id ?? null);
      setViewerResolved(true);
      setUsers(payload.users ?? []);
      setRow(payload.row ?? null);
    } catch (error) {
      setErr(getErrorMessage(error, "ໂຫຼດລາຍລະອຽດຄິວບໍ່ສຳເລັດ"));
      setRow(null);
      setUsers([]);
      setViewerResolved(true);
    } finally {
      setLoading(false);
    }
  };

  const triggerLoad = useEffectEvent(() => {
    void load();
  });

  useEffect(() => {
    triggerLoad();
  }, [queueId]);

  const userNameMap = useMemo(() => new Map(users.map((user) => [user.id, user.full_name])), [users]);
  const userRoleMap = useMemo(() => new Map(users.map((user) => [user.id, user.role])), [users]);
  const deposit = normalizeDeposit(row);
  const effectivePlannerUserId = row ? resolveEffectivePlannerUserId(row.planner_user_id, userRoleMap) : null;
  const normalizedStatus = row ? normalizeFactoryProductionQueueStatus(row.status) : "queued";
  const nextStatus = row ? getFactoryProductionQueueNextStatus(row.status) : null;
  const previousStatus = row ? getFactoryProductionQueuePreviousStatus(row.status) : null;
  const nextActionLabel = row ? getNextActionLabel(row.status) : null;
  const revertActionLabel = row ? getRevertActionLabel(row.status) : null;
  const backHref = getBackHref(detailMode, row?.status ?? null);
  const pageTitle = detailMode === "ready_for_print" ? "ລາຍລະອຽດການວາງພ້ອມພິມ" : "ລາຍລະອຽດການວາງ Pattern";
  const pageSubtitle =
    detailMode === "ready_for_print"
      ? "ເບິ່ງຂໍ້ມູນການວາງພ້ອມພິມ ແລະ ການກຽມສົ່ງໂຮງງານໂດຍບໍ່ປົນກັບໜ້າວາງ Pattern."
      : "ເບິ່ງຂໍ້ມູນການວາງ Pattern ແບບລະອຽດ ແລະ ຈັດການຂັ້ນຕອນກ່ອນເຂົ້າຫນ້າວາງພ້ອມພິມ.";
  const deadlineMeta = getDeadlineMeta(deposit);
  const shirtTotalQty = getShirtTotalQty(deposit);
  const pantsItems = deposit ? parsePantsDraftItems(deposit.pants_items) : [];
  const pantsTotalQty = pantsItems.reduce((sum, item) => sum + getPantsTotalQty(item), 0);
  const productionItems = deposit ? parseProductionItems(deposit.production_items) : [];
  const previewUrls = deposit ? extractProductionMockupUrls(deposit.production_items) : [];
  const fallbackPreviewUrl = deposit ? buildFactoryDesignFallbackUrl(deposit.factory_bill_code) : null;
  const allPreviewUrls = previewUrls.length > 0 ? previewUrls : fallbackPreviewUrl ? [fallbackPreviewUrl] : [];
  const canEditCurrentRow = Boolean(
    canEditQueue && !(effectivePlannerUserId && viewerUserId && effectivePlannerUserId !== viewerUserId && isProductionRole(viewerRole))
  );
  const uniqueHemLabels = Array.from(new Set(productionItems.map((item) => getHemLabel(item.hemType)).filter((label) => label !== "-")));
  const signatureFields = [
    {
      label: "ຜູ້ອອກໃບສັ່ງຜະລິດ",
      name: getUserDisplayName(deposit?.created_by_user_id || row?.assigned_by_user_id || deposit?.admin_user_id || null, userNameMap),
    },
    {
      label: "ຜູ້ວາງແບບ",
      name: getUserDisplayName(
        row?.pattern_laid_by_user_id ||
          (row && normalizeFactoryProductionQueueStatus(row.status) !== "queued" ? effectivePlannerUserId : null)
        ,
        userNameMap
      ),
    },
    {
      label: "ຜູ້ວາງພ້ອມພິມ",
      name: getUserDisplayName(
        row?.ready_for_print_by_user_id ||
          (row &&
          (normalizeFactoryProductionQueueStatus(row.status) === "ready_for_print" ||
            normalizeFactoryProductionQueueStatus(row.status) === "sent_to_factory")
            ? effectivePlannerUserId
            : null)
        ,
        userNameMap
      ),
    },
    {
      label: "ຜູ້ສົ່ງໂຮງງານ",
      name: getUserDisplayName(
        row?.sent_to_factory_by_user_id ||
          (row && normalizeFactoryProductionQueueStatus(row.status) === "sent_to_factory" ? effectivePlannerUserId : null)
        ,
        userNameMap
      ),
    },
  ];

  useEffect(() => {
    if (!row) return;
    const canonicalHref = getQueueDetailHref(row.id, row.status);
    const shouldBeReadyPage = canonicalHref.endsWith("/ready-for-print");
    if (detailMode === "ready_for_print" && !shouldBeReadyPage) {
      router.replace(canonicalHref);
    }
    if (detailMode === "pattern" && shouldBeReadyPage) {
      router.replace(canonicalHref);
    }
  }, [detailMode, row, router]);

  const handleClaim = async () => {
    if (!row || !viewerUserId) {
      toast.error("ບໍ່ພົບ user ທີ່ login");
      return;
    }

    if (effectivePlannerUserId && effectivePlannerUserId !== viewerUserId) {
      toast.error("ລາຍການນີ້ຖືກຮັບໄປແລ້ວ");
      return;
    }

    setSaving(true);
    try {
      await callQueueApi("/api/factory-production/queue", {
        method: "PATCH",
        body: JSON.stringify({ action: "claim", id: row.id }),
      });

      toast.success("ຮັບອໍເດີ້ສຳເລັດແລ້ວ");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, "ຮັບອໍເດີ້ບໍ່ສຳເລັດ"));
    } finally {
      setSaving(false);
    }
  };

  const handleAdvanceStatus = async () => {
    if (!row || !viewerUserId || !nextStatus) {
      toast.error("ບໍ່ສາມາດອັບເດດຂັ້ນຕອນໄດ້");
      return;
    }

    if (nextStatus === "sent_to_factory") {
      setShowSendPreview(true);
      return;
    }

    setSaving(true);
    try {
      await callQueueApi("/api/factory-production/queue", {
        method: "PATCH",
        body: JSON.stringify({ action: "update_status", id: row.id, targetStatus: nextStatus }),
      });

      toast.success(nextActionLabel || "ອັບເດດຂັ້ນຕອນສຳເລັດແລ້ວ");
      router.replace(getQueueListHrefByStatus(nextStatus));
    } catch (error) {
      toast.error(getErrorMessage(error, "ອັບເດດຂັ້ນຕອນບໍ່ສຳເລັດ"));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmSendToFactory = async () => {
    if (!row || !viewerUserId) {
      toast.error("ບໍ່ສາມາດອັບເດດຂັ້ນຕອນໄດ້");
      return;
    }

    setSaving(true);
    try {
      await callQueueApi("/api/factory-production/queue", {
        method: "PATCH",
        body: JSON.stringify({ action: "update_status", id: row.id, targetStatus: "sent_to_factory" }),
      });

      toast.success("ຢືນຢັນການສົ່ງໂຮງງານສຳເລັດແລ້ວ");
      setShowSendPreview(false);
      router.replace(getQueueListHrefByStatus("sent_to_factory"));
    } catch (error) {
      toast.error(getErrorMessage(error, "ອັບເດດຂັ້ນຕອນບໍ່ສຳເລັດ"));
    } finally {
      setSaving(false);
    }
  };

  const handleRevertStatus = async (targetStatus: FactoryProductionQueueStatus | null) => {
    if (!row || !viewerUserId || !targetStatus) {
      toast.error("ບໍ່ສາມາດຍົກເລີກຂັ້ນຕອນໄດ້");
      return;
    }

    setSaving(true);
    try {
      await callQueueApi("/api/factory-production/queue", {
        method: "PATCH",
        body: JSON.stringify({ action: "update_status", id: row.id, targetStatus }),
      });

      toast.success(revertActionLabel || "ຍົກເລີກຂັ້ນຕອນສຳເລັດແລ້ວ");
      const nextHref = getQueueDetailHref(row.id, targetStatus);
      if (nextHref !== getQueueDetailHref(row.id, row.status)) {
        router.replace(nextHref);
        return;
      }
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, "ຍົກເລີກຂັ້ນຕອນບໍ່ສຳເລັດ"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3">
            <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-black text-slate-600 transition hover:text-slate-900">
              <ArrowLeft size={16} />
              ກັບໄປໜ້າລາຍການ
            </Link>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{pageTitle}</h1>
          <div className="mt-2 text-sm font-medium text-slate-500">{pageSubtitle}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            ໂຫຼດຄືນ
          </button>
          {row && !effectivePlannerUserId ? (
            <button
              type="button"
              onClick={() => void handleClaim()}
              disabled={!canEditCurrentRow || saving}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
            >
              <UserRound size={16} />
              ກົດຮັບງານ
            </button>
          ) : null}
          {row && nextStatus ? (
            <button
              type="button"
              onClick={() => void handleAdvanceStatus()}
              disabled={!canEditCurrentRow || saving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
            >
              <CheckCheck size={16} />
              {nextActionLabel}
            </button>
          ) : null}
          {row && previousStatus ? (
            <button
              type="button"
              onClick={() => void handleRevertStatus(previousStatus)}
              disabled={!canEditCurrentRow || saving}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
            >
              {revertActionLabel}
            </button>
          ) : null}
        </div>
      </div>

      {err ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{err}</div> : null}
      {viewerResolved && !loading && !canEditQueue ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
          user ນີ້ມີສິດເບິ່ງຂໍ້ມູນໄດ້ ແຕ່ບໍ່ສາມາດຢືນຢັນຂັ້ນຕອນໄດ້
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-slate-100 bg-white px-5 py-16 text-center text-sm font-bold text-slate-500 shadow-sm">
          ກຳລັງໂຫຼດລາຍລະອຽດ...
        </div>
      ) : row && deposit ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-black uppercase text-slate-500">ຄິວ / ອໍເດີ້</div>
              <div className="mt-2 text-2xl font-black text-slate-900">#{row.queue_number}</div>
              <div className="mt-1 text-sm font-bold text-slate-600">{row.order_no || deposit.order_code || "-"}</div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-black uppercase text-slate-500">ຈຳນວນລວມ</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{(shirtTotalQty + pantsTotalQty).toLocaleString()}</div>
              <div className="mt-1 text-sm font-bold text-slate-600">ເສື້ອ {shirtTotalQty.toLocaleString()} / ໂສ້ງ {pantsTotalQty.toLocaleString()}</div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-black uppercase text-slate-500">ກຳນົດສົ່ງ</div>
              <div className={`mt-2 text-2xl font-black ${deadlineMeta.className}`}>{deadlineMeta.label}</div>
              <div className="mt-1 text-sm font-bold text-slate-600">{deadlineMeta.sublabel}</div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-black uppercase text-slate-500">ສະຖານະປັດຈຸບັນ</div>
              <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${FACTORY_PRODUCTION_QUEUE_STATUS_STYLES[normalizedStatus]}`}>
                {FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS[normalizedStatus]}
              </span>
              <div className="mt-2 text-sm font-bold text-slate-600">ອັບເດດລ່າສຸດ {formatDateTime(row.updated_at)}</div>
            </div>
          </div>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-[24px] border border-slate-300 p-5">
                <div className="text-lg font-black text-slate-700">ຊື່ທີມ:</div>
                <div className="mt-2 text-4xl font-black text-slate-900">{deposit.team_name || deposit.customer_name || "-"}</div>
                <div className="mt-5 text-2xl font-black text-slate-700">
                  ລະຫັດອໍເດີ້: <span className="text-sky-700">{deposit.order_code || row.order_no || "-"}</span>
                </div>
                <div className="mt-2 text-xl font-black text-slate-700">
                  ຜ້າ: <span className="text-slate-900">{deposit.fabric_name || "-"}</span>
                </div>
                <div className="mt-2 text-xl font-black text-slate-700">
                  ຕີນເສື້ອ: <span className="text-slate-900">{uniqueHemLabels.join(", ") || "-"}</span>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-300 p-5">
                <div className="text-2xl font-black text-slate-700">
                  ວັນທີ່ສົ່ງຜະລິດ: <span className="text-slate-900">{deposit.production_sent_date || "-"}</span>
                </div>
                <div className="mt-2 text-2xl font-black text-slate-700">
                  ກຳນົດສົ່ງລູກຄ້າ: <span className="text-slate-900">{deposit.delivery_date || "-"}</span>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-sky-50 px-4 py-4">
                    <div className="text-sm font-black text-slate-700">ຈຳນວນເສື້ອ</div>
                    <div className="mt-2 text-5xl font-black leading-none text-sky-700">{shirtTotalQty.toLocaleString()}</div>
                  </div>
                  <div className="rounded-2xl bg-indigo-50 px-4 py-4">
                    <div className="text-sm font-black text-slate-700">ຈຳນວນໂສ້ງ</div>
                    <div className="mt-2 text-5xl font-black leading-none text-indigo-700">{pantsTotalQty.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`mt-4 rounded-2xl border px-4 py-3 text-center text-lg font-black ${
                deposit.production_priority === "urgent"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-sky-200 bg-sky-50 text-sky-700"
              }`}
            >
              ປະເພດງານ: {deposit.production_priority === "urgent" ? "ງານດ່ວນ" : "ງານປົກກະຕິ"}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {productionItems.map((item) => {
                const sizeEntries = getSizeEntries(item.sizes);
                return (
                  <div key={`${item.order}-${item.mockupUrl || "no-image"}`} className="flex min-h-0 flex-col">
                    <div className="rounded-2xl border border-slate-700 px-3 py-2 text-center text-sm font-black text-slate-700">
                      ແບບ {item.order} • {getSleeveLabel(item.sleeveType)} • {getCollarLabel(item.collarType)} • {getHemLabel(item.hemType)}
                    </div>
                    <div className="mt-3 aspect-square overflow-hidden rounded-2xl border border-slate-700 bg-white">
                      {item.mockupUrl ? (
                        <img src={item.mockupUrl} alt={`sheet-preview-${item.order}`} className="h-full w-full object-contain bg-white" />
                      ) : (
                        <div className="flex h-full items-center justify-center px-4 text-center text-sm font-bold text-slate-400">ບໍ່ມີຮູບ Mockup</div>
                      )}
                    </div>
                    <div className="mt-3 flex-1 rounded-2xl border border-slate-700 p-4">
                      {item.playerRows.length > 0 ? (
                        <>
                          <div className="mb-3 text-center text-xl font-black text-sky-700">ລາຍຊື່ / ເບີເສື້ອ</div>
                          <div className="space-y-2 text-sm font-bold text-slate-700">
                            {item.playerRows.map((player) => {
                              const lineParts = [
                                player.size ? PRODUCTION_SIZE_LABELS[player.size] || player.size.toUpperCase() : null,
                                playerModeNeedsName(item.playerMode) ? player.playerName || "-" : null,
                                playerModeNeedsNumber(item.playerMode) ? player.jerseyNumber || "-" : null,
                                player.note || null,
                              ].filter(Boolean);
                              return (
                                <div key={player.id} className="rounded-xl bg-slate-50 px-3 py-2 leading-6">
                                  {lineParts.join(" | ")}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mb-3 text-center text-2xl font-black text-sky-700">ຈຳນວນໄຊສ໌</div>
                          <div className="space-y-2 text-xl">
                            {sizeEntries.map((entry) => (
                              <div key={`${item.order}-${entry.key}`} className="flex items-center justify-between gap-3 font-black">
                                <span className="text-slate-900">{entry.label}:</span>
                                <span className="text-rose-600">{entry.qty.toLocaleString()}</span>
                              </div>
                            ))}
                            {sizeEntries.length === 0 ? (
                              <div className="text-center text-sm font-bold text-slate-400">ຍັງບໍ່ມີຈຳນວນໄຊສ໌</div>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {pantsItems.map((item) => {
                const sizeEntries = Object.entries(item.sizeBreakdown || {}).filter(([, qty]) => Number(qty) > 0);
                return (
                  <div key={item.clientId} className="flex min-h-0 flex-col">
                    <div className="rounded-2xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-center text-sm font-black text-indigo-700">
                      {item.productName || "ໂສ້ງ"}
                    </div>
                    <div className="mt-3 aspect-square overflow-hidden rounded-2xl border border-slate-700 bg-white">
                      {item.mockupUrl ? (
                        <img src={item.mockupUrl} alt={item.productName || "pants-preview"} className="h-full w-full object-contain bg-white" />
                      ) : (
                        <div className="flex h-full items-center justify-center px-4 text-center text-sm font-bold text-slate-400">ບໍ່ມີຮູບ Mockup</div>
                      )}
                    </div>
                    <div className="mt-3 flex-1 rounded-2xl border border-slate-700 p-4">
                      {Array.isArray(item.playerRows) && item.playerRows.length > 0 ? (
                        <>
                          <div className="mb-3 text-center text-xl font-black text-sky-700">ລາຍການໄຊສ໌ / ເບີ</div>
                          <div className="space-y-2 text-sm font-bold text-slate-700">
                            {item.playerRows.map((player, index) => {
                              const playerRow = player && typeof player === "object" ? (player as Record<string, unknown>) : {};
                              const size = typeof playerRow.size === "string" ? playerRow.size : "";
                              const jerseyNumber = typeof playerRow.jersey_number === "string" ? playerRow.jersey_number : "";
                              const note = typeof playerRow.note === "string" ? playerRow.note : "";
                              const lineParts = [
                                size ? PRODUCTION_SIZE_LABELS[size] || size.toUpperCase() : null,
                                jerseyNumber || "-",
                                note || null,
                              ].filter(Boolean);
                              return (
                                <div key={`${item.clientId}-${index + 1}`} className="rounded-xl bg-slate-50 px-3 py-2 leading-6">
                                  {lineParts.join(" | ")}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mb-3 text-center text-2xl font-black text-sky-700">ຈຳນວນໄຊສ໌</div>
                          <div className="space-y-2 text-xl">
                            {sizeEntries.map(([size, qty]) => (
                              <div key={`${item.clientId}-${size}`} className="flex items-center justify-between gap-3 font-black">
                                <span className="text-slate-900">{PRODUCTION_SIZE_LABELS[size] || size.toUpperCase()}:</span>
                                <span className="text-rose-600">{(Number(qty) || 0).toLocaleString()}</span>
                              </div>
                            ))}
                            {sizeEntries.length === 0 ? (
                              <div className="text-center text-sm font-bold text-slate-400">ຍັງບໍ່ມີຈຳນວນໄຊສ໌</div>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {productionItems.length === 0 && pantsItems.length === 0 && allPreviewUrls.length > 0 ? (
                <div className="md:col-span-2 2xl:col-span-4">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <img src={allPreviewUrls[0]} alt="production-preview" className="h-full w-full object-contain" />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 text-center text-sm font-black text-slate-900 md:grid-cols-4">
              {signatureFields.map((field) => (
                <div key={field.label}>
                  <div>{field.label}</div>
                  <div className="mt-2 min-h-[24px] text-base text-slate-700">{field.name || "-"}</div>
                </div>
              ))}
            </div>
          </section>

          {productionItems.length > 0 ? (
            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="text-lg font-black text-slate-900">ລາຍການແບບທີ່ຕ້ອງວາງຜະລິດ</div>
              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                {productionItems.map((item) => (
                  <div key={`wide-${item.order}-${item.mockupUrl || "no-image"}`} className="rounded-2xl border border-slate-100 p-5">
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-[160px_minmax(0,1fr)]">
                      {detailMode === "pattern" ? (
                        <PatternMockupViewer
                          imageUrl={item.mockupUrl}
                          alt={`mockup-${item.order}`}
                          downloadFileName={`pattern-${row.order_no || deposit.order_code || "order"}-${item.order}.jpg`}
                        />
                      ) : (
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          {item.mockupUrl ? (
                            <img src={item.mockupUrl} alt={`mockup-${item.order}`} className="h-full w-full object-contain" />
                          ) : (
                            <div className="flex h-full min-h-[160px] items-center justify-center px-2 text-center text-xs font-bold text-slate-400">ບໍ່ມີ mockup</div>
                          )}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-2xl font-black text-slate-900">ແບບທີ {item.order}</div>
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-black text-slate-700">
                            {item.totalQty.toLocaleString()} ຕົວ
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-3 text-sm font-bold text-slate-600">
                          <div>ແຂນ: <span className="text-slate-900">{getSleeveLabel(item.sleeveType)}</span></div>
                          <div>ຄໍ: <span className="text-slate-900">{getCollarLabel(item.collarType)}</span></div>
                          <div>ຕີນເສື້ອ: <span className="text-slate-900">{getHemLabel(item.hemType)}</span></div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {getSizeEntries(item.sizes).map((entry) => (
                            <span key={`wide-${item.order}-${entry.key}`} className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
                              {entry.label}: {entry.qty.toLocaleString()}
                            </span>
                          ))}
                        </div>
                        {item.playerRows.length > 0 ? (
                          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm font-bold text-slate-700">
                            <div className="mb-2 text-slate-500">ລາຍການຈາກໃບມັດຈຳ</div>
                            <div className="grid grid-cols-1 gap-2">
                              {item.playerRows.map((player) => {
                                const lineParts = [
                                  player.size ? PRODUCTION_SIZE_LABELS[player.size] || player.size.toUpperCase() : null,
                                  playerModeNeedsName(item.playerMode) ? player.playerName || "-" : null,
                                  playerModeNeedsNumber(item.playerMode) ? player.jerseyNumber || "-" : null,
                                  player.note || null,
                                ].filter(Boolean);
                                return (
                                  <div key={`wide-detail-${player.id}`} className="rounded-xl bg-white px-3 py-2">
                                    {lineParts.join(" | ")}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <section className="space-y-6">
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">ຂໍ້ມູນອໍເດີ້</div>
                    <div className="mt-2 text-2xl font-black text-slate-900">{deposit.team_name || deposit.customer_name || "-"}</div>
                    <div className="mt-1 text-sm font-bold text-slate-600">{deposit.order_code || deposit.deposit_no}</div>
                  </div>
                  <div className="text-right text-sm font-bold text-slate-500">
                    <div>ວັນເຂົ້າຄິວ: <span className="text-slate-700">{formatDisplayDate(row.queue_date)}</span></div>
                    <div>ສົ່ງຜະລິດ: <span className="text-slate-700">{formatDisplayDate(deposit.production_sent_date)}</span></div>
                    <div>ສົ່ງລູກຄ້າ: <span className="text-slate-700">{formatDisplayDate(deposit.delivery_date)}</span></div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-600">
                    <div>ລູກຄ້າ: <span className="text-slate-900">{deposit.customer_name || "-"}</span></div>
                    <div className="mt-2">ເບີໂທ: <span className="text-slate-900">{deposit.customer_phone || "-"}</span></div>
                    <div className="mt-2">ຜ້າ: <span className="text-slate-900">{deposit.fabric_name || "-"}</span></div>
                    <div className="mt-2">Graphic: <span className="break-all text-slate-900">{getUserDisplayName(deposit.graphic_user_id, userNameMap)}</span></div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-600">
                    <div>ຜູ້ວາງຜະລິດ: <span className="break-all text-slate-900">{getUserDisplayName(effectivePlannerUserId, userNameMap)}</span></div>
                    <div className="mt-2">ຜູ້ມອບໝາຍ: <span className="break-all text-slate-900">{getUserDisplayName(row.assigned_by_user_id || deposit.admin_user_id, userNameMap)}</span></div>
                    <div className="mt-2">Factory Bill: <span className="text-slate-900">{deposit.factory_bill_code || "-"}</span></div>
                    <div className="mt-2">ຄວາມດ່ວນ: <span className="text-slate-900">{deposit.production_priority === "urgent" ? "ງານດ່ວນ" : "ງານປົກກະຕິ"}</span></div>
                  </div>
                </div>

                {deposit.notes || deposit.warning_note || row.notes ? (
                  <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                    {deposit.notes ? <div>ໝາຍເຫດອໍເດີ້: {deposit.notes}</div> : null}
                    {deposit.warning_note ? <div className="mt-2">ໝາຍເຫດພິເສດ: {deposit.warning_note}</div> : null}
                    {row.notes ? <div className="mt-2">ໝາຍເຫດຄິວວາງຜະລິດ: {row.notes}</div> : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="text-lg font-black text-slate-900">ຂະບວນການ 3 ຂັ້ນຕອນ</div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  {FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_ORDER.filter((stage) => stage !== "queued").map((stage) => {
                    const stageIndex = FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_ORDER.indexOf(stage);
                    const currentIndex = getFactoryProductionQueueStatusIndex(row.status);
                    const isComplete = currentIndex >= stageIndex;
                    const actorId =
                      stage === "pattern_laid"
                        ? row.pattern_laid_by_user_id || effectivePlannerUserId
                        : stage === "ready_for_print"
                          ? row.ready_for_print_by_user_id || effectivePlannerUserId
                          : row.sent_to_factory_by_user_id || effectivePlannerUserId;
                    const stageTime =
                      stage === "pattern_laid" ? row.pattern_laid_at : stage === "ready_for_print" ? row.ready_for_print_at : row.sent_to_factory_at;

                    return (
                      <div key={stage} className={`rounded-2xl border p-4 ${isComplete ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-white"}`}>
                        <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                          {stageIndex}. {FACTORY_PRODUCTION_QUEUE_VISIBLE_STATUS_LABELS[stage]}
                        </div>
                        <div className="mt-3 text-sm font-bold text-slate-600">ຜູ້ລົງສະຖານະ: <span className="break-all text-slate-900">{getUserDisplayName(actorId, userNameMap)}</span></div>
                        <div className="mt-2 text-sm font-bold text-slate-600">ເວລາ: <span className="text-slate-900">{formatDateTime(stageTime)}</span></div>
                        {normalizedStatus === stage && previousStatus ? (
                          <button
                            type="button"
                            onClick={() => void handleRevertStatus(previousStatus)}
                            disabled={!canEditCurrentRow || saving}
                            className="mt-4 inline-flex items-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                          >
                            ຍົກເລີກຂັ້ນຕອນນີ້
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              {pantsItems.length > 0 ? (
                <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="text-lg font-black text-slate-900">ລາຍການໂສ້ງ</div>
                  <div className="mt-4 space-y-4">
                    {pantsItems.map((item) => (
                      <div key={item.clientId} className="rounded-2xl border border-slate-100 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-black text-slate-900">{item.productName || "ໂສ້ງພິມລາຍ"}</div>
                          <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                            {getPantsTotalQty(item).toLocaleString()} ຕົວ
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {Object.entries(item.sizeBreakdown || {}).map(([size, qty]) => (
                            <span key={size} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">
                              {size}: {qty.toLocaleString()}
                            </span>
                          ))}
                        </div>
                        {Array.isArray(item.playerRows) && item.playerRows.length > 0 ? (
                          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm font-bold text-slate-700">
                            <div className="mb-2 text-slate-500">ລາຍການຈາກໃບມັດຈຳ</div>
                            <div className="space-y-2">
                              {item.playerRows.map((player, index) => {
                                const playerRow = player && typeof player === "object" ? (player as Record<string, unknown>) : {};
                                const size = typeof playerRow.size === "string" ? playerRow.size : "";
                                const jerseyNumber = typeof playerRow.jersey_number === "string" ? playerRow.jersey_number : "";
                                const note = typeof playerRow.note === "string" ? playerRow.note : "";
                                const lineParts = [
                                  size ? PRODUCTION_SIZE_LABELS[size] || size.toUpperCase() : null,
                                  jerseyNumber || "-",
                                  note || null,
                                ].filter(Boolean);
                                return (
                                  <div key={`${item.clientId}-detail-${index + 1}`} className="rounded-xl bg-white px-3 py-2">
                                    {lineParts.join(" | ")}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="space-y-6">
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="text-lg font-black text-slate-900">ຂໍ້ມູນການລົງສະຖານະ</div>
                <div className="mt-4 space-y-3 text-sm font-bold text-slate-600">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div>ວາງ Pattern ໂດຍ: <span className="break-all text-slate-900">{getUserDisplayName(row.pattern_laid_by_user_id || effectivePlannerUserId, userNameMap)}</span></div>
                    <div className="mt-2">ເວລາ: <span className="text-slate-900">{formatDateTime(row.pattern_laid_at)}</span></div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div>ວາງພ້ອມພິມໂດຍ: <span className="break-all text-slate-900">{getUserDisplayName(row.ready_for_print_by_user_id || effectivePlannerUserId, userNameMap)}</span></div>
                    <div className="mt-2">ເວລາ: <span className="text-slate-900">{formatDateTime(row.ready_for_print_at)}</span></div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div>ສົ່ງໂຮງງານໂດຍ: <span className="break-all text-slate-900">{getUserDisplayName(row.sent_to_factory_by_user_id || effectivePlannerUserId, userNameMap)}</span></div>
                    <div className="mt-2">ເວລາ: <span className="text-slate-900">{formatDateTime(row.sent_to_factory_at)}</span></div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : null}

      {showSendPreview && row ? (
        <SendToFactoryPreviewModal
          row={row}
          userNameMap={userNameMap}
          viewerUserId={viewerUserId}
          confirming={saving}
          onClose={() => {
            if (saving) return;
            setShowSendPreview(false);
          }}
          onConfirm={handleConfirmSendToFactory}
        />
      ) : null}
    </div>
  );
}
