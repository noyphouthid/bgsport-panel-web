"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import Swal from "sweetalert2";
import { ArrowLeft, Eye, FileImage, FileText, FileUp, Printer, Save, Shirt, Trash2 } from "lucide-react";
import {
  buildEmptyPantsOrderItem,
  buildPantsOrderItemPayload,
  buildShirtOrderItemPayload,
  getPantsItemsSummary,
  getPantsLineGross,
  getPantsTotalQty,
  isMissingOrderItemsTableError,
  type PantsOrderItemDraft,
} from "@/lib/order-items";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/access-control";
import { isFactoryDepositAdminRole, isGraphicRole } from "@/lib/role-groups";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import {
  canApproveFactoryDepositOrder,
  canConvertFactoryDepositOrder,
  canEditFactoryDepositOrder,
  canManageAllFactoryDepositOrders,
  FACTORY_DEPOSIT_ORDER_STATUS_LABELS,
  type FactoryDepositOrderStatus,
} from "@/lib/factory-deposit-orders";
import {
  getQuotationDraftById,
  saveQuotationDraft,
  type QuotationDraft,
  type QuotationDraftStatus,
} from "@/lib/quotation-drafts";
import { getMissingOrderCollarFieldsMessage, isMissingOrderCollarFieldsError } from "@/lib/order-collar-fields";
import { canEditWithPermissions, normalizeUserPermissionSettings, type UserPermissionSettings } from "@/lib/user-permissions";

type DepositSlipRow = {
  id: string;
  deposit_order_id: string;
  file_name: string;
  file_path: string;
  file_url: string | null;
  note: string | null;
  uploaded_at: string;
};

type FabricRow = {
  id: string;
  name: string;
  short_price: number;
  long_price: number;
  is_active: boolean;
};

type UserOption = {
  id: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
  auth_user_id: string | null;
  permission_settings?: UserPermissionSettings | null;
};

type DepositOrderRow = {
  id: string;
  quotation_draft_id: string | null;
  quotation_quote_no: string | null;
  deposit_no: string;
  deposit_date: string;
  order_code: string | null;
  order_date: string | null;
  status: FactoryDepositOrderStatus;
  order_id?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_whatsapp: string;
  customer_facebook: string;
  fabric_id: string | null;
  style_name: string;
  color_name: string;
  sleeve_type: "short" | "long" | "mixed";
  short_qty: number;
  long_qty: number;
  free_qty: number;
  qty_3xl: number;
  qty_4xl: number;
  qty_5xl: number;
  qty_6xl: number;
  collar_type: "none" | "polo" | "mandarin";
  collar_qty: number;
  sleeve_charge_qty?: number;
  extra_charge: number;
  discount: number;
  design_deposit: number;
  initial_deposit: number;
  factory_deposit_amount: number;
  factory_cost: number;
  payment_due_date: string | null;
  delivery_date: string | null;
  factory_bill_code: string | null;
  payment_terms: string;
  notes: string;
  warning_note: string;
  factory_deposit_note: string;
  transfer_slip_url: string | null;
  transfer_slip_path: string | null;
  admin_user_id: string | null;
  graphic_user_id: string | null;
  created_by_user_id: string | null;
  team_name?: string | null;
  production_sent_date?: string | null;
  production_items?: unknown;
  production_priority?: "normal" | "urgent" | null;
  urgent_due_date?: string | null;
  pants_items?: unknown;
};

type ProductionSleeveType = "short" | "long" | "mixed";
type ProductionCollarType = "crew" | "polo" | "mandarin" | "v_cut_polo" | "v_neck" | "cross_v" | "cut_v" | "pentagon";
type ProductionSlotCount = 1 | 2 | 3 | 4;
type ProductionSizeKey = "xs" | "jxs" | "js" | "jm" | "jl" | "jxl" | "j2xl" | "s" | "m" | "l" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl";
type ProductionPriority = "normal" | "urgent";
type ProductionPlayerMode = "none" | "name_only" | "number_only" | "name_and_number";

type ProductionSizeMap = Record<ProductionSizeKey, number>;

type ProductionPlayerRow = {
  id: string;
  size: ProductionSizeKey | "";
  player_name: string;
  jersey_number: string;
  note: string;
};

type ProductionItem = {
  client_id: string;
  sleeve_type: ProductionSleeveType;
  collar_type: ProductionCollarType;
  mockup_url: string | null;
  mockup_path: string | null;
  mockup_file_name: string | null;
  mockup_file: File | null;
  mockup_preview_url: string | null;
  sizes: ProductionSizeMap;
  player_mode: ProductionPlayerMode;
  player_rows: ProductionPlayerRow[];
};

type PantsProductionItem = PantsOrderItemDraft & {
  mockup_url: string | null;
  mockup_path: string | null;
  mockup_file_name: string | null;
  mockup_file: File | null;
  mockup_preview_url: string | null;
  sizes: ProductionSizeMap;
  player_mode: ProductionPlayerMode;
  player_rows: ProductionPlayerRow[];
};

const COLLAR_PRICE = 20000;
const SLEEVE_PRICE = 20000;
const SIZE_UPCHARGES = {
  "3XL": 20000,
  "4XL": 25000,
  "5XL": 35000,
  "6XL": 35000,
} as const;
const PRODUCTION_MOCKUP_BUCKET = "factory-production-mockups";

const PRODUCTION_SLEEVE_OPTIONS: Array<{ value: ProductionSleeveType; label: string }> = [
  { value: "short", label: "ແຂນສັ້ນ" },
  { value: "long", label: "ແຂນຍາວ" },
  { value: "mixed", label: "ແຂນສັ້ນ/ແຂນຍາວ" },
];

const PRODUCTION_COLLAR_OPTIONS: Array<{ value: ProductionCollarType; label: string }> = [
  { value: "crew", label: "ຄໍມົນ" },
  { value: "polo", label: "ໂປໂລ" },
  { value: "mandarin", label: "ຄໍຈີນ" },
  { value: "v_cut_polo", label: "ຄໍໂປໂລວີຕັດ" },
  { value: "v_neck", label: "ຄໍວີ" },
  { value: "cross_v", label: "ຄໍວີໄຂວ່" },
  { value: "cut_v", label: "ຄໍວີຕັດ" },
  { value: "pentagon", label: "ຄໍ 5 ຫຼ່ຽມ" },
];

const PRODUCTION_PLAYER_MODE_OPTIONS: Array<{ value: ProductionPlayerMode; label: string }> = [
  { value: "none", label: "ບໍ່ມີຊື່/ເບີ" },
  { value: "name_only", label: "ມີສະເພາະຊື່" },
  { value: "number_only", label: "ມີສະເພາະເບີເສື້ອ" },
  { value: "name_and_number", label: "ມີຊື່ + ເບີເສື້ອ" },
];

const PANTS_PLAYER_MODE_OPTIONS: Array<{ value: ProductionPlayerMode; label: string }> = [
  { value: "none", label: "ມີສະເພາະໄຊສ໌" },
  { value: "number_only", label: "ໄຊສ໌ + ເບີໂສ້ງ" },
];

const PRODUCTION_SIZE_FIELDS: Array<{ key: ProductionSizeKey; label: string }> = [
  { key: "xs", label: "XS" },
  { key: "jxs", label: "JXS" },
  { key: "js", label: "JS" },
  { key: "jm", label: "JM" },
  { key: "jl", label: "JL" },
  { key: "jxl", label: "JXL" },
  { key: "j2xl", label: "J2XL" },
  { key: "s", label: "S" },
  { key: "m", label: "M" },
  { key: "l", label: "L" },
  { key: "xl", label: "XL" },
  { key: "2xl", label: "2XL" },
  { key: "3xl", label: "3XL" },
  { key: "4xl", label: "4XL" },
  { key: "5xl", label: "5XL" },
  { key: "6xl", label: "6XL" },
];

function getLocalDateInputValue() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function buildDepositNo() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `DPF${yy}-${mm}${dd}${hh}${min}`;
}

function formatMoney(value: number) {
  return `${Math.max(0, Number(value) || 0).toLocaleString()} ກີບ`;
}

function isImageFileName(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(name || ""));
}

function buildSafeStorageFileName(fileName: string, prefix: string) {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() || "bin" : "bin";
  const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "bin";
  const readableBase = fileName
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const fallbackBase = readableBase || "file";
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fallbackBase}.${safeExtension}`;
}

function toPositiveInt(value: unknown) {
  return Math.max(0, Number(value) || 0);
}

function buildEmptySizeMap(): ProductionSizeMap {
  return {
    xs: 0,
    jxs: 0,
    js: 0,
    jm: 0,
    jl: 0,
    jxl: 0,
    j2xl: 0,
    s: 0,
    m: 0,
    l: 0,
    xl: 0,
    "2xl": 0,
    "3xl": 0,
    "4xl": 0,
    "5xl": 0,
    "6xl": 0,
  };
}

function buildClientId() {
  return `production-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPlayerRowId() {
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildEmptyPlayerRow(overrides?: Partial<ProductionPlayerRow>): ProductionPlayerRow {
  return {
    id: buildPlayerRowId(),
    size: overrides?.size ?? "",
    player_name: overrides?.player_name ?? "",
    jersey_number: overrides?.jersey_number ?? "",
    note: overrides?.note ?? "",
  };
}

function mapLegacyCollarType(value?: string | null): ProductionCollarType {
  if (value === "polo") return "polo";
  if (value === "mandarin") return "mandarin";
  return "crew";
}

function buildEmptyProductionItem(
  overrides?: Partial<Omit<ProductionItem, "client_id" | "sizes">> & { sizes?: Partial<ProductionSizeMap> }
): ProductionItem {
  return {
    client_id: buildClientId(),
    sleeve_type: overrides?.sleeve_type ?? "short",
    collar_type: overrides?.collar_type ?? "crew",
    mockup_url: overrides?.mockup_url ?? null,
    mockup_path: overrides?.mockup_path ?? null,
    mockup_file_name: overrides?.mockup_file_name ?? null,
    mockup_file: overrides?.mockup_file ?? null,
    mockup_preview_url: overrides?.mockup_preview_url ?? null,
    player_mode: overrides?.player_mode ?? "none",
    player_rows: overrides?.player_rows ?? [],
    sizes: {
      ...buildEmptySizeMap(),
      ...(overrides?.sizes ?? {}),
    },
  };
}

function getProductionItemTotal(item: ProductionItem) {
  const sizeMap = getProductionItemSizeMap(item);
  return PRODUCTION_SIZE_FIELDS.reduce((sum, field) => sum + (Number(sizeMap[field.key]) || 0), 0);
}

function getFilledPlayerRows(item: { player_rows: ProductionPlayerRow[] }) {
  return item.player_rows.filter((row) => row.size || row.player_name.trim() || row.jersey_number.trim() || row.note.trim());
}

function getProductionItemSizeMap(item: ProductionItem) {
  const filledRows = getFilledPlayerRows(item);
  const derivedSizes = buildEmptySizeMap();
  let hasSizedRows = false;

  if (item.player_mode !== "none") {
    for (const row of filledRows) {
      if (!row.size) continue;
      derivedSizes[row.size] = (Number(derivedSizes[row.size]) || 0) + 1;
      hasSizedRows = true;
    }
  }

  return hasSizedRows ? derivedSizes : item.sizes;
}

function playerModeNeedsName(mode: ProductionPlayerMode) {
  return mode === "name_only" || mode === "name_and_number";
}

function playerModeNeedsNumber(mode: ProductionPlayerMode) {
  return mode === "number_only" || mode === "name_and_number";
}

function getPlayerModeInstruction(mode: ProductionPlayerMode, numberLabel = "ເບີເສື້ອ") {
  if (mode === "name_only") return "ໄຊສ໌ + ຊື່ Player";
  if (mode === "number_only") return `ໄຊສ໌ + ${numberLabel}`;
  return `ໄຊສ໌ + ຊື່ + ${numberLabel}`;
}

function getPlayerModePreviewTitle(mode: ProductionPlayerMode, numberLabel = "ເບີເສື້ອ") {
  if (mode === "name_only") return "NAME LIST";
  if (mode === "number_only") return "LIST";
  return `ຊື່ ແລະ ${numberLabel}`;
}

function getPlayerPreviewTextClass(mode: ProductionPlayerMode) {
  if (mode === "name_and_number") return "text-[11px] leading-tight tracking-tight";
  if (mode === "name_only") return "text-[12px] leading-[1.3]";
  return "text-[13px] leading-snug";
}

function parseProductionItems(raw: unknown, fallbackSleeve: ProductionSleeveType, fallbackCollar: ProductionCollarType) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [buildEmptyProductionItem({ sleeve_type: fallbackSleeve, collar_type: fallbackCollar })];
  }

  const items = raw
    .slice(0, 4)
    .map((entry) => {
      const row = typeof entry === "object" && entry ? (entry as Record<string, unknown>) : {};
      const nestedSizes = typeof row.sizes === "object" && row.sizes ? (row.sizes as Record<string, unknown>) : {};
      const nestedPlayers = Array.isArray(row.player_rows) ? row.player_rows : [];
      return buildEmptyProductionItem({
        sleeve_type:
          row.sleeve_type === "long" || row.sleeve_type === "mixed" || row.sleeve_type === "short"
            ? (row.sleeve_type as ProductionSleeveType)
            : fallbackSleeve,
        collar_type:
          typeof row.collar_type === "string" &&
          PRODUCTION_COLLAR_OPTIONS.some((option) => option.value === row.collar_type)
            ? (row.collar_type as ProductionCollarType)
            : fallbackCollar,
        mockup_url: typeof row.mockup_url === "string" ? row.mockup_url : null,
        mockup_path: typeof row.mockup_path === "string" ? row.mockup_path : null,
        mockup_file_name: typeof row.mockup_file_name === "string" ? row.mockup_file_name : null,
        player_mode:
          row.player_mode === "name_only" ||
          row.player_mode === "number_only" ||
          row.player_mode === "name_and_number" ||
          row.player_mode === "none"
            ? (row.player_mode as ProductionPlayerMode)
            : "none",
        player_rows: nestedPlayers
          .map((player) => {
            const playerRow = typeof player === "object" && player ? (player as Record<string, unknown>) : {};
            const sizeValue = typeof playerRow.size === "string" ? playerRow.size : "";
            const isValidSize = PRODUCTION_SIZE_FIELDS.some((field) => field.key === sizeValue);
            return buildEmptyPlayerRow({
              size: isValidSize ? (sizeValue as ProductionSizeKey) : "",
              player_name: typeof playerRow.player_name === "string" ? playerRow.player_name : "",
              jersey_number: typeof playerRow.jersey_number === "string" ? playerRow.jersey_number : "",
              note: typeof playerRow.note === "string" ? playerRow.note : "",
            });
          })
          .filter((player) => player.size || player.player_name.trim() || player.jersey_number.trim() || player.note.trim()),
        sizes: {
          xs: toPositiveInt(nestedSizes.xs),
          jxs: toPositiveInt(nestedSizes.jxs),
          js: toPositiveInt(nestedSizes.js),
          jm: toPositiveInt(nestedSizes.jm),
          jl: toPositiveInt(nestedSizes.jl),
          jxl: toPositiveInt(nestedSizes.jxl),
          j2xl: toPositiveInt(nestedSizes.j2xl),
          s: toPositiveInt(nestedSizes.s),
          m: toPositiveInt(nestedSizes.m),
          l: toPositiveInt(nestedSizes.l),
          xl: toPositiveInt(nestedSizes.xl),
          "2xl": toPositiveInt(nestedSizes["2xl"]),
          "3xl": toPositiveInt(nestedSizes["3xl"]),
          "4xl": toPositiveInt(nestedSizes["4xl"]),
          "5xl": toPositiveInt(nestedSizes["5xl"]),
          "6xl": toPositiveInt(nestedSizes["6xl"]),
        },
      });
    })
    .filter(Boolean);

  return items.length > 0 ? items : [buildEmptyProductionItem({ sleeve_type: fallbackSleeve, collar_type: fallbackCollar })];
}

function ensureProductionItemCount(items: ProductionItem[], count: ProductionSlotCount) {
  const next = items.slice(0, count);
  while (next.length < count) next.push(buildEmptyProductionItem());
  return next;
}

function isMissingPantsItemsColumnError(error: { message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("pants_items") && (message.includes("column") || message.includes("schema cache"));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return fallback;
}

function buildEmptyPantsProductionItem(overrides?: Partial<PantsProductionItem>): PantsProductionItem {
  const base = buildEmptyPantsOrderItem(overrides);
  return {
    ...base,
    mockup_url: overrides?.mockup_url ?? null,
    mockup_path: overrides?.mockup_path ?? null,
    mockup_file_name: overrides?.mockup_file_name ?? null,
    mockup_file: overrides?.mockup_file ?? null,
    mockup_preview_url: overrides?.mockup_preview_url ?? null,
    player_mode: overrides?.player_mode ?? "none",
    player_rows: overrides?.player_rows ?? [],
    sizes: {
      ...buildEmptySizeMap(),
      ...(overrides?.sizes ?? {}),
    },
  };
}

function parsePantsProductionItems(raw: unknown) {
  if (!Array.isArray(raw) || raw.length === 0) return [] as PantsProductionItem[];

  return raw
    .map((entry, index) => {
      const row = typeof entry === "object" && entry ? (entry as Record<string, unknown>) : {};
      const nestedSizes = typeof row.sizes === "object" && row.sizes ? (row.sizes as Record<string, unknown>) : {};
      const nestedPlayers = Array.isArray(row.player_rows) ? row.player_rows : [];
      return buildEmptyPantsProductionItem({
        id: typeof row.id === "string" ? row.id : undefined,
        clientId:
          typeof row.clientId === "string"
            ? row.clientId
            : typeof row.client_id === "string"
              ? row.client_id
              : `pants-production-${index + 1}`,
        productName:
          typeof row.productName === "string"
            ? row.productName
            : typeof row.product_name === "string"
              ? row.product_name
              : undefined,
        fabricId:
          typeof row.fabricId === "string"
            ? row.fabricId
            : typeof row.fabric_id === "string"
              ? row.fabric_id
              : "",
        qty: Math.max(0, Number(row.qty) || 0),
        freeQty:
          typeof row.freeQty !== "undefined"
            ? Math.max(0, Number(row.freeQty) || 0)
            : Math.max(0, Number(row.free_qty) || 0),
        unitPrice:
          typeof row.unitPrice !== "undefined"
            ? Math.max(0, Number(row.unitPrice) || 0)
            : Math.max(0, Number(row.unit_price) || 0),
        factoryCost:
          typeof row.factoryCost !== "undefined"
            ? Math.max(0, Number(row.factoryCost) || 0)
            : Math.max(0, Number(row.factory_cost) || 0),
        notes: typeof row.notes === "string" ? row.notes : "",
        mockup_url: typeof row.mockup_url === "string" ? row.mockup_url : null,
        mockup_path: typeof row.mockup_path === "string" ? row.mockup_path : null,
        mockup_file_name: typeof row.mockup_file_name === "string" ? row.mockup_file_name : null,
        player_mode: row.player_mode === "number_only" ? "number_only" : "none",
        player_rows: nestedPlayers
          .map((player) => {
            const playerRow = typeof player === "object" && player ? (player as Record<string, unknown>) : {};
            const sizeValue = typeof playerRow.size === "string" ? playerRow.size : "";
            return buildEmptyPlayerRow({
              size: PRODUCTION_SIZE_FIELDS.some((field) => field.key === sizeValue) ? (sizeValue as ProductionSizeKey) : "",
              player_name: "",
              jersey_number: typeof playerRow.jersey_number === "string" ? playerRow.jersey_number : "",
              note: typeof playerRow.note === "string" ? playerRow.note : "",
            });
          })
          .filter((player) => player.size || player.player_name.trim() || player.jersey_number.trim() || player.note.trim()),
        sizes: {
          xs: toPositiveInt(nestedSizes.xs),
          jxs: toPositiveInt(nestedSizes.jxs),
          js: toPositiveInt(nestedSizes.js),
          jm: toPositiveInt(nestedSizes.jm),
          jl: toPositiveInt(nestedSizes.jl),
          jxl: toPositiveInt(nestedSizes.jxl),
          j2xl: toPositiveInt(nestedSizes.j2xl),
          s: toPositiveInt(nestedSizes.s),
          m: toPositiveInt(nestedSizes.m),
          l: toPositiveInt(nestedSizes.l),
          xl: toPositiveInt(nestedSizes.xl),
          "2xl": toPositiveInt(nestedSizes["2xl"]),
          "3xl": toPositiveInt(nestedSizes["3xl"]),
          "4xl": toPositiveInt(nestedSizes["4xl"]),
          "5xl": toPositiveInt(nestedSizes["5xl"]),
          "6xl": toPositiveInt(nestedSizes["6xl"]),
        },
      });
    })
    .filter((item) => item.productName.trim() || item.fabricId || getPantsTotalQty(item) > 0);
}

function getPantsProductionItemTotal(item: PantsProductionItem) {
  const sizeMap = getPantsProductionItemSizeMap(item);
  return PRODUCTION_SIZE_FIELDS.reduce((sum, field) => sum + (Number(sizeMap[field.key]) || 0), 0);
}

function getPantsProductionItemSizeMap(item: PantsProductionItem) {
  const filledRows = getFilledPlayerRows(item);
  const derivedSizes = buildEmptySizeMap();
  let hasSizedRows = false;

  if (item.player_mode !== "none") {
    for (const row of filledRows) {
      if (!row.size) continue;
      derivedSizes[row.size] = (Number(derivedSizes[row.size]) || 0) + 1;
      hasSizedRows = true;
    }
  }

  return hasSizedRows ? derivedSizes : item.sizes;
}

export default function FactoryDepositOrderFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");
  const editId = searchParams.get("id");
  const pageRef = useRef<HTMLDivElement | null>(null);

  const [fabrics, setFabrics] = useState<FabricRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerPermissions, setViewerPermissions] = useState<UserPermissionSettings>({});
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingAction, setWorkingAction] = useState<"approve" | "convert" | null>(null);
  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [deletingSlipId, setDeletingSlipId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { markClean, allowNextNavigation } = useUnsavedChangesGuard({ scopeRef: pageRef, enabled: !loading });

  const [recordId, setRecordId] = useState<string | null>(null);
  const [linkedOrderId, setLinkedOrderId] = useState<string | null>(null);
  const [createdByUserId, setCreatedByUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<FactoryDepositOrderStatus>("draft");
  const [depositNo, setDepositNo] = useState(buildDepositNo());
  const [depositDate, setDepositDate] = useState(getLocalDateInputValue);
  const [orderCode, setOrderCode] = useState("");
  const [orderDate, setOrderDate] = useState(getLocalDateInputValue);
  const [quotationQuoteNo, setQuotationQuoteNo] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [customerFacebook, setCustomerFacebook] = useState("");

  const [teamName, setTeamName] = useState("");
  const [productionSentDate, setProductionSentDate] = useState("");
  const [customerDeliveryDate, setCustomerDeliveryDate] = useState("");
  const [productionPriority, setProductionPriority] = useState<ProductionPriority>("normal");
  const [urgentDueDate, setUrgentDueDate] = useState("");
  const [productionStyleCount, setProductionStyleCount] = useState<ProductionSlotCount>(1);
  const [productionItems, setProductionItems] = useState<ProductionItem[]>([buildEmptyProductionItem()]);

  const [fabricId, setFabricId] = useState("");
  const [shortQty, setShortQty] = useState(0);
  const [longQty, setLongQty] = useState(0);
  const [freeQty, setFreeQty] = useState(0);
  const [qty3XL, setQty3XL] = useState(0);
  const [qty4XL, setQty4XL] = useState(0);
  const [qty5XL, setQty5XL] = useState(0);
  const [qty6XL, setQty6XL] = useState(0);
  const [pantsItems, setPantsItems] = useState<PantsProductionItem[]>([]);
  const [collarType, setCollarType] = useState<"none" | "polo" | "mandarin">("none");
  const [collarQty, setCollarQty] = useState(0);
  const [sleeveChargeQty, setSleeveChargeQty] = useState(0);

  const [extraCharge, setExtraCharge] = useState(0);
  const [designDeposit, setDesignDeposit] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [initialDeposit, setInitialDeposit] = useState(0);
  const [factoryCost, setFactoryCost] = useState(0);
  const [factoryBillCode, setFactoryBillCode] = useState("");

  const [adminUserId, setAdminUserId] = useState("");
  const [graphicUserId, setGraphicUserId] = useState("");
  const [transferSlipUrl, setTransferSlipUrl] = useState<string | null>(null);
  const [transferSlipPath, setTransferSlipPath] = useState<string | null>(null);
  const [slipRows, setSlipRows] = useState<DepositSlipRow[]>([]);
  const [pendingSlipFiles, setPendingSlipFiles] = useState<File[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr(null);

      try {
        const [{ data: fabricsData, error: fabricsError }, { data: usersData, error: usersError }, { data: sessionData }] =
          await Promise.all([
            supabase.from("fabrics").select("id,name,short_price,long_price,is_active").eq("is_active", true).order("name", { ascending: true }),
            supabase.from("users").select("id,full_name,role,is_active,auth_user_id,permission_settings").eq("is_active", true).order("full_name", { ascending: true }),
            supabase.auth.getSession(),
          ]);

        if (fabricsError) throw fabricsError;
        if (usersError) throw usersError;

        const fabricRows = (fabricsData ?? []) as FabricRow[];
        const userRows = (usersData ?? []) as UserOption[];
        setFabrics(fabricRows);
        setUsers(userRows);
        if (fabricRows.length > 0) setFabricId((prev) => prev || fabricRows[0].id);

        const authUserId = sessionData.session?.user.id ?? null;
        const currentUser = userRows.find((item) => item.auth_user_id === authUserId) || null;
        setViewerRole(currentUser?.role ?? null);
        setViewerPermissions(normalizeUserPermissionSettings(currentUser?.permission_settings));
        setViewerUserId(currentUser?.id ?? null);
        setCreatedByUserId(currentUser?.id ?? null);

        if (editId) {
          const { data, error } = await supabase
            .from("factory_deposit_orders")
            .select("*")
            .eq("id", editId)
            .maybeSingle();

          if (error) throw error;
          if (!data) throw new Error("ບໍ່ພົບໃບມັດຈຳສັ່ງຜະລິດ");

          const row = data as DepositOrderRow;
          if (!canManageAllFactoryDepositOrders(currentUser?.role ?? null) && row.created_by_user_id !== currentUser?.id) {
            toast.error("ທ່ານສາມາດເບິ່ງໄດ້ສະເພາະໃບມັດຈຳທີ່ຕົນເອງສ້າງ");
            router.replace("/factory-deposit-orders");
            return;
          }

          setRecordId(row.id);
          setLinkedOrderId(row.order_id || null);
          setCreatedByUserId(row.created_by_user_id || currentUser?.id || null);
          setStatus(row.status);
          setDepositNo(row.deposit_no);
          setDepositDate(row.deposit_date);
          setOrderCode(row.order_code || "");
          setOrderDate(row.order_date || row.deposit_date || getLocalDateInputValue());
          setQuotationQuoteNo(row.quotation_quote_no || "");
          setCustomerName(row.customer_name || "");
          setCustomerPhone(row.customer_phone || "");
          setCustomerWhatsapp(row.customer_whatsapp || "");
          setCustomerFacebook(row.customer_facebook || "");
          setTeamName(row.team_name || "");
          setProductionSentDate(row.production_sent_date || "");
          setCustomerDeliveryDate(row.delivery_date || "");
          setProductionPriority(row.production_priority === "urgent" ? "urgent" : "normal");
          setUrgentDueDate(row.urgent_due_date || "");
          setFabricId(row.fabric_id || "");
          setShortQty(Number(row.short_qty) || 0);
          setLongQty(Number(row.long_qty) || 0);
          setFreeQty(Number(row.free_qty) || 0);
          setQty3XL(Number(row.qty_3xl) || 0);
          setQty4XL(Number(row.qty_4xl) || 0);
          setQty5XL(Number(row.qty_5xl) || 0);
          setQty6XL(Number(row.qty_6xl) || 0);
          const parsedPantsItems = parsePantsProductionItems(row.pants_items);
          const parsedPantsSummary = getPantsItemsSummary(parsedPantsItems);
          setPantsItems(parsedPantsItems);
          setCollarType(row.collar_type || "none");
          setCollarQty(Number(row.collar_qty) || 0);
          setSleeveChargeQty(Number(row.sleeve_charge_qty) || 0);
          setExtraCharge(Number(row.extra_charge) || 0);
          setDesignDeposit(Number(row.design_deposit) || 0);
          setDiscount(Number(row.discount) || 0);
          setInitialDeposit(Number(row.initial_deposit) || 0);
          setFactoryCost(Math.max(0, (Number(row.factory_cost) || 0) - parsedPantsSummary.factoryCostTotal));
          setFactoryBillCode(row.factory_bill_code || "");
          setAdminUserId(row.admin_user_id || "");
          setGraphicUserId(row.graphic_user_id || "");
          setTransferSlipUrl(row.transfer_slip_url || null);
          setTransferSlipPath(row.transfer_slip_path || null);

          const fallbackProductionItems = parseProductionItems(
            row.production_items,
            row.sleeve_type || "short",
            mapLegacyCollarType(row.collar_type)
          );
          const styleCount = Math.min(4, Math.max(1, fallbackProductionItems.length)) as ProductionSlotCount;
          setProductionStyleCount(styleCount);
          setProductionItems(ensureProductionItemCount(fallbackProductionItems, styleCount));

          const { data: slipData, error: slipError } = await supabase
            .from("factory_deposit_order_slips")
            .select("id,deposit_order_id,file_name,file_path,file_url,note,uploaded_at")
            .eq("deposit_order_id", row.id)
            .order("uploaded_at", { ascending: false });
          if (slipError) throw slipError;
          setSlipRows((slipData ?? []) as DepositSlipRow[]);
          return;
        }

        if (draftId) {
          const draft = await getQuotationDraftById(draftId);
          if (draft) {
            setQuotationQuoteNo(draft.quoteNo);
            setOrderDate(draft.quoteDate || getLocalDateInputValue());
            setOrderCode((prev) => prev || draft.quoteNo || "");
            setCustomerName(draft.customerName);
            setCustomerPhone(draft.customerPhone);
            setCustomerWhatsapp(draft.customerWhatsapp);
            setCustomerFacebook(draft.customerFacebook);
            setFabricId(draft.fabricId);
            setShortQty(draft.shortQty);
            setLongQty(draft.longQty);
            setFreeQty(draft.freeQty);
            setQty3XL(draft.qty3XL);
            setQty4XL(draft.qty4XL);
            setQty5XL(draft.qty5XL);
            setQty6XL(draft.qty6XL || 0);
            setPantsItems((draft.pantsItems || []).map((item) => buildEmptyPantsProductionItem(item)));
            setCollarType(draft.collarType);
            setCollarQty(draft.collarQty);
            setSleeveChargeQty(draft.sleeveChargeQty);
            setExtraCharge(draft.extraCharge);
            setDesignDeposit(Number(draft.designDeposit) || 0);
            setDiscount(Number(draft.discount) || 0);
            setInitialDeposit(draft.deposit);
            setCustomerDeliveryDate(draft.deliveryDate || "");
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "ໂຫຼດຟອມບໍ່ສຳເລັດ";
        setErr(message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [draftId, editId, router]);

  useEffect(() => {
    return () => {
      productionItems.forEach((item) => {
        if (item.mockup_preview_url?.startsWith("blob:")) {
          URL.revokeObjectURL(item.mockup_preview_url);
        }
      });
      pantsItems.forEach((item) => {
        if (item.mockup_preview_url?.startsWith("blob:")) {
          URL.revokeObjectURL(item.mockup_preview_url);
        }
      });
    };
  }, [productionItems, pantsItems]);

  const selectedFabric = useMemo(() => fabrics.find((item) => item.id === fabricId) ?? null, [fabrics, fabricId]);
  const fabricsById = useMemo(() => new Map(fabrics.map((fabric) => [fabric.id, fabric])), [fabrics]);
  const adminOptions = useMemo(() => users.filter((item) => isFactoryDepositAdminRole(item.role)), [users]);
  const plannerOptions = useMemo(() => users.filter((item) => isGraphicRole(item.role)), [users]);
  const canEdit = canEditWithPermissions(viewerPermissions, "factory_deposit_orders", viewerRole ? canEditFactoryDepositOrder(status, viewerRole) : false);
  const isSuperAdmin = viewerRole === "superadmin";
  const canApproveHere = !!recordId && !!viewerRole && isSuperAdmin && canApproveFactoryDepositOrder(viewerRole) && status === "submitted";
  const canConvertHere = !!recordId && !!viewerRole && isSuperAdmin && canConvertFactoryDepositOrder(viewerRole) && status === "approved";

  const shirtTotal = useMemo(() => {
    if (!selectedFabric) return 0;
    return (Number(shortQty) || 0) * Number(selectedFabric.short_price || 0) + (Number(longQty) || 0) * Number(selectedFabric.long_price || 0);
  }, [selectedFabric, shortQty, longQty]);

  const plusSizeTotal = useMemo(
    () =>
      (Number(qty3XL) || 0) * SIZE_UPCHARGES["3XL"] +
      (Number(qty4XL) || 0) * SIZE_UPCHARGES["4XL"] +
      (Number(qty5XL) || 0) * SIZE_UPCHARGES["5XL"] +
      (Number(qty6XL) || 0) * SIZE_UPCHARGES["6XL"],
    [qty3XL, qty4XL, qty5XL, qty6XL]
  );
  const pantsSummary = useMemo(() => getPantsItemsSummary(pantsItems), [pantsItems]);

  const collarTotal = useMemo(() => {
    if (collarType === "none") return 0;
    return (Number(collarQty) || 0) * COLLAR_PRICE;
  }, [collarQty, collarType]);
  const sleeveChargeTotal = useMemo(() => (Number(sleeveChargeQty) || 0) * SLEEVE_PRICE, [sleeveChargeQty]);

  const grossTotal = useMemo(
    () => shirtTotal + plusSizeTotal + pantsSummary.grossTotal + collarTotal + sleeveChargeTotal + (Number(extraCharge) || 0),
    [shirtTotal, plusSizeTotal, pantsSummary.grossTotal, collarTotal, sleeveChargeTotal, extraCharge]
  );
  const netTotal = useMemo(() => Math.max(0, grossTotal - (Number(discount) || 0)), [grossTotal, discount]);
  const customerBillTotal = useMemo(
    () => Math.max(0, netTotal - (Number(designDeposit) || 0)),
    [netTotal, designDeposit]
  );
  const balance = useMemo(
    () => Math.max(0, customerBillTotal - (Number(initialDeposit) || 0)),
    [customerBillTotal, initialDeposit]
  );
  const depositPercent = useMemo(
    () => (customerBillTotal > 0 ? (Math.max(0, Number(initialDeposit) || 0) / customerBillTotal) * 100 : 0),
    [customerBillTotal, initialDeposit]
  );
  const formattedDepositPercent = useMemo(
    () => (Number.isInteger(depositPercent) ? depositPercent.toFixed(0) : depositPercent.toFixed(1)),
    [depositPercent]
  );
  const summaryItems = [
    { label: "ຄ່າເສື້ອລວມ", value: shirtTotal, color: "text-slate-900" },
    { label: "ບວກໄຊສ໌ໃຫຍ່", value: plusSizeTotal, color: "text-amber-700" },
    { label: "ຄ່າໂສ້ງລວມ", value: pantsSummary.grossTotal, color: "text-indigo-700" },
    { label: "ບວກຄໍເສື້ອ", value: collarTotal, color: "text-sky-700" },
    { label: "ບວກແຂນເສື້ອ", value: sleeveChargeTotal, color: "text-cyan-700" },
    { label: "ບວກເພີ່ມອື່ນໆ", value: extraCharge, color: "text-violet-700" },
  ];
  const totalProductionQty = useMemo(() => Math.max(0, shortQty) + Math.max(0, longQty) + Math.max(0, freeQty), [shortQty, longQty, freeQty]);
  const pantsTotalQty = useMemo(() => pantsSummary.billableQty + pantsSummary.freeQty, [pantsSummary.billableQty, pantsSummary.freeQty]);
  const assignedPantsQty = useMemo(
    () => pantsItems.reduce((sum, item) => sum + getPantsProductionItemTotal(item), 0),
    [pantsItems]
  );
  const totalFactoryCost = useMemo(() => Math.max(0, factoryCost) + pantsSummary.factoryCostTotal, [factoryCost, pantsSummary.factoryCostTotal]);
  const activeProductionItems = useMemo(
    () => ensureProductionItemCount(productionItems, productionStyleCount).slice(0, productionStyleCount),
    [productionItems, productionStyleCount]
  );
  const priorityBannerText =
    productionPriority === "urgent"
      ? `ຕ້ອງການເຄື່ອງດ່ວນ! ກຳນົດສົ່ງບໍ່ເກີນວັນທີ ${urgentDueDate || "../../...."}`
      : "ງານປົກກະຕິ";
  const assignedProductionQty = useMemo(
    () => activeProductionItems.reduce((sum, item) => sum + getProductionItemTotal(item), 0),
    [activeProductionItems]
  );
  const quantityDifference = totalProductionQty - assignedProductionQty;
  const quantityMatches = quantityDifference === 0;

  const pendingSlipPreviews = useMemo(
    () =>
      pendingSlipFiles.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        isImage: file.type.startsWith("image/") || isImageFileName(file.name),
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      })),
    [pendingSlipFiles]
  );

  useEffect(() => {
    return () => {
      pendingSlipPreviews.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [pendingSlipPreviews]);

  const addPantsItem = () => {
    setPantsItems((prev) => [...prev, buildEmptyPantsProductionItem()]);
  };

  const updatePantsItem = (clientId: string, updater: (item: PantsProductionItem) => PantsProductionItem) => {
    setPantsItems((prev) => prev.map((item) => (item.clientId === clientId ? updater(item) : item)));
  };

  const removePantsItem = (clientId: string) => {
    setPantsItems((prev) => {
      const next = prev.filter((item) => item.clientId !== clientId);
      const removed = prev.find((item) => item.clientId === clientId);
      if (removed?.mockup_preview_url?.startsWith("blob:")) {
        URL.revokeObjectURL(removed.mockup_preview_url);
      }
      return next;
    });
  };

  const buildQuotationDraft = (): QuotationDraft => ({
    id: draftId || undefined,
    quoteNo: quotationQuoteNo || orderCode || depositNo,
    quoteDate: orderDate || depositDate,
    status: "draft" as QuotationDraftStatus,
    createdByName: "",
    customerName,
    customerPhone,
    customerWhatsapp,
    customerFacebook,
    fabricId: selectedFabric?.id || "",
    fabricName: selectedFabric?.name || "",
    fabricShortPrice: Number(selectedFabric?.short_price || 0),
    fabricLongPrice: Number(selectedFabric?.long_price || 0),
    styleName: "",
    colorName: "",
    sleeveType: shortQty > 0 && longQty > 0 ? "mixed" : longQty > 0 ? "long" : "short",
    shortQty,
    longQty,
    freeQty,
    qty3XL,
    qty4XL,
    qty5XL,
    qty6XL,
    collarType,
    collarQty,
    sleeveChargeQty,
    extraCharge,
    designDeposit,
    discount,
    deposit: initialDeposit,
    paymentDueDate: "",
    deliveryDate: customerDeliveryDate,
    paymentTerms: "",
    notes: "",
    warningNote: "",
    pantsItems,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const insertHistory = async (
    depositOrderId: string,
    action: string,
    detail: string,
    fromStatus: FactoryDepositOrderStatus | null,
    toStatus: FactoryDepositOrderStatus | null
  ) => {
    await supabase.from("factory_deposit_order_history").insert({
      deposit_order_id: depositOrderId,
      action,
      detail,
      from_status: fromStatus,
      to_status: toStatus,
      action_by_user_id: viewerUserId,
    });
  };

  const confirmAction = async ({
    title,
    text,
    confirmButtonText,
    cancelToast,
    icon = "question",
  }: {
    title: string;
    text: string;
    confirmButtonText: string;
    cancelToast: string;
    icon?: "question" | "warning";
  }) => {
    const result = await Swal.fire({
      icon,
      title,
      text,
      showCancelButton: true,
      confirmButtonText,
      cancelButtonText: "ຍົກເລີກ",
      reverseButtons: true,
    });

    if (!result.isConfirmed) {
      toast(cancelToast);
    }

    return result.isConfirmed;
  };

  const uploadSlipIfNeeded = async (depositOrderId: string) => {
    if (pendingSlipFiles.length === 0) {
      return {
        firstPath: transferSlipPath,
        firstUrl: transferSlipUrl,
      };
    }

    setUploadingSlip(true);
    try {
      const uploaded: Array<{ file_name: string; file_path: string; file_url: string | null }> = [];

      for (const file of pendingSlipFiles) {
        const safeName = buildSafeStorageFileName(file.name, "slip");
        const path = `${depositOrderId}/${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("factory-deposit-slips")
          .upload(path, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("factory-deposit-slips").getPublicUrl(path);
        uploaded.push({
          file_name: file.name,
          file_path: path,
          file_url: data.publicUrl,
        });
      }

      const { error: insertSlipError } = await supabase.from("factory_deposit_order_slips").insert(
        uploaded.map((item) => ({
          deposit_order_id: depositOrderId,
          file_name: item.file_name,
          file_path: item.file_path,
          file_url: item.file_url,
          uploaded_by_user_id: viewerUserId,
        }))
      );
      if (insertSlipError) throw insertSlipError;

      const first = uploaded[0] || null;
      if (first) {
        setTransferSlipPath(first.file_path);
        setTransferSlipUrl(first.file_url);
      }
      setPendingSlipFiles([]);

      const { data: slipData, error: slipError } = await supabase
        .from("factory_deposit_order_slips")
        .select("id,deposit_order_id,file_name,file_path,file_url,note,uploaded_at")
        .eq("deposit_order_id", depositOrderId)
        .order("uploaded_at", { ascending: false });
      if (slipError) throw slipError;
      setSlipRows((slipData ?? []) as DepositSlipRow[]);

      return {
        firstPath: first?.file_path || transferSlipPath,
        firstUrl: first?.file_url || transferSlipUrl,
      };
    } finally {
      setUploadingSlip(false);
    }
  };

  const serializeProductionItems = (items: ProductionItem[]) =>
    items.map((item, index) => ({
      order: index + 1,
      sleeve_type: item.sleeve_type,
      collar_type: item.collar_type,
      mockup_url: item.mockup_url,
      mockup_path: item.mockup_path,
      mockup_file_name: item.mockup_file_name,
      player_mode: item.player_mode,
      player_rows: getFilledPlayerRows(item).map((row) => ({
        size: row.size,
        player_name: row.player_name.trim(),
        jersey_number: row.jersey_number.trim(),
        note: row.note.trim(),
      })),
      sizes: getProductionItemSizeMap(item),
      total_qty: getProductionItemTotal(item),
    }));

  const serializePantsItems = (items: PantsProductionItem[]) =>
    items.map((item, index) => ({
      order: index + 1,
      client_id: item.clientId,
      product_name: item.productName.trim(),
      fabric_id: item.fabricId || "",
      qty: Math.max(0, Number(item.qty) || 0),
      free_qty: Math.max(0, Number(item.freeQty) || 0),
      unit_price: Math.max(0, Number(item.unitPrice) || 0),
      factory_cost: Math.max(0, Number(item.factoryCost) || 0),
      notes: item.notes.trim(),
      mockup_url: item.mockup_url,
      mockup_path: item.mockup_path,
      mockup_file_name: item.mockup_file_name,
      player_mode: item.player_mode,
      player_rows: getFilledPlayerRows(item).map((row) => ({
        size: row.size,
        player_name: row.player_name.trim(),
        jersey_number: row.jersey_number.trim(),
        note: row.note.trim(),
      })),
      sizes: getPantsProductionItemSizeMap(item),
      total_qty: getPantsProductionItemTotal(item),
    }));

  const uploadProductionMockupsIfNeeded = async (depositOrderId: string) => {
    const nextItems: ProductionItem[] = [];

    for (let index = 0; index < activeProductionItems.length; index += 1) {
      const item = activeProductionItems[index];
      if (!item.mockup_file) {
        nextItems.push(item);
        continue;
      }

      const safeName = buildSafeStorageFileName(item.mockup_file.name, `production-${index + 1}`);
      const path = `${depositOrderId}/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(PRODUCTION_MOCKUP_BUCKET)
        .upload(path, item.mockup_file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(PRODUCTION_MOCKUP_BUCKET).getPublicUrl(path);
      if (item.mockup_preview_url?.startsWith("blob:")) {
        URL.revokeObjectURL(item.mockup_preview_url);
      }

      nextItems.push({
        ...item,
        mockup_path: path,
        mockup_url: data.publicUrl,
        mockup_file_name: item.mockup_file.name,
        mockup_file: null,
        mockup_preview_url: null,
      });
    }

    setProductionItems(nextItems);
    return nextItems;
  };

  const uploadPantsMockupsIfNeeded = async (depositOrderId: string) => {
    const nextItems: PantsProductionItem[] = [];

    for (let index = 0; index < pantsItems.length; index += 1) {
      const item = pantsItems[index];
      if (!item.mockup_file) {
        nextItems.push(item);
        continue;
      }

      const safeName = buildSafeStorageFileName(item.mockup_file.name, `pants-${index + 1}`);
      const path = `${depositOrderId}/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(PRODUCTION_MOCKUP_BUCKET)
        .upload(path, item.mockup_file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(PRODUCTION_MOCKUP_BUCKET).getPublicUrl(path);
      if (item.mockup_preview_url?.startsWith("blob:")) {
        URL.revokeObjectURL(item.mockup_preview_url);
      }

      nextItems.push({
        ...item,
        mockup_path: path,
        mockup_url: data.publicUrl,
        mockup_file_name: item.mockup_file.name,
        mockup_file: null,
        mockup_preview_url: null,
      });
    }

    setPantsItems(nextItems);
    return nextItems;
  };

  const handleSlipChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setPendingSlipFiles((prev) => [...prev, ...files]);
    event.target.value = "";
  };

  const removePendingSlip = (name: string) => {
    setPendingSlipFiles((prev) => prev.filter((file) => file.name !== name));
  };

  const removeUploadedSlip = async (slip: DepositSlipRow) => {
    const confirmed = await confirmAction({
      icon: "warning",
      title: "ຢືນຢັນລົບສະລິບ?",
      text: slip.file_name || slip.file_path || "transfer slip",
      confirmButtonText: "ລົບ",
      cancelToast: "ຍົກເລີກການລົບສະລິບແລ້ວ",
    });
    if (!confirmed) return;

    setDeletingSlipId(slip.id);
    try {
      if (slip.file_path) {
        const { error: storageError } = await supabase.storage.from("factory-deposit-slips").remove([slip.file_path]);
        if (storageError) throw storageError;
      }

      const { error: deleteError } = await supabase.from("factory_deposit_order_slips").delete().eq("id", slip.id);
      if (deleteError) throw deleteError;

      const remainingRows = slipRows.filter((row) => row.id !== slip.id);
      setSlipRows(remainingRows);

      const nextPrimarySlip = remainingRows[0] || null;
      setTransferSlipPath(nextPrimarySlip?.file_path || null);
      setTransferSlipUrl(nextPrimarySlip?.file_url || null);

      if (recordId) {
        const { error: syncError } = await supabase
          .from("factory_deposit_orders")
          .update({
            transfer_slip_path: nextPrimarySlip?.file_path || null,
            transfer_slip_url: nextPrimarySlip?.file_url || null,
            transfer_slip_uploaded_at: nextPrimarySlip ? nextPrimarySlip.uploaded_at : null,
            transfer_slip_uploaded_by_user_id: nextPrimarySlip ? viewerUserId : null,
          })
          .eq("id", recordId);
        if (syncError) throw syncError;
      }

      toast.success("ລົບສະລິບແລ້ວ");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ລົບສະລິບບໍ່ສຳເລັດ");
    } finally {
      setDeletingSlipId(null);
    }
  };

  const handleStyleCountChange = (nextCount: ProductionSlotCount) => {
    setProductionStyleCount(nextCount);
    setProductionItems((prev) => ensureProductionItemCount(prev, nextCount));
  };

  const updateProductionItem = (index: number, updater: (current: ProductionItem) => ProductionItem) => {
    setProductionItems((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? updater(item) : item))
    );
  };

  const addPlayerRow = (index: number) => {
    updateProductionItem(index, (current) => ({
      ...current,
      player_rows: [...current.player_rows, buildEmptyPlayerRow()],
    }));
  };

  const removePlayerRow = (index: number, rowId: string) => {
    updateProductionItem(index, (current) => ({
      ...current,
      player_rows: current.player_rows.filter((row) => row.id !== rowId),
    }));
  };

  const updatePlayerRow = (index: number, rowId: string, updater: (row: ProductionPlayerRow) => ProductionPlayerRow) => {
    updateProductionItem(index, (current) => ({
      ...current,
      player_rows: current.player_rows.map((row) => (row.id === rowId ? updater(row) : row)),
    }));
  };

  const addPantsPlayerRow = (clientId: string) => {
    updatePantsItem(clientId, (current) => ({
      ...current,
      player_rows: [...current.player_rows, buildEmptyPlayerRow()],
    }));
  };

  const removePantsPlayerRow = (clientId: string, rowId: string) => {
    updatePantsItem(clientId, (current) => ({
      ...current,
      player_rows: current.player_rows.filter((row) => row.id !== rowId),
    }));
  };

  const updatePantsPlayerRow = (clientId: string, rowId: string, updater: (row: ProductionPlayerRow) => ProductionPlayerRow) => {
    updatePantsItem(clientId, (current) => ({
      ...current,
      player_rows: current.player_rows.map((row) => (row.id === rowId ? updater(row) : row)),
    }));
  };

  const handleMockupChange = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    updateProductionItem(index, (item) => {
      if (item.mockup_preview_url?.startsWith("blob:")) {
        URL.revokeObjectURL(item.mockup_preview_url);
      }
      return {
        ...item,
        mockup_file: file,
        mockup_file_name: file.name,
        mockup_preview_url: URL.createObjectURL(file),
      };
    });
    event.target.value = "";
  };

  const clearMockup = (index: number) => {
    updateProductionItem(index, (item) => {
      if (item.mockup_preview_url?.startsWith("blob:")) {
        URL.revokeObjectURL(item.mockup_preview_url);
      }
      return {
        ...item,
        mockup_url: null,
        mockup_path: null,
        mockup_file_name: null,
        mockup_file: null,
        mockup_preview_url: null,
      };
    });
  };

  const handlePantsMockupChange = (clientId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    updatePantsItem(clientId, (item) => {
      if (item.mockup_preview_url?.startsWith("blob:")) {
        URL.revokeObjectURL(item.mockup_preview_url);
      }
      return {
        ...item,
        mockup_file: file,
        mockup_file_name: file.name,
        mockup_preview_url: URL.createObjectURL(file),
      };
    });
    event.target.value = "";
  };

  const clearPantsMockup = (clientId: string) => {
    updatePantsItem(clientId, (item) => {
      if (item.mockup_preview_url?.startsWith("blob:")) {
        URL.revokeObjectURL(item.mockup_preview_url);
      }
      return {
        ...item,
        mockup_url: null,
        mockup_path: null,
        mockup_file_name: null,
        mockup_file: null,
        mockup_preview_url: null,
      };
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const persistDepositOrder = async ({
    nextStatus,
    action,
    detail,
    successMessage,
    redirectAfterSave = false,
    extraOrderFields,
  }: {
    nextStatus: FactoryDepositOrderStatus;
    action?: string;
    detail?: string;
    successMessage: string;
    redirectAfterSave?: boolean;
    extraOrderFields?: Record<string, string | null>;
  }) => {
    if (!canEdit) {
      toast.error("ທ່ານບໍ່ມີສິດແກ້ໄຂໃບນີ້");
      return null;
    }
    if (!depositNo.trim()) {
      toast.error("ກະລຸນາປ້ອນເລກທີ່ໃບມັດຈຳ");
      return null;
    }
    if (!orderCode.trim()) {
      toast.error("ກະລຸນາປ້ອນລະຫັດອໍເດີ");
      return null;
    }
    if (!teamName.trim()) {
      toast.error("ກະລຸນາປ້ອນຊື່ທີມ");
      return null;
    }
    if (!selectedFabric) {
      toast.error("ກະລຸນາເລືອກຜ້າ");
      return null;
    }
    if (!adminUserId) {
      toast.error("ກະລຸນາເລືອກແອັດມິນ");
      return null;
    }
    if (!graphicUserId) {
      toast.error("ກະລຸນາເລືອກຜູ້ອອກແບບ");
      return null;
    }
    const shouldEnforceProductionValidation = nextStatus === "submitted";

    for (const item of pantsItems) {
      if (getPantsTotalQty(item) <= 0) {
        toast.error("ລາຍການໂສ້ງແຕ່ລະອັນຕ້ອງມີຈຳນວນຫຼາຍກວ່າ 0");
        return null;
      }
      if (!item.fabricId) {
        toast.error("ກະລຸນາເລືອກຜ້າໃຫ້ລາຍການໂສ້ງ");
        return null;
      }
      if ((Number(item.unitPrice) || 0) <= 0) {
        toast.error("ກະລຸນາປ້ອນລາຄາຂາຍຂອງລາຍການໂສ້ງ");
        return null;
      }
      const pantsAssignedQty = getPantsProductionItemTotal(item);
      const pantsTargetQty = getPantsTotalQty(item);
      if (shouldEnforceProductionValidation) {
        if (pantsAssignedQty !== pantsTargetQty) {
          toast.error(`ຈຳນວນໄຊສ໌ຂອງ ${item.productName || "ລາຍການໂສ້ງ"} ຕ້ອງເທົ່າກັບ ${pantsTargetQty}`);
          return null;
        }
        if (!item.mockup_url && !item.mockup_file) {
          toast.error(`ກະລຸນາແນບ mockup ໃຫ້ ${item.productName || "ລາຍການໂສ້ງ"}`);
          return null;
        }
        if (item.player_mode !== "none") {
          const filledRows = getFilledPlayerRows(item);
          if (filledRows.length !== pantsTargetQty) {
            toast.error(`ຈຳນວນລາຍຊື່ Player/ເບີໂສ້ງ ຂອງ ${item.productName || "ລາຍການໂສ້ງ"} ຕ້ອງເທົ່າກັບ ${pantsTargetQty}`);
            return null;
          }
          for (const row of filledRows) {
            if (!row.size) {
              toast.error("ກະລຸນາເລືອກໄຊສ໌ໃຫ້ຄົບທຸກລາຍການເບີໂສ້ງ");
              return null;
            }
            if (playerModeNeedsNumber(item.player_mode) && !row.jersey_number.trim()) {
              toast.error("ກະລຸນາປ້ອນເບີໂສ້ງໃຫ້ຄົບ");
              return null;
            }
          }
        }
      }
    }
    if (shouldEnforceProductionValidation) {
      if (!productionSentDate) {
        toast.error("ກະລຸນາເລືອກວັນທີ່ສົ່ງຜະລິດ");
        return null;
      }
      if (!customerDeliveryDate) {
        toast.error("ກະລຸນາເລືອກກຳນົດສົ່ງລູກຄ້າ");
        return null;
      }
      if (productionPriority === "urgent" && !urgentDueDate) {
        toast.error("ກະລຸນາເລືອກວັນທີກຳນົດສົ່ງສຳລັບງານດ່ວນ");
        return null;
      }
      if (!quantityMatches) {
        toast.error("ຈຳນວນໄຊສ໌ລວມທຸກແບບຕ້ອງເທົ່າກັບຈຳນວນຜະລິດລວມ");
        return null;
      }
      for (const item of activeProductionItems) {
        if (getProductionItemTotal(item) <= 0) {
          toast.error("ແຕ່ລະແບບຜະລິດຕ້ອງມີຈຳນວນຢ່າງໜ້ອຍ 1");
          return null;
        }
        if (!item.mockup_url && !item.mockup_file) {
          toast.error("ກະລຸນາແນບຮູບ mockup ໃຫ້ຄົບທຸກແບບ");
          return null;
        }
        if (item.player_mode !== "none") {
          const filledRows = getFilledPlayerRows(item);
          if (filledRows.length !== getProductionItemTotal(item)) {
            toast.error("ຈຳນວນລາຍຊື່ Player/ເບີ ຕ້ອງເທົ່າກັບຈຳນວນເສື້ອຂອງແບບນັ້ນ");
            return null;
          }
          for (const row of filledRows) {
            if (!row.size) {
              toast.error("ກະລຸນາເລືອກໄຊສ໌ໃຫ້ຄົບທຸກລາຍຊື່ Player");
              return null;
            }
            if (playerModeNeedsNumber(item.player_mode) && !row.jersey_number.trim()) {
              toast.error("ກະລຸນາປ້ອນເບີເສື້ອໃຫ້ຄົບ");
              return null;
            }
            if (playerModeNeedsName(item.player_mode) && !row.player_name.trim()) {
              toast.error("ກະລຸນາປ້ອນຊື່ Player ໃຫ້ຄົບ");
              return null;
            }
          }
        }
      }
    }

    setSaving(true);
    setErr(null);

    try {
      let quotationDraft = buildQuotationDraft();
      if (draftId) {
        quotationDraft = await saveQuotationDraft(quotationDraft);
      }

      const payload = {
        quotation_draft_id: quotationDraft.id || null,
        quotation_quote_no: quotationQuoteNo.trim() || null,
        quotation_snapshot: quotationDraft,
        deposit_no: depositNo.trim(),
        deposit_date: depositDate,
        order_code: orderCode.trim(),
        order_date: depositDate,
        status: nextStatus,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_whatsapp: customerWhatsapp.trim(),
        customer_facebook: customerFacebook.trim(),
        team_name: teamName.trim(),
        production_sent_date: productionSentDate || null,
        production_priority: productionPriority,
        urgent_due_date: productionPriority === "urgent" ? urgentDueDate || null : null,
        fabric_id: selectedFabric.id,
        fabric_name: selectedFabric.name,
        fabric_short_price: Number(selectedFabric.short_price || 0),
        fabric_long_price: Number(selectedFabric.long_price || 0),
        style_name: "",
        color_name: "",
        sleeve_type: shortQty > 0 && longQty > 0 ? "mixed" : longQty > 0 ? "long" : "short",
        collar_type: collarType,
        collar_qty: Math.max(0, collarQty),
        sleeve_charge_qty: Math.max(0, sleeveChargeQty),
        short_qty: Math.max(0, shortQty),
        long_qty: Math.max(0, longQty),
        free_qty: Math.max(0, freeQty),
        qty_3xl: Math.max(0, qty3XL),
        qty_4xl: Math.max(0, qty4XL),
        qty_5xl: Math.max(0, qty5XL),
        qty_6xl: Math.max(0, qty6XL),
        pants_items: serializePantsItems(pantsItems),
        extra_charge: Math.max(0, extraCharge),
        discount: Math.max(0, discount),
        design_deposit: Math.max(0, designDeposit),
        initial_deposit: Math.max(0, initialDeposit),
        factory_deposit_amount: 0,
        factory_cost: totalFactoryCost,
        gross_total: grossTotal,
        net_total: netTotal,
        balance,
        payment_due_date: null,
        delivery_date: customerDeliveryDate || null,
        factory_bill_code: factoryBillCode.trim() || null,
        payment_terms: "",
        notes: "",
        warning_note: "",
        factory_deposit_note: "",
        production_items: serializeProductionItems(activeProductionItems),
        created_by_user_id: createdByUserId || viewerUserId,
        admin_user_id: adminUserId,
        graphic_user_id: graphicUserId,
        ...(extraOrderFields ?? {}),
      };

      let depositOrderId = recordId;
      const previousStatus = status;

      if (recordId) {
        const updateResult = await supabase.from("factory_deposit_orders").update(payload).eq("id", recordId);
        if (updateResult.error) {
          if (!isMissingPantsItemsColumnError(updateResult.error)) throw updateResult.error;
          const legacyPayload: Record<string, unknown> = { ...payload };
          delete legacyPayload.pants_items;
          const legacyUpdateResult = await supabase.from("factory_deposit_orders").update(legacyPayload).eq("id", recordId);
          if (legacyUpdateResult.error) throw legacyUpdateResult.error;
        }
      } else {
        const insertResult = await supabase.from("factory_deposit_orders").insert(payload).select("id").single();
        if (insertResult.error) {
          if (!isMissingPantsItemsColumnError(insertResult.error)) throw insertResult.error;
          const legacyPayload: Record<string, unknown> = { ...payload };
          delete legacyPayload.pants_items;
          const legacyInsertResult = await supabase.from("factory_deposit_orders").insert(legacyPayload).select("id").single();
          if (legacyInsertResult.error) throw legacyInsertResult.error;
          depositOrderId = legacyInsertResult.data.id as string;
        } else {
          depositOrderId = insertResult.data.id as string;
        }
        setRecordId(depositOrderId);
        setCreatedByUserId(createdByUserId || viewerUserId || null);
      }

      if (!depositOrderId) throw new Error("ບໍ່ພົບລະຫັດໃບມັດຈຳ");

      const uploadedItems = await uploadProductionMockupsIfNeeded(depositOrderId);
      const uploadedPantsItems = await uploadPantsMockupsIfNeeded(depositOrderId);
      const uploadedSlip = await uploadSlipIfNeeded(depositOrderId);

      const updateAfterUpload: Record<string, string | null | object[]> = {
        production_items: serializeProductionItems(uploadedItems),
        pants_items: serializePantsItems(uploadedPantsItems),
      };
      if (uploadedSlip.firstPath || uploadedSlip.firstUrl) {
        updateAfterUpload.transfer_slip_path = uploadedSlip.firstPath;
        updateAfterUpload.transfer_slip_url = uploadedSlip.firstUrl;
        updateAfterUpload.transfer_slip_uploaded_at = new Date().toISOString();
        updateAfterUpload.transfer_slip_uploaded_by_user_id = viewerUserId;
      }

      const syncResult = await supabase
        .from("factory_deposit_orders")
        .update(updateAfterUpload)
        .eq("id", depositOrderId);
      if (syncResult.error) {
        if (!isMissingPantsItemsColumnError(syncResult.error)) throw syncResult.error;
        const legacyUpdateAfterUpload: Record<string, unknown> = { ...updateAfterUpload };
        delete legacyUpdateAfterUpload.pants_items;
        const legacySyncResult = await supabase
          .from("factory_deposit_orders")
          .update(legacyUpdateAfterUpload)
          .eq("id", depositOrderId);
        if (legacySyncResult.error) throw legacySyncResult.error;
      }

      await insertHistory(
        depositOrderId,
        action || (recordId ? "update" : "create"),
        detail || (nextStatus === "submitted" ? "submit deposit order" : "save draft deposit order"),
        recordId ? previousStatus : null,
        nextStatus
      );

      setStatus(nextStatus);
      markClean();
      toast.success(successMessage);
      if (redirectAfterSave) {
        allowNextNavigation();
        router.push("/factory-deposit-orders");
      }
      return {
        depositOrderId,
        nextStatus,
        uploadedPantsItems,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "ບັນທຶກບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (nextStatus: FactoryDepositOrderStatus) => {
    const confirmed = await confirmAction({
      title: nextStatus === "submitted" ? "ຢືນຢັນບັນທຶກ ແລະ ສົ່ງ?" : "ຢືນຢັນບັນທຶກຮ່າງ?",
      text: `${quotationQuoteNo || depositNo} / ${orderCode || "-"}`,
      confirmButtonText: nextStatus === "submitted" ? "ບັນທຶກ ແລະ ສົ່ງ" : "ບັນທຶກຮ່າງ",
      cancelToast: nextStatus === "submitted" ? "ຍົກເລີກການສົ່ງແລ້ວ" : "ຍົກເລີກການບັນທຶກຮ່າງແລ້ວ",
    });
    if (!confirmed) return;

    await persistDepositOrder({
      nextStatus,
      successMessage: nextStatus === "submitted" ? "ບັນທຶກ ແລະ ສົ່ງໃບມັດຈຳແລ້ວ" : "ບັນທຶກຮ່າງໃບມັດຈຳແລ້ວ",
      redirectAfterSave: true,
    });
  };

  const handleApprove = async () => {
    if (!recordId) return toast.error("ບໍ່ພົບໃບມັດຈຳ");
    if (!viewerRole || !canApproveFactoryDepositOrder(viewerRole) || !isSuperAdmin) return toast.error("ທ່ານບໍ່ມີສິດອະນຸມັດ");
    if (status !== "submitted") return toast.error("ອະນຸມັດໄດ້ສະເພາະລາຍການທີ່ສົ່ງແລ້ວ");
    const confirmed = await confirmAction({
      title: "ຢືນຢັນອະນຸມັດ?",
      text: `${depositNo} / ${orderCode || "-"}`,
      confirmButtonText: "ອະນຸມັດ",
      cancelToast: "ຍົກເລີກການອະນຸມັດແລ້ວ",
    });
    if (!confirmed) return;

    setWorkingAction("approve");
    try {
      await persistDepositOrder({
        nextStatus: "approved",
        action: "approve",
        detail: "approve deposit order",
        successMessage: "ອະນຸມັດໃບມັດຈຳແລ້ວ",
        extraOrderFields: {
          approved_at: new Date().toISOString(),
          approved_by_user_id: viewerUserId,
        },
      });
    } finally {
      setWorkingAction(null);
    }
  };

  const handleConvert = async () => {
    if (!recordId) return toast.error("ບໍ່ພົບໃບມັດຈຳ");
    if (!viewerRole || !canConvertFactoryDepositOrder(viewerRole) || !isSuperAdmin) return toast.error("ທ່ານບໍ່ມີສິດບັນທຶກເປັນອໍເດີ");
    if (status !== "approved") return toast.error("ກະລຸນາອະນຸມັດກ່ອນ");
    if (!orderCode.trim()) return toast.error("ບໍ່ພົບລະຫັດອໍເດີ");
    if (!selectedFabric) return toast.error("ກະລຸນາເລືອກຜ້າ");
    const confirmed = await confirmAction({
      title: "ຢືນຢັນບັນທຶກເປັນອໍເດີ?",
      text: `${depositNo} -> ${orderCode}`,
      confirmButtonText: "ບັນທຶກເປັນອໍເດີ",
      cancelToast: "ຍົກເລີກການບັນທຶກເປັນອໍເດີແລ້ວ",
    });
    if (!confirmed) return;

    setWorkingAction("convert");
    setErr(null);
    let createdOrderId: string | null = null;
    try {
      const saved = await persistDepositOrder({
        nextStatus: "approved",
        successMessage: "ບັນທຶກຂໍ້ມູນກ່ອນແປງເປັນອໍເດີແລ້ວ",
      });
      if (!saved?.depositOrderId) return;
      const convertedPantsItems = saved.uploadedPantsItems ?? pantsItems;

      const orderPayload = {
        order_code: orderCode.trim(),
        order_date: depositDate,
        customer_phone: customerPhone.trim() || null,
        customer_whatsapp: customerWhatsapp.trim() || null,
        factory_bill_code: factoryBillCode.trim() || null,
        admin_user_id: adminUserId || null,
        graphic_user_id: graphicUserId || null,
        fabric_id: selectedFabric.id,
        fabric_name: selectedFabric.name,
        fabric_short_price: Number(selectedFabric.short_price) || 0,
        fabric_long_price: Number(selectedFabric.long_price) || 0,
        short_qty: Math.max(0, shortQty),
        long_qty: Math.max(0, longQty),
        free_qty: Math.max(0, freeQty),
        qty_3xl: Math.max(0, qty3XL),
        qty_4xl: Math.max(0, qty4XL),
        qty_5xl: Math.max(0, qty5XL),
        qty_6xl: Math.max(0, qty6XL),
        collar_type: collarType,
        collar_qty: Math.max(0, collarQty),
        sleeve_charge_qty: Math.max(0, sleeveChargeQty),
        size_upcharge: 20000,
        extra_charge: Math.max(0, extraCharge),
        design_deposit: Math.max(0, designDeposit),
        discount: Math.max(0, discount),
        initial_deposit: Math.max(0, initialDeposit),
        factory_cost: totalFactoryCost,
        gross_total: grossTotal,
        net_total: netTotal,
        balance,
        status: "in_progress",
      };

      const { data: orderData, error: insertOrderError } = await supabase.from("orders").insert(orderPayload).select("id").single();
      if (insertOrderError) {
        if (isMissingOrderCollarFieldsError(insertOrderError)) throw new Error(getMissingOrderCollarFieldsMessage());
        throw new Error(`ສ້າງ order ບໍ່ສຳເລັດ: ${insertOrderError.message}`);
      }
      const orderId = orderData.id as string;
      createdOrderId = orderId;

      const hasShirtLine =
        Math.max(0, shortQty) > 0 ||
        Math.max(0, longQty) > 0 ||
        Math.max(0, freeQty) > 0 ||
        Math.max(0, qty3XL) > 0 ||
        Math.max(0, qty4XL) > 0 ||
        Math.max(0, qty5XL) > 0 ||
        Math.max(0, qty6XL) > 0;
      const hasPantsLine = convertedPantsItems.some((item) => getPantsTotalQty(item) > 0);
      const itemPayloads = [
        ...(hasShirtLine
          ? [
              buildShirtOrderItemPayload({
                orderId,
                lineNo: 1,
                fabric: {
                  id: selectedFabric.id,
                  name: selectedFabric.name,
                  shortPrice: Number(selectedFabric.short_price || 0),
                  longPrice: Number(selectedFabric.long_price || 0),
                },
                shortQty,
                longQty,
                freeQty,
                qty3XL,
                qty4XL,
                qty5XL,
                qty6XL,
                grossTotal: shirtTotal + plusSizeTotal,
                netTotal: shirtTotal + plusSizeTotal,
                factoryCostTotal: Math.max(0, factoryCost),
              }),
            ]
          : []),
        ...convertedPantsItems.map((item, index) =>
          buildPantsOrderItemPayload({
            orderId,
            lineNo: index + (hasShirtLine ? 2 : 1),
            item,
            fabricsById,
          })
        ),
      ];

      if (itemPayloads.length > 0) {
        const { error: insertItemsError } = await supabase.from("order_items").insert(itemPayloads);
        if (insertItemsError) {
          if (isMissingOrderItemsTableError(insertItemsError)) {
            if (hasPantsLine) {
              toast("ບັນທຶກອໍເດີແລ້ວ ແຕ່ຂໍ້ມູນໂສ້ງຍັງບໍ່ຖືກເກັບ ເນື່ອງຈາກ `order_items` ຍັງບໍ່ພ້ອມ");
            }
          } else {
            throw new Error(`ບັນທຶກລາຍການເສື້ອ/ໂສ້ງບໍ່ສຳເລັດ: ${insertItemsError.message}`);
          }
        }
      }

      const { error: updateDepositError } = await supabase
        .from("factory_deposit_orders")
        .update({
          status: "converted",
          order_id: orderId,
          converted_at: new Date().toISOString(),
          converted_by_user_id: viewerUserId,
        })
        .eq("id", saved.depositOrderId);
      if (updateDepositError) throw new Error(`ອັບເດດສະຖານະໃບມັດຈຳບໍ່ສຳເລັດ: ${updateDepositError.message}`);

      await insertHistory(saved.depositOrderId, "convert_to_order", `convert to order ${orderCode.trim()}`, "approved", "converted");
      setLinkedOrderId(orderData.id as string);
      setStatus("converted");
      markClean();
      toast.success("ບັນທຶກເປັນອໍເດີແລ້ວ");
      allowNextNavigation();
      router.push("/factory-deposit-orders");
    } catch (error) {
      if (createdOrderId) {
        await supabase.from("orders").delete().eq("id", createdOrderId);
      }
      const message = getErrorMessage(error, "ບັນທຶກເປັນອໍເດີບໍ່ສຳເລັດ");
      setErr(message);
      toast.error(message);
    } finally {
      setWorkingAction(null);
    }
  };

  const handleCancelConvert = async () => {
    if (!recordId) return toast.error("ບໍ່ພົບໃບມັດຈຳ");
    if (!viewerRole || !canConvertFactoryDepositOrder(viewerRole) || !isSuperAdmin) return toast.error("ທ່ານບໍ່ມີສິດຍົກເລີກການບັນທຶກອໍເດີ້");
    if (status !== "converted") return toast.error("ຍົກເລີກໄດ້ສະເພາະລາຍການທີ່ບັນທຶກເປັນອໍເດີແລ້ວ");

    const confirmed = await confirmAction({
      title: "ຢືນຢັນຍົກເລີກການບັນທຶກອໍເດີ້?",
      text: `${depositNo} -> ${orderCode || "-"}`,
      confirmButtonText: "ຍົກເລີກການບັນທຶກອໍເດີ້",
      cancelToast: "ຍົກເລີກການຖອນອໍເດີ້ແລ້ວ",
    });
    if (!confirmed) return;

    setWorkingAction("convert");
    setErr(null);
    try {
      if (linkedOrderId) {
        const { error: deleteOrderError } = await supabase.from("orders").delete().eq("id", linkedOrderId);
        if (deleteOrderError) throw deleteOrderError;
      }

      const { error: updateDepositError } = await supabase
        .from("factory_deposit_orders")
        .update({
          status: "approved",
          order_id: null,
          converted_at: null,
          converted_by_user_id: null,
        })
        .eq("id", recordId);
      if (updateDepositError) throw updateDepositError;

      await insertHistory(recordId, "cancel_convert_to_order", `cancel order ${orderCode.trim() || depositNo}`, "converted", "approved");
      setLinkedOrderId(null);
      setStatus("approved");
      markClean();
      toast.success("ຍົກເລີກການບັນທຶກອໍເດີ້ແລ້ວ");
    } catch (error) {
      const message = error instanceof Error ? error.message : "ຍົກເລີກການບັນທຶກອໍເດີ້ບໍ່ສຳເລັດ";
      setErr(message);
      toast.error(message);
    } finally {
      setWorkingAction(null);
    }
  };

  if (loading) {
    return <div className="rounded-3xl border border-slate-100 bg-white p-8 text-sm font-bold text-slate-500">ກຳລັງໂຫຼດຟອມ...</div>;
  }

  return (
    <div ref={pageRef} className="space-y-6 pb-8 text-slate-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
        <div>
          <Link href="/factory-deposit-orders" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-slate-700">
            <ArrowLeft size={16} />
            ກັບໄປລາຍການໃບມັດຈຳ
          </Link>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
            {editId ? "ແກ້ໄຂໃບສັ່ງຜະລິດ" : "ສ້າງໃບສັ່ງຜະລິດ"}
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            ບັນທຶກຂໍ້ມູນສົ່ງໂຮງງານ, ກຳນົດຈຳນວນໄຊສ໌ແຍກແຕ່ລະແບບ ແລະ ກວດ preview A4 ກ່ອນພິມ
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
            ສະຖານະ: {FACTORY_DEPOSIT_ORDER_STATUS_LABELS[status]}
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <Printer size={16} />
            ພິມ A4
          </button>
          <button
            type="button"
            onClick={() => handleSave("draft")}
            disabled={saving || uploadingSlip || workingAction !== null || !canEdit}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກຮ່າງ"}
          </button>
          <button
            type="button"
            onClick={() => handleSave("submitted")}
            disabled={saving || uploadingSlip || workingAction !== null || !canEdit}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກ ແລະ ສົ່ງ"}
          </button>
          {canApproveHere && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={saving || uploadingSlip || workingAction !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-50"
            >
              <Save size={16} />
              {workingAction === "approve" ? "ກຳລັງອະນຸມັດ..." : "ອະນຸມັດ"}
            </button>
          )}
          {canConvertHere && (
            <button
              type="button"
              onClick={handleConvert}
              disabled={saving || uploadingSlip || workingAction !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              <Save size={16} />
              {workingAction === "convert" ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກເປັນອໍເດີ"}
            </button>
          )}
          {status === "converted" && viewerRole && canConvertFactoryDepositOrder(viewerRole) && isSuperAdmin && (
            <button
              type="button"
              onClick={handleCancelConvert}
              disabled={saving || uploadingSlip || workingAction !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              <Save size={16} />
              {workingAction === "convert" ? "ກຳລັງຖອນ..." : "ຍົກເລີກການບັນທຶກອໍເດີ້"}
            </button>
          )}
        </div>
      </div>

      {err && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 print:hidden">ຂໍ້ຜິດພາດ: {err}</div>}
      {!canEdit && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700 print:hidden">ໃບນີ້ຢູ່ໃນສະຖານະທີ່ບໍ່ສາມາດແກ້ໄຂໄດ້</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <div className="space-y-5 print:hidden">
          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 text-sm font-black uppercase tracking-wider text-slate-700">ຂໍ້ມູນເອກະສານ</div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ວັນທີອອກໃບ</label>
                <input
                  type="date"
                  value={depositDate}
                  readOnly
                  disabled
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ເລກທີ່ໃບປະເມີນ</label>
                <input
                  value={quotationQuoteNo}
                  onChange={(e) => setQuotationQuoteNo(e.target.value)}
                  disabled={!canEdit}
                  placeholder="ເລກທີ່ໃບປະເມີນລາຄາ"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ລະຫັດໃບມັດຈຳ</label>
                <input value={depositNo} onChange={(e) => setDepositNo(e.target.value)} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຊື່ທີມ</label>
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  disabled={!canEdit}
                  placeholder="ຊື່ທີມ"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ລະຫັດອໍເດີ</label>
                <input
                  value={orderCode}
                  onChange={(e) => setOrderCode(e.target.value)}
                  disabled={!canEdit}
                  placeholder="ລະຫັດອໍເດີ"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຜ້າ</label>
                <select value={fabricId} onChange={(e) => setFabricId(e.target.value)} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50">
                  <option value="">ເລືອກຜ້າ</option>
                  {fabrics.map((fabric) => <option key={fabric.id} value={fabric.id}>{fabric.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຈຳນວນແບບຜະລິດ</label>
                <select
                  value={productionStyleCount}
                  onChange={(e) => handleStyleCountChange(Number(e.target.value) as ProductionSlotCount)}
                  disabled={!canEdit}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                >
                  <option value={1}>1 ແບບ</option>
                  <option value={2}>2 ແບບ</option>
                  <option value={3}>3 ແບບ</option>
                  <option value={4}>4 ແບບ</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ວັນທີ່ສົ່ງຜະລິດ</label>
                <input type="date" value={productionSentDate} onChange={(e) => setProductionSentDate(e.target.value)} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ກຳນົດສົ່ງລູກຄ້າວັນທີ</label>
                <input type="date" value={customerDeliveryDate} onChange={(e) => setCustomerDeliveryDate(e.target.value)} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ປະເພດງານ</label>
                <select
                  value={productionPriority}
                  onChange={(e) => setProductionPriority(e.target.value as ProductionPriority)}
                  disabled={!canEdit}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                >
                  <option value="normal">ງານປົກກະຕິ</option>
                  <option value="urgent">ຕ້ອງການເຄື່ອງດ່ວນ!</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ກຳນົດສົ່ງບໍ່ເກີນວັນທີ</label>
                <input
                  type="date"
                  value={urgentDueDate}
                  onChange={(e) => setUrgentDueDate(e.target.value)}
                  disabled={!canEdit || productionPriority !== "urgent"}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                />
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-emerald-700">ຈຳນວນເສື້ອທັງໝົດ</div>
                <div className="mt-2 text-2xl font-black text-emerald-900">{totalProductionQty.toLocaleString()}</div>
                <div className="mt-1 text-xs font-medium text-emerald-700">ລວມແຖມແລ້ວ</div>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-indigo-700">ຈຳນວນໂສ້ງທັງໝົດ</div>
                <div className="mt-2 text-2xl font-black text-indigo-900">{pantsTotalQty.toLocaleString()}</div>
                <div className="mt-1 text-xs font-medium text-indigo-700">ລວມທຸກລາຍການໂສ້ງ</div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 text-sm font-black uppercase tracking-wider text-slate-700">ລູກຄ້າ ແລະ ຜູ້ຮັບຜິດຊອບ</div>
            <div className="grid gap-4 md:grid-cols-2">
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={!canEdit} placeholder="ຊື່ລູກຄ້າ" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} disabled={!canEdit} placeholder="ເບີໂທ" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              <input value={customerWhatsapp} onChange={(e) => setCustomerWhatsapp(e.target.value)} disabled={!canEdit} placeholder="WhatsApp" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              <input value={customerFacebook} onChange={(e) => setCustomerFacebook(e.target.value)} disabled={!canEdit} placeholder="Facebook" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              <select value={adminUserId} onChange={(e) => setAdminUserId(e.target.value)} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50">
                <option value="">ເລືອກແອັດມິນ</option>
                {adminOptions.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
              </select>
              <select value={graphicUserId} onChange={(e) => setGraphicUserId(e.target.value)} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50">
                <option value="">ເລືອກຜູ້ອອກແບບ</option>
                {plannerOptions.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
              </select>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black uppercase tracking-wider text-slate-700">ລາຍການໂສ້ງພິມລາຍ</div>
                <div className="mt-1 text-sm font-medium text-slate-500">ໃຊ້ mockup ແລະ size grid ແບບດຽວກັບເສື້ອ ແຕ່ແຍກຈຳນວນໄຊສ໌ຂອງໂສ້ງອອກຈາກເສື້ອ</div>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  onClick={addPantsItem}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-800"
                >
                  ເພີ່ມລາຍການໂສ້ງ
                </button>
              ) : null}
            </div>

            {pantsItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-500">
                ຍັງບໍ່ມີລາຍການໂສ້ງ
              </div>
            ) : (
              <div className="space-y-4">
                {pantsItems.map((item, index) => {
                  const itemTotal = getPantsProductionItemTotal(item);
                  const targetQty = getPantsTotalQty(item);
                  const quantityMatchesHere = itemTotal === targetQty;
                  const imageUrl = item.mockup_preview_url || item.mockup_url;
                  const filledPantsPlayerRows = getFilledPlayerRows(item);

                  return (
                    <div key={item.clientId} className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-black text-indigo-700">
                            <Shirt size={14} />
                            ໂສ້ງແບບທີ {index + 1}
                          </div>
                          <div className="mt-2 text-base font-black text-slate-900">{item.productName || `ລາຍການໂສ້ງ ${index + 1}`}</div>
                          <div className="mt-1 text-sm font-medium text-slate-500">ຜ້າ: {fabricsById.get(item.fabricId)?.name || "-"}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`rounded-2xl px-4 py-3 text-right ${quantityMatchesHere ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                            <div className="text-xs font-black uppercase tracking-wide">ຈັດໄຊສ໌ແລ້ວ</div>
                            <div className="mt-1 text-2xl font-black">{itemTotal}/{targetQty}</div>
                          </div>
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => removePantsItem(item.clientId)}
                              className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100"
                            >
                              ລົບ
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                        <div className="space-y-3">
                          <div className="overflow-hidden rounded-3xl border border-dashed border-slate-300 bg-white">
                            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                              <span className="text-xs font-black uppercase tracking-wide text-slate-500">Mockup ໂສ້ງ</span>
                              {(imageUrl || item.mockup_file_name) && canEdit ? (
                                <button type="button" onClick={() => clearPantsMockup(item.clientId)} className="text-xs font-black text-rose-700">
                                  ລົບຮູບ
                                </button>
                              ) : null}
                            </div>
                            <div className="p-4">
                              {imageUrl ? (
                                <div className="aspect-square overflow-hidden rounded-2xl border border-slate-100 bg-white">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={imageUrl} alt={`pants-mockup-${index + 1}`} className="h-full w-full object-contain" />
                                </div>
                              ) : (
                                <div className="aspect-square">
                                  <label className="flex h-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500">
                                    <FileImage size={34} />
                                    <span className="mt-3 text-sm font-bold">ແນບຮູບ Mockup</span>
                                    <span className="mt-1 text-xs font-medium">PNG / JPG / WEBP</span>
                                    <input type="file" accept="image/*" onChange={(event) => handlePantsMockupChange(item.clientId, event)} disabled={!canEdit} className="hidden" />
                                  </label>
                                </div>
                              )}
                              {imageUrl && canEdit ? (
                                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm">
                                  <FileUp size={16} />
                                  ປ່ຽນຮູບ
                                  <input type="file" accept="image/*" onChange={(event) => handlePantsMockupChange(item.clientId, event)} disabled={!canEdit} className="hidden" />
                                </label>
                              ) : null}
                              <div className="mt-3 text-xs font-medium text-slate-500">{item.mockup_file_name || "ຍັງບໍ່ມີຮູບ"}</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            <div>
                              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຊື່ລາຍການ</label>
                              <input
                                value={item.productName}
                                onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, productName: e.target.value }))}
                                disabled={!canEdit}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຜ້າ</label>
                              <select
                                value={item.fabricId}
                                onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, fabricId: e.target.value }))}
                                disabled={!canEdit}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                              >
                                <option value="">ເລືອກຜ້າ</option>
                                {fabrics.map((fabric) => (
                                  <option key={fabric.id} value={fabric.id}>
                                    {fabric.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ໄຊສ໌ / ເບີໂສ້ງ</label>
                              <select
                                value={item.player_mode}
                                onChange={(e) =>
                                  updatePantsItem(item.clientId, (current) => ({
                                    ...current,
                                    player_mode: e.target.value as ProductionPlayerMode,
                                    player_rows:
                                      e.target.value === "none"
                                        ? []
                                        : current.player_rows.length > 0
                                          ? current.player_rows
                                          : [buildEmptyPlayerRow()],
                                  }))
                                }
                                disabled={!canEdit}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                              >
                                {PANTS_PLAYER_MODE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4">
                            <div className="mb-4 flex items-center justify-between">
                              <div>
                              <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                                {item.player_mode === "number_only" ? "ລາຍການໄຊສ໌ + ເບີໂສ້ງ" : "ຈຳນວນໄຊສ໌ຂອງໂສ້ງ"}
                              </div>
                              <div className="mt-1 text-sm font-medium text-slate-500">
                                {item.player_mode === "number_only"
                                  ? `ປ້ອນໃຫ້ຄົບ ${targetQty.toLocaleString()} ລາຍການ`
                                  : `ຈຳນວນໂສ້ງລາຍການນີ້ ${targetQty.toLocaleString()} ຕົວ`}
                              </div>
                              </div>
                              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-center">
                                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">TOTAL</div>
                                <div className="mt-1 text-2xl font-black text-slate-900">{itemTotal.toLocaleString()}</div>
                              </div>
                            </div>

                          {item.player_mode === "none" ? (
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                              {PRODUCTION_SIZE_FIELDS.map((field) => (
                                <div key={`${item.clientId}-${field.key}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                  <label className="mb-2 block text-center text-sm font-black uppercase tracking-wide text-slate-700">{field.label}</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={item.sizes[field.key]}
                                    onChange={(e) =>
                                      updatePantsItem(item.clientId, (current) => ({
                                        ...current,
                                        sizes: {
                                          ...current.sizes,
                                          [field.key]: Math.max(0, Number(e.target.value) || 0),
                                        },
                                      }))
                                    }
                                    disabled={!canEdit}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {item.player_mode !== "none" ? (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">ໄຊສ໌ / ເບີໂສ້ງ</div>
                                  <div className="mt-1 text-sm font-medium text-slate-500">
                                    ປ້ອນໄຊສ໌ + ເບີໂສ້ງ ໃຫ້ຄົບ {targetQty.toLocaleString()} ລາຍການ
                                  </div>
                                </div>
                                <div className={`rounded-full px-3 py-1 text-xs font-black ${filledPantsPlayerRows.length === targetQty ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                                  {filledPantsPlayerRows.length}/{targetQty}
                                </div>
                              </div>

                              <div className="space-y-2">
                                {item.player_rows.map((row, rowIndex) => (
                                  <div key={row.id} className="rounded-xl bg-white/80 p-2">
                                    <div className="mb-2 flex items-center justify-between">
                                      <div className="text-sm font-black uppercase tracking-wide text-slate-600">Player {rowIndex + 1}</div>
                                      {canEdit ? (
                                        <button type="button" onClick={() => removePantsPlayerRow(item.clientId, row.id)} className="text-xs font-black text-rose-700">
                                          ລົບ
                                        </button>
                                      ) : null}
                                    </div>
                                    <div className={`grid gap-2 ${item.player_mode === "name_and_number" ? "md:grid-cols-4" : item.player_mode === "name_only" || item.player_mode === "number_only" ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
                                      <div>
                                        <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">ໄຊສ໌</label>
                                        <select
                                          value={row.size}
                                          onChange={(e) => updatePantsPlayerRow(item.clientId, row.id, (current) => ({ ...current, size: e.target.value as ProductionSizeKey | "" }))}
                                          disabled={!canEdit}
                                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                                        >
                                          <option value="">ເລືອກໄຊສ໌</option>
                                          {PRODUCTION_SIZE_FIELDS.map((field) => (
                                            <option key={field.key} value={field.key}>
                                              {field.label}
                                            </option>
                                          ))}
                                          </select>
                                      </div>
                                      <div>
                                        <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">ເບີໂສ້ງ</label>
                                        <input
                                          value={row.jersey_number}
                                          onChange={(e) => updatePantsPlayerRow(item.clientId, row.id, (current) => ({ ...current, jersey_number: e.target.value }))}
                                          disabled={!canEdit}
                                          placeholder="07"
                                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                                        />
                                      </div>
                                      <div>
                                        <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">ໝາຍເຫດ</label>
                                        <input
                                          value={row.note}
                                          onChange={(e) => updatePantsPlayerRow(item.clientId, row.id, (current) => ({ ...current, note: e.target.value }))}
                                          disabled={!canEdit}
                                          placeholder="ເຊັ່ນ Captain"
                                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ))}

                                {canEdit ? (
                                  <button type="button" onClick={() => addPantsPlayerRow(item.clientId)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                                    <Save size={14} />
                                    ເພີ່ມລາຍຊື່ Player
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div>
                              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຈຳນວນຄິດເງິນ</label>
                              <input
                                type="number"
                                min={0}
                                value={item.qty}
                                onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, qty: Number(e.target.value) }))}
                                disabled={!canEdit}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຈຳນວນແຖມ</label>
                              <input
                                type="number"
                                min={0}
                                value={item.freeQty}
                                onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, freeQty: Number(e.target.value) }))}
                                disabled={!canEdit}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-orange-600 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ລາຄາຂາຍ/ຕົວ</label>
                              <input
                                type="number"
                                min={0}
                                value={item.unitPrice}
                                onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, unitPrice: Number(e.target.value) }))}
                                disabled={!canEdit}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຕົ້ນທຶນໂຮງງານ</label>
                              <input
                                type="number"
                                min={0}
                                value={item.factoryCost}
                                onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, factoryCost: Number(e.target.value) }))}
                                disabled={!canEdit}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ໝາຍເຫດ</label>
                              <textarea
                                rows={2}
                                value={item.notes}
                                onChange={(e) => updatePantsItem(item.clientId, (current) => ({ ...current, notes: e.target.value }))}
                                disabled={!canEdit}
                                placeholder="ເຊັ່ນ ຊົງໂສ້ງ, ກະເປົາ, ສາຍຮັດ..."
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                              ຜະລິດລວມ: <span className="text-slate-900">{targetQty.toLocaleString()}</span>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                              ຍອດຂາຍ: <span className="text-slate-900">{getPantsLineGross(item).toLocaleString()}</span>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                              ຕົ້ນທຶນ: <span className="text-slate-900">{Math.max(0, Number(item.factoryCost) || 0).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 text-sm font-black uppercase tracking-wider text-slate-700">ການເງິນ ແລະ ສະລິບ</div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ປະເພດຄໍເສື້ອ</label>
                <select value={collarType} onChange={(e) => {
                  const nextValue = e.target.value as "none" | "polo" | "mandarin";
                  setCollarType(nextValue);
                  if (nextValue === "none") setCollarQty(0);
                }} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50">
                  <option value="none">ບໍ່ບວກ</option>
                  <option value="polo">ໂປໂລ</option>
                  <option value="mandarin">ຄໍຈີນ</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຈຳນວນຄໍເສື້ອທີ່ບວກເພີ່ມ</label>
                <input type="number" min={0} value={collarQty} onChange={(e) => setCollarQty(Number(e.target.value))} disabled={!canEdit || collarType === "none"} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
                <div className="mt-1 text-[11px] font-bold text-slate-500">ລວມຄ່າບວກຄໍ: {formatMoney(collarTotal)}</div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຈຳນວນແຂນເສື້ອທີ່ບວກເພີ່ມ</label>
                <input type="number" min={0} value={sleeveChargeQty} onChange={(e) => setSleeveChargeQty(Number(e.target.value))} disabled={!canEdit} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
                <div className="mt-1 text-[11px] font-bold text-slate-500">ລວມຄ່າບວກແຂນ: {formatMoney(sleeveChargeTotal)}</div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ບວກເພີ່ມ (ງານດ່ວນ, ອື່ນໆ)</label>
                <input type="number" min={0} value={extraCharge} onChange={(e) => setExtraCharge(Number(e.target.value))} disabled={!canEdit} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຫັກຄ່າແບບ</label>
                <input type="number" min={0} value={designDeposit} onChange={(e) => setDesignDeposit(Number(e.target.value))} disabled={!canEdit} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ສ່ວນຫຼຸດ</label>
                <input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} disabled={!canEdit} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ມັດຈຳສັ່ງຜະລິດຈາກລູກຄ້າ</label>
                <input type="number" min={0} value={initialDeposit} onChange={(e) => setInitialDeposit(Number(e.target.value))} disabled={!canEdit} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຕົ້ນທຶນໂຮງງານສ່ວນເສື້ອ</label>
                <input type="number" min={0} value={factoryCost} onChange={(e) => setFactoryCost(Number(e.target.value))} disabled={!canEdit} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50" />
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 md:col-span-2">
                <div className="text-xs font-black uppercase tracking-wide text-indigo-700">ສະຫຼຸບລາຍການໂສ້ງ</div>
                <div className="mt-2 grid gap-2 md:grid-cols-4">
                  <div className="text-sm font-bold text-indigo-900">ຈຳນວນລວມ: {pantsTotalQty.toLocaleString()}</div>
                  <div className="text-sm font-bold text-indigo-900">ຈັດໄຊສ໌ແລ້ວ: {assignedPantsQty.toLocaleString()}</div>
                  <div className="text-sm font-bold text-indigo-900">ຍອດຂາຍ: {formatMoney(pantsSummary.grossTotal)}</div>
                  <div className="text-sm font-bold text-indigo-900">ຕົ້ນທຶນ: {formatMoney(pantsSummary.factoryCostTotal)}</div>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ສະລິບໂອນເງິນ</label>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-medium text-slate-600">ສາມາດເພີ່ມໄດ້ຫຼາຍສະລິບ</div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm">
                    <FileUp size={16} />
                    <span>ເພີ່ມສະລິບ</span>
                    <input type="file" accept="image/*,.pdf" multiple onChange={handleSlipChange} disabled={!canEdit} className="hidden" />
                  </label>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {pendingSlipPreviews.map((item) => (
                    <div key={item.key} className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60">
                      <div className="flex items-center justify-between border-b border-amber-200 px-3 py-2">
                        <span className="inline-flex items-center gap-2 text-xs font-black text-amber-800">
                          <FileUp size={14} />
                          ລໍຖ້າອັບໂຫຼດ
                        </span>
                        <button type="button" onClick={() => removePendingSlip(item.file.name)} className="text-xs font-black text-rose-700">
                          ລົບ
                        </button>
                      </div>
                      <div className="p-3">
                        <div className="mb-3 text-sm font-bold text-slate-800">{item.file.name}</div>
                        {item.isImage && item.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.previewUrl} alt={item.file.name} className="h-48 w-full rounded-xl border border-amber-100 object-cover bg-white" />
                        ) : (
                          <div className="flex h-48 items-center justify-center rounded-xl border border-amber-100 bg-white text-slate-500">
                            <div className="text-center">
                              <FileText size={28} className="mx-auto mb-2" />
                              <div className="text-sm font-bold">ໄຟລ໌ເອກະສານ</div>
                              <div className="mt-1 text-xs font-medium">ຈະເບິ່ງໄດ້ຫຼັງອັບໂຫຼດ</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {slipRows.map((slip) => {
                    const fileName = slip.file_name || slip.file_path.split("/").pop() || "slip";
                    const isImage = isImageFileName(fileName);
                    return (
                      <div key={slip.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                          <span className="inline-flex items-center gap-2 text-xs font-black text-emerald-700">
                            <Eye size={14} />
                            ອັບໂຫຼດແລ້ວ
                          </span>
                          <div className="flex items-center gap-3">
                            {slip.file_url ? (
                              <Link href={slip.file_url} target="_blank" className="text-xs font-black text-sky-700">
                                ເປີດໄຟລ໌
                              </Link>
                            ) : null}
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => void removeUploadedSlip(slip)}
                                disabled={deletingSlipId === slip.id}
                                className="inline-flex items-center gap-1 text-xs font-black text-rose-700 disabled:opacity-50"
                              >
                                <Trash2 size={13} />
                                {deletingSlipId === slip.id ? "ກຳລັງລົບ..." : "ລົບ"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="p-3">
                          <div className="mb-1 text-sm font-bold text-slate-800">{fileName}</div>
                          <div className="mb-3 text-xs font-medium text-slate-400">{new Date(slip.uploaded_at).toLocaleString("en-GB")}</div>
                          {isImage && slip.file_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={slip.file_url} alt={fileName} className="h-48 w-full rounded-xl border border-slate-100 object-cover bg-slate-50" />
                          ) : (
                            <div className="flex h-48 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-500">
                              <div className="text-center">
                                {isImage ? <FileImage size={28} className="mx-auto mb-2" /> : <FileText size={28} className="mx-auto mb-2" />}
                                <div className="text-sm font-bold">{isImage ? "ໄຟລ໌ຮູບພາບ" : "ໄຟລ໌ເອກະສານ"}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {pendingSlipPreviews.length === 0 && slipRows.length === 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-400">
                      ຍັງບໍ່ມີສະລິບ
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 text-sm font-black uppercase tracking-wider text-slate-700">ສະຫຼຸບອໍເດີ</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ຍອດລວມ</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{formatMoney(grossTotal)}</div>
              </div>
              {summaryItems.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.label}</div>
                  <div className={`mt-2 text-2xl font-black ${item.color}`}>{formatMoney(item.value)}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-amber-700">ຫັກຄ່າແບບ</div>
                <div className="mt-2 text-2xl font-black text-amber-900">{formatMoney(designDeposit)}</div>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-rose-700">ສ່ວນຫຼຸດ</div>
                <div className="mt-2 text-2xl font-black text-rose-900">{formatMoney(discount)}</div>
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-sky-700">ຄົງເຫຼືອຫຼັງຫັກ</div>
                <div className="mt-2 text-2xl font-black text-sky-900">{formatMoney(customerBillTotal)}</div>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">ມັດຈຳກ່ອນ</div>
                <div className="mt-2 text-2xl font-black text-emerald-900">
                  {formatMoney(initialDeposit)}
                  {initialDeposit > 0 && customerBillTotal > 0 ? <span className="ml-2 text-sm font-bold">({formattedDepositPercent}%)</span> : null}
                </div>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-rose-700">ຍອດຄ້າງຊຳລະ</div>
                <div className="mt-2 text-2xl font-black text-rose-900">{formatMoney(balance)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ຕົ້ນທຶນລວມ</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{formatMoney(totalFactoryCost)}</div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black uppercase tracking-wider text-slate-700">ແບບຜະລິດ</div>
                <div className="mt-1 text-sm font-medium text-slate-500">ກຳນົດ mockup, ແຂນເສື້ອ, ຄໍເສື້ອ ແລະ ຈຳນວນໄຊສ໌ຂອງແຕ່ລະແບບ</div>
              </div>
              <div className={`rounded-full px-4 py-2 text-xs font-black ${quantityMatches ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                ຈັດໄຊສ໌ແລ້ວ {assignedProductionQty}/{totalProductionQty}
              </div>
            </div>

            <div className="space-y-4">
              {activeProductionItems.map((item, index) => {
                const itemTotal = getProductionItemTotal(item);
                const filledPlayerRows = getFilledPlayerRows(item);
                const imageUrl = item.mockup_preview_url || item.mockup_url;
                const sleeveLabel = PRODUCTION_SLEEVE_OPTIONS.find((option) => option.value === item.sleeve_type)?.label || "-";
                const collarLabel = PRODUCTION_COLLAR_OPTIONS.find((option) => option.value === item.collar_type)?.label || "-";
                return (
                  <div key={item.client_id} className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
                    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700">
                          <Shirt size={14} />
                          ແບບທີ {index + 1}
                        </div>
                        <div className="mt-2 text-sm font-medium text-slate-500">
                          ແຂນເສື້ອ: <span className="font-bold text-slate-700">{sleeveLabel}</span> / ຄໍເສື້ອ: <span className="font-bold text-slate-700">{collarLabel}</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ຈຳນວນແບບນີ້</div>
                        <div className="mt-1 text-2xl font-black text-slate-900">{itemTotal.toLocaleString()}</div>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                      <div className="space-y-3">
                        <div className="overflow-hidden rounded-3xl border border-dashed border-slate-300 bg-white">
                          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Mockup</span>
                            {(imageUrl || item.mockup_file_name) && canEdit ? (
                              <button type="button" onClick={() => clearMockup(index)} className="text-xs font-black text-rose-700">
                                ລົບຮູບ
                              </button>
                            ) : null}
                          </div>
                          <div className="p-4">
                            {imageUrl ? (
                              <div className="aspect-square overflow-hidden rounded-2xl border border-slate-100 bg-white">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={imageUrl} alt={`mockup-${index + 1}`} className="h-full w-full object-contain" />
                              </div>
                            ) : (
                              <div className="aspect-square">
                                <label className="flex h-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500">
                                  <FileImage size={34} />
                                  <span className="mt-3 text-sm font-bold">ແນບຮູບ Mockup</span>
                                  <span className="mt-1 text-xs font-medium">PNG / JPG / WEBP</span>
                                  <input type="file" accept="image/*" onChange={(event) => handleMockupChange(index, event)} disabled={!canEdit} className="hidden" />
                                </label>
                              </div>
                            )}
                            {imageUrl && canEdit ? (
                              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm">
                                <FileUp size={16} />
                                ປ່ຽນຮູບ
                                <input type="file" accept="image/*" onChange={(event) => handleMockupChange(index, event)} disabled={!canEdit} className="hidden" />
                              </label>
                            ) : null}
                            <div className="mt-3 text-xs font-medium text-slate-500">{item.mockup_file_name || "ຍັງບໍ່ມີຮູບ"}</div>
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                          <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ແຂນເສື້ອ</label>
                            <select value={item.sleeve_type} onChange={(e) => updateProductionItem(index, (current) => ({ ...current, sleeve_type: e.target.value as ProductionSleeveType }))} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100">
                              {PRODUCTION_SLEEVE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຄໍເສື້ອ</label>
                            <select value={item.collar_type} onChange={(e) => updateProductionItem(index, (current) => ({ ...current, collar_type: e.target.value as ProductionCollarType }))} disabled={!canEdit} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100">
                              {PRODUCTION_COLLAR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຊື່ Player / ເບີເສື້ອ</label>
                            <select
                              value={item.player_mode}
                              onChange={(e) =>
                                updateProductionItem(index, (current) => ({
                                  ...current,
                                  player_mode: e.target.value as ProductionPlayerMode,
                                  player_rows:
                                    e.target.value === "none"
                                      ? []
                                      : current.player_rows.length > 0
                                        ? current.player_rows
                                        : [buildEmptyPlayerRow()],
                                }))
                              }
                              disabled={!canEdit}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                            >
                              {PRODUCTION_PLAYER_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4">
                        <div className="mb-4 flex items-center justify-between">
                          <div>
                            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                              {item.player_mode === "none" ? "ຈຳນວນໄຊສ໌ທີ່ລູກຄ້າສັ່ງ" : "Player / ເບີເສື້ອ"}
                            </div>
                            <div className="mt-1 text-sm font-medium text-slate-500">
                              {item.player_mode === "none"
                                ? `ລວມຈຳນວນແບບນີ້ ${itemTotal.toLocaleString()} ຕົວ`
                                : `ປ້ອນ ${getPlayerModeInstruction(item.player_mode)} ໃຫ້ຄົບ ${itemTotal.toLocaleString()} ລາຍການ`}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-slate-100 px-4 py-3 text-center">
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Total</div>
                            <div className="mt-1 text-2xl font-black text-slate-900">{itemTotal.toLocaleString()}</div>
                          </div>
                        </div>
                        {item.player_mode === "none" ? (
                          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            {PRODUCTION_SIZE_FIELDS.map((field) => (
                              <div key={field.key} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                <label className="mb-2 block text-center text-sm font-black uppercase tracking-wide text-slate-700">{field.label}</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={item.sizes[field.key]}
                                  onChange={(e) =>
                                    updateProductionItem(index, (current) => ({
                                      ...current,
                                      sizes: {
                                        ...current.sizes,
                                        [field.key]: Math.max(0, Number(e.target.value) || 0),
                                      },
                                    }))
                                  }
                                  disabled={!canEdit}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                                />
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {item.player_mode !== "none" ? (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Player / ເບີເສື້ອ</div>
                                <div className="mt-1 text-sm font-medium text-slate-500">
                                  ປ້ອນ {getPlayerModeInstruction(item.player_mode)} ໃຫ້ຄົບ {itemTotal.toLocaleString()} ລາຍການ
                                </div>
                              </div>
                              <div className={`rounded-full px-3 py-1 text-xs font-black ${filledPlayerRows.length === itemTotal ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                                {filledPlayerRows.length}/{itemTotal}
                              </div>
                            </div>

                            <div className="space-y-2">
                              {item.player_rows.map((row, rowIndex) => (
                                <div key={row.id} className="rounded-xl bg-white/80 p-2">
                                  <div className="mb-2 flex items-center justify-between">
                                    <div className="text-sm font-black uppercase tracking-wide text-slate-600">Player {rowIndex + 1}</div>
                                    {canEdit ? (
                                      <button type="button" onClick={() => removePlayerRow(index, row.id)} className="text-xs font-black text-rose-700">
                                        ລົບ
                                      </button>
                                    ) : null}
                                  </div>
                                  <div className={`grid gap-2 ${item.player_mode === "name_and_number" ? "md:grid-cols-4" : item.player_mode === "name_only" || item.player_mode === "number_only" ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
                                    <div>
                                      <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">ໄຊສ໌</label>
                                      <select
                                        value={row.size}
                                        onChange={(e) => updatePlayerRow(index, row.id, (current) => ({ ...current, size: e.target.value as ProductionSizeKey | "" }))}
                                        disabled={!canEdit}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                                      >
                                        <option value="">ເລືອກໄຊສ໌</option>
                                        {PRODUCTION_SIZE_FIELDS.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                                      </select>
                                    </div>
                                    {playerModeNeedsName(item.player_mode) ? (
                                      <div>
                                        <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">ຊື່ Player</label>
                                        <input
                                          value={row.player_name}
                                          onChange={(e) => updatePlayerRow(index, row.id, (current) => ({ ...current, player_name: e.target.value }))}
                                          disabled={!canEdit}
                                          placeholder="ຊື່ເທິງເສື້ອ"
                                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                                        />
                                      </div>
                                    ) : null}
                                    {playerModeNeedsNumber(item.player_mode) ? (
                                      <div>
                                        <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">ເບີເສື້ອ</label>
                                        <input
                                          value={row.jersey_number}
                                          onChange={(e) => updatePlayerRow(index, row.id, (current) => ({ ...current, jersey_number: e.target.value }))}
                                          disabled={!canEdit}
                                          placeholder="07"
                                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                                        />
                                      </div>
                                    ) : null}
                                    <div>
                                      <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">ໝາຍເຫດ</label>
                                      <input
                                        value={row.note}
                                        onChange={(e) => updatePlayerRow(index, row.id, (current) => ({ ...current, note: e.target.value }))}
                                        disabled={!canEdit}
                                        placeholder="ເຊັ່ນ Captain"
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}

                              {canEdit ? (
                                <button type="button" onClick={() => addPlayerRow(index)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                                  <Save size={14} />
                                  ເພີ່ມລາຍຊື່ Player
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        </div>

        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm print:hidden">
            <div className="mb-4 text-sm font-black uppercase tracking-wider text-slate-700">ກວດຄວາມພ້ອມກ່ອນພິມ</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ຈຳນວນເສື້ອຈາກອໍເດີ</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{totalProductionQty.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-indigo-700">ຈຳນວນໂສ້ງເພີ່ມ</div>
                <div className="mt-2 text-2xl font-black text-indigo-900">{pantsTotalQty.toLocaleString()}</div>
                <div className="mt-1 text-xs font-medium text-indigo-700">ຈັດໄຊສ໌ແລ້ວ {assignedPantsQty.toLocaleString()}</div>
              </div>
              <div className={`rounded-2xl border p-4 ${quantityMatches ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
                <div className={`text-xs font-bold uppercase tracking-wide ${quantityMatches ? "text-emerald-700" : "text-amber-800"}`}>ຈຳນວນທີ່ແບ່ງໃສ່ແບບ</div>
                <div className={`mt-2 text-2xl font-black ${quantityMatches ? "text-emerald-900" : "text-amber-900"}`}>{assignedProductionQty.toLocaleString()}</div>
                <div className={`mt-1 text-xs font-medium ${quantityMatches ? "text-emerald-700" : "text-amber-800"}`}>
                  {quantityMatches ? "ຈຳນວນຄົບແລ້ວ" : `ຍັງຕ່າງ ${Math.abs(quantityDifference).toLocaleString()} ຕົວ`}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ຈຳນວນແບບ</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{productionStyleCount}</div>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-sky-700">ຄົງເຫຼືອຫຼັງຫັກ</div>
                <div className="mt-2 text-2xl font-black text-sky-900">{formatMoney(customerBillTotal)}</div>
              </div>
            </div>
          </section>

          <aside className="production-sheet-preview-shell sticky top-4 rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm print:static print:top-auto print:rounded-none print:border-0 print:p-0 print:shadow-none">
            <div className="mb-3 flex items-center justify-between print:hidden">
              <div>
                <div className="text-[14px] font-black uppercase tracking-[0.18em] text-slate-500">Production Order Preview</div>
                <div className="mt-1 text-sm font-medium text-slate-500">A4 portrait, ພ້ອມພິມໃນໜ້ານີ້</div>
              </div>
              <button type="button" onClick={handlePrint} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                <Printer size={16} />
                ພິມ
              </button>
            </div>

            <div className="production-sheet-a4 mx-auto aspect-[210/297] w-full max-w-[760px] overflow-hidden border border-slate-300 bg-white [font-family:'Noto_Sans_Lao_Looped','Noto_Sans_Lao',Tahoma,Arial,sans-serif] print:max-w-none print:border-0">
              <div className="flex h-full flex-col bg-white p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-slate-700 p-4">
                    <div className="text-[12px] font-black text-slate-700">ຊື່ທີມ:</div>
                    <div className="mt-1 text-[18px] font-black leading-tight text-slate-900">{teamName || "-"}</div>
                    <div className="mt-3 text-[15px] font-black text-slate-700">ລະຫັດອໍເດີ້: <span className="font-black text-sky-700">{orderCode || "-"}</span></div>
                    <div className="mt-1 text-[15px] font-black text-slate-700">ຜ້າ: <span className="font-bold text-slate-900">{selectedFabric?.name || "-"}</span></div>
                  </div>
                  <div className="rounded-md border border-slate-700 p-4">
                    <div className="text-[15px] font-black text-slate-700">ວັນທີ່ສົ່ງຜະລິດ: <span className="font-black text-slate-900">{productionSentDate || "-"}</span></div>
                    <div className="mt-1 text-[15px] font-black text-slate-700">ກຳນົດສົ່ງລູກຄ້າ: <span className="font-black text-slate-900">{customerDeliveryDate || "-"}</span></div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-md bg-sky-50 px-3 py-2">
                        <div className="text-[11px] font-black text-slate-700">ຈຳນວນເສື້ອ</div>
                        <div className="mt-1 text-[24px] font-black leading-none text-sky-700">{totalProductionQty.toLocaleString()}</div>
                      </div>
                      <div className="rounded-md bg-indigo-50 px-3 py-2">
                        <div className="text-[11px] font-black text-slate-700">ຈຳນວນໂສ້ງ</div>
                        <div className="mt-1 text-[24px] font-black leading-none text-indigo-700">{pantsTotalQty.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={`mt-3 rounded-md border px-4 py-2.5 text-center text-[13px] font-black shadow-sm ${
                    productionPriority === "urgent"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-sky-200 bg-sky-50 text-slate-700"
                  }`}
                >
                  <span className="opacity-80">ປະເພດງານ:</span>{" "}
                  <span className={productionPriority === "urgent" ? "text-red-600" : "text-sky-700"}>{priorityBannerText}</span>
                </div>

                <div className="mt-4 grid flex-1 grid-cols-4 gap-3">
                  {activeProductionItems.map((item, index) => {
                    const usesWidePreviewCard = item.player_mode === "name_and_number";
                    const sleeveLabel = PRODUCTION_SLEEVE_OPTIONS.find((option) => option.value === item.sleeve_type)?.label || "-";
                    const collarLabel = PRODUCTION_COLLAR_OPTIONS.find((option) => option.value === item.collar_type)?.label || "-";
                    const imageUrl = item.mockup_preview_url || item.mockup_url;
                    const filledPlayerRows = getFilledPlayerRows(item);
                    const itemSizeMap = getProductionItemSizeMap(item);
                    return (
                      <div key={item.client_id} className={`flex min-h-0 flex-col ${usesWidePreviewCard ? "col-span-2" : ""}`}>
                        <div className="mb-2 rounded-md border border-slate-700 px-2 py-1.5 text-center text-[11px] font-black text-slate-700">
                          ແບບ {index + 1} • {sleeveLabel} • {collarLabel}
                        </div>
                        <div className={`${usesWidePreviewCard ? "h-[176px]" : "aspect-square"} overflow-hidden rounded-md border border-slate-700 bg-white`}>
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageUrl} alt={`preview-${index + 1}`} className="h-full w-full object-contain bg-white" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-center text-[11px] font-bold text-slate-400">
                              ບໍ່ມີຮູບ Mockup
                            </div>
                          )}
                        </div>
                        <div className="mt-3 flex-1 rounded-md border border-slate-700 p-3">
                          {item.player_mode === "none" ? (
                            <>
                              <div className="mb-2 text-center text-[17px] font-black text-sky-700">ຈຳນວນໄຊສ໌</div>
                              <div className="space-y-2 text-[18px]">
                                {PRODUCTION_SIZE_FIELDS.filter((field) => Number(itemSizeMap[field.key]) > 0).map((field) => (
                                  <div key={field.key} className="flex items-center justify-between gap-3">
                                    <span className="font-black text-slate-900">{field.label}:</span>
                                    <span className={`font-black ${itemSizeMap[field.key] > 0 ? "text-rose-600" : "text-slate-500"}`}>
                                      {itemSizeMap[field.key] > 0 ? itemSizeMap[field.key].toLocaleString() : ""}
                                    </span>
                                  </div>
                                ))}
                                {PRODUCTION_SIZE_FIELDS.every((field) => Number(itemSizeMap[field.key]) <= 0) ? (
                                  <div className="text-center text-[13px] font-bold text-slate-400">ຍັງບໍ່ມີຈຳນວນໄຊສ໌</div>
                                ) : null}
                              </div>
                            </>
                          ) : null}

                          {item.player_mode !== "none" && filledPlayerRows.length > 0 ? (
                            <div>
                              <div className="mb-2 text-center text-[14px] font-black text-slate-700">
                                {getPlayerModePreviewTitle(item.player_mode)}
                              </div>
                              <div className={`space-y-1 text-slate-900 ${getPlayerPreviewTextClass(item.player_mode)}`}>
                                {filledPlayerRows.map((row) => {
                                  const sizeLabel = PRODUCTION_SIZE_FIELDS.find((field) => field.key === row.size)?.label || "-";
                                  const lineParts = [
                                    sizeLabel,
                                    playerModeNeedsName(item.player_mode) ? row.player_name || "-" : null,
                                    playerModeNeedsNumber(item.player_mode) ? row.jersey_number || "-" : null,
                                    row.note ? row.note : null,
                                  ].filter(Boolean);
                                  return (
                                    <div key={row.id} className="whitespace-nowrap font-bold">
                                      {lineParts.join(" | ")}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {pantsItems.length > 0
                    ? pantsItems.map((item, index) => {
                        const imageUrl = item.mockup_preview_url || item.mockup_url;
                        const filledPantsPlayerRows = getFilledPlayerRows(item);
                        const pantsItemSizeMap = getPantsProductionItemSizeMap(item);
                        const sizeEntries = PRODUCTION_SIZE_FIELDS.filter((field) => Number(pantsItemSizeMap[field.key]) > 0);
                        return (
                          <div key={item.clientId} className="flex min-h-0 flex-col">
                            <div className="mb-2 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1.5 text-center text-[11px] font-black text-indigo-700">
                              ໂສ້ງ {index + 1}
                            </div>
                            <div className="aspect-square overflow-hidden rounded-md border border-slate-700 bg-white">
                              {imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={imageUrl} alt={`pants-preview-${index + 1}`} className="h-full w-full object-contain bg-white" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-center text-[11px] font-bold text-slate-400">
                                  ບໍ່ມີຮູບ Mockup
                                </div>
                              )}
                            </div>
                            <div className="mt-3 flex-1 rounded-md border border-slate-700 p-3">
                              {item.player_mode === "none" ? (
                                <>
                                  <div className="mb-2 text-center text-[17px] font-black text-sky-700">ຈຳນວນໄຊສ໌</div>
                                  <div className="space-y-2 text-[18px]">
                                    {sizeEntries.map((field) => (
                                      <div key={`${item.clientId}-${field.key}`} className="flex items-center justify-between gap-3">
                                        <span className="font-black text-slate-900">{field.label}:</span>
                                        <span className="font-black text-rose-600">{pantsItemSizeMap[field.key].toLocaleString()}</span>
                                      </div>
                                    ))}
                                    {sizeEntries.length === 0 ? (
                                      <div className="text-center text-[13px] font-bold text-slate-400">ຍັງບໍ່ມີຈຳນວນໄຊສ໌</div>
                                    ) : null}
                                  </div>
                                </>
                              ) : null}
                              {item.player_mode !== "none" && filledPantsPlayerRows.length > 0 ? (
                                <div>
                                  <div className="mb-2 text-center text-[14px] font-black text-slate-700">
                                    LIST
                                  </div>
                                  <div className="space-y-1 text-[13px] leading-snug text-slate-900">
                                    {filledPantsPlayerRows.map((row) => {
                                      const sizeLabel = PRODUCTION_SIZE_FIELDS.find((field) => field.key === row.size)?.label || "-";
                                      const lineParts = [
                                        sizeLabel,
                                        row.jersey_number || "-",
                                        row.note ? row.note : null,
                                      ].filter(Boolean);
                                      return (
                                        <div key={row.id} className="truncate font-bold">
                                          {lineParts.join(" | ")}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                              {item.notes.trim() ? (
                                <div className="mt-4 border-t border-slate-200 pt-3 text-[12px] font-bold text-slate-500">
                                  {item.notes.trim()}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    : null}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-10 px-8 text-center text-[12px] text-slate-900">
                  <div>
                    <div className="h-12 border-b border-slate-900" />
                    <div className="mt-2 font-black">ຜູ້ອອກໃບສັ່ງຜະລິດ</div>
                  </div>
                  <div>
                    <div className="h-12 border-b border-slate-900" />
                    <div className="mt-2 font-black">ຜູ້ວ່າງຜະລິດ</div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 8mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          body * {
            visibility: hidden;
          }

          .production-sheet-preview-shell,
          .production-sheet-preview-shell * {
            visibility: visible;
          }

          .production-sheet-preview-shell {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
          }

          .production-sheet-a4 {
            width: 100% !important;
            max-width: none !important;
            aspect-ratio: auto !important;
            min-height: calc(297mm - 16mm) !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
