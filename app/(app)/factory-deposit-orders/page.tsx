"use client";

import { getProductionCollarLabel, normalizeProductionCollarCode } from "@/lib/production-collars";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import Swal from "sweetalert2";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, ExternalLink, Eye, FileImage, FileDown, FilePlus2, FileSpreadsheet, FileText, PencilLine, Printer, ReceiptText, RefreshCw, Send, Trash2, Undo2, X } from "lucide-react";
import {
  buildPantsOrderItemPayload,
  buildShirtOrderItemPayload,
  getPantsItemsSummary,
  getPantsTotalQty,
  isMissingOrderItemsTableError,
  parsePantsDraftItems,
} from "@/lib/order-items";
import { supabase } from "@/lib/supabase";
import { getOrderWorkCategoryLabel, normalizeOrderWorkCategory, type OrderWorkCategory } from "@/lib/order-work-category";
import { confirmOrderWorkCategory } from "@/lib/order-work-category-dialog";
import { sortProductionPlayerRowsBySize } from "@/lib/production-player-rows";
import type { AppRole } from "@/lib/access-control";
import {
  canApproveFactoryDepositOrder,
  canConvertFactoryDepositOrder,
  canDeleteFactoryDepositOrder,
  canEditFactoryDepositOrder,
  canViewFactoryDepositOrder,
  FACTORY_DEPOSIT_ORDER_STATUS_LABELS,
  FACTORY_DEPOSIT_ORDER_STATUS_STYLES,
  type FactoryDepositOrderStatus,
} from "@/lib/factory-deposit-orders";
import { getMissingOrderCollarFieldsMessage, isMissingOrderCollarFieldsError } from "@/lib/order-collar-fields";
import { workflowErrorMessage } from "@/lib/queue-customers";
import { QuotationA5Preview } from "../_components/quotation-a5-preview";
import { getQuotationDraftById, type QuotationDraft } from "@/lib/quotation-drafts";
import { fetchAllReportRows } from "@/lib/report-query";
import { getDepositSubmitBlocker, mapLegacyCollarType, parsePantsProductionItems, parseProductionItems } from "@/lib/production-sheet";
import { downloadSheetsAsPdf, waitForSheetAssets } from "@/lib/production-sheet-export";
import { canEditWithPermissions, normalizeUserPermissionSettings, type UserPermissionSettings } from "@/lib/user-permissions";
import { ProductionSheetA4, type ProductionSheetA4Props } from "./_components/production-sheet-a4";
import { RowActionMenu, type RowActionMenuItem } from "./_components/row-action-menu";

type DepositRow = {
  work_category?: string | null;
  id: string;
  quotation_draft_id?: string | null;
  deposit_no: string;
  deposit_date: string;
  order_code: string | null;
  order_date: string | null;
  quotation_quote_no: string | null;
  status: FactoryDepositOrderStatus;
  customer_name: string;
  customer_phone: string;
  customer_whatsapp?: string;
  fabric_name: string;
  short_qty: number;
  long_qty: number;
  free_qty: number;
  qty_3xl: number;
  qty_4xl: number;
  qty_5xl: number;
  qty_6xl: number;
  factory_bill_code: string | null;
  admin_user_id: string | null;
  graphic_user_id: string | null;
  fabric_id: string | null;
  fabric_short_price: number;
  fabric_long_price: number;
  collar_type?: string | null;
  collar_label?: string;
  collar_unit_price?: number;
  work_category_label?: string;
  collar_qty?: number;
  sleeve_charge_qty?: number;
  extra_charge: number;
  design_deposit: number;
  initial_deposit: number;
  factory_cost: number;
  gross_total: number;
  net_total: number;
  balance: number;
  order_id: string | null;
  created_by_user_id: string | null;
  agent_user_id?: string | null;
  team_name?: string | null;
  production_sent_date?: string | null;
  delivery_date?: string | null;
  production_priority?: "normal" | "urgent" | null;
  urgent_due_date?: string | null;
  production_items?: unknown;
  pants_items?: unknown;
  sleeve_type?: ProductionSleeveType | null;
  quotation_snapshot?: { workCategoryLabel?: string | null } | null;
  transfer_slip_url?: string | null;
  transfer_slip_path?: string | null;
};

type UserRow = {
  id: string;
  auth_user_id: string | null;
  full_name: string | null;
  role: AppRole;
  permission_settings?: UserPermissionSettings | null;
};

type ProductionSheetJob = {
  rows: DepositRow[];
  action: "print" | "pdf";
};

type BulkSkip = {
  row: Pick<DepositRow, "order_code" | "deposit_no">;
  reason: string;
};

type ListFilter = FactoryDepositOrderStatus | "all" | "print:done" | "print:pending";

type PrintConfirmationRow = {
  deposit_order_id: string;
  confirmed_by_user_id: string;
  confirmed_at: string;
};

// Keep search and totals available for every order without loading production details.
type DepositIndexRow = Pick<DepositRow,
  "id" | "deposit_no" | "order_code" | "quotation_quote_no" | "customer_name" |
  "factory_bill_code" | "status" | "created_by_user_id" | "agent_user_id" | "net_total"
>;

const ROW_FETCH_CHUNK_SIZE = 100;
const ROW_ICON_BUTTON_CLASS = "inline-flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-200 bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40";
const ROW_ICON_CAPTION_CLASS = "text-[10px] font-black leading-none";
const PRINT_CONFIRMATIONS_TABLE = "factory_deposit_order_print_confirmations";
const PRINT_MIGRATION_MESSAGE = "ກະລຸນາລັນ 20261111_add_deposit_print_confirmations.sql ໃນ Supabase SQL Editor";
const BULK_BUTTON_CLASS = "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";

function isMissingPrintConfirmationsTable(error: { message?: string } | null | undefined) {
  const message = String(error?.message || "");
  return message.includes(PRINT_CONFIRMATIONS_TABLE) && /(schema cache|does not exist)/i.test(message);
}

function getRowLabel(row: Pick<DepositRow, "order_code" | "deposit_no">) {
  return row.order_code?.trim() || row.deposit_no;
}

function buildBulkDialogContent(summary: string, details: string[]) {
  const content = document.createElement("div");
  const heading = document.createElement("div");
  heading.textContent = summary;
  content.appendChild(heading);
  if (details.length > 0) {
    const list = document.createElement("ul");
    list.style.cssText = "margin-top:12px;max-height:220px;overflow-y:auto;text-align:left;font-size:13px;line-height:1.6;";
    details.forEach((detail) => {
      const item = document.createElement("li");
      item.textContent = detail;
      list.appendChild(item);
    });
    content.appendChild(list);
  }
  return content;
}

const PAGE_SIZE = 20;

type DepositSlipRow = {
  id: string;
  deposit_order_id: string;
  file_name: string;
  file_path: string;
  file_url: string | null;
  note: string | null;
  uploaded_at: string;
};

type ProductionPlayerMode = "none" | "name_only" | "number_only" | "name_and_number";
type ProductionSleeveType = "short" | "long" | "mixed" | "raglan" | "basketball";
type ProductionCollarType = string;
type ProductionSizeKey = "xs" | "jxs" | "js" | "jm" | "jl" | "jxl" | "j2xl" | "s" | "m" | "l" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl";

type ProductionPlayerRow = {
  id: string;
  size: ProductionSizeKey | "";
  player_name: string;
  jersey_number: string;
  note: string;
};

type ProductionPreviewItem = {
  client_id: string;
  sleeve_type: ProductionSleeveType;
  collar_type: ProductionCollarType;
  collar_label?: string;
  mockup_url: string | null;
  sizes: Record<ProductionSizeKey, number>;
  player_mode: ProductionPlayerMode;
  player_rows: ProductionPlayerRow[];
};

type FabricRow = {
  id: string;
  name: string;
};

type CsvCell = string | number;

const PRODUCTION_SLEEVE_OPTIONS: Array<{ value: ProductionSleeveType; label: string }> = [
  { value: "short", label: "ແຂນສັ້ນ" },
  { value: "long", label: "ແຂນຍາວ" },
  { value: "mixed", label: "ແຂນສັ້ນ/ແຂນຍາວ" },
  { value: "raglan", label: "ແຂນກິ້ນ" },
  { value: "basketball", label: "ເສື້ອບາສ" },
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

function toPositiveInt(value: unknown) {
  return Math.max(0, Number(value) || 0);
}

function parseProductionPreviewItems(raw: unknown): ProductionPreviewItem[] {
  if (!Array.isArray(raw)) return [] as ProductionPreviewItem[];
  return raw.slice(0, 4).map((entry, index) => {
    const row = typeof entry === "object" && entry ? (entry as Record<string, unknown>) : {};
    const nestedSizes = typeof row.sizes === "object" && row.sizes ? (row.sizes as Record<string, unknown>) : {};
    const nestedPlayers = Array.isArray(row.player_rows) ? row.player_rows : [];
    return {
      client_id: typeof row.client_id === "string" ? row.client_id : `item-${index}`,
      sleeve_type:
        row.sleeve_type === "long" ||
        row.sleeve_type === "mixed" ||
        row.sleeve_type === "short" ||
        row.sleeve_type === "raglan" ||
        row.sleeve_type === "basketball"
          ? (row.sleeve_type as ProductionSleeveType)
          : "short",
      collar_type: normalizeProductionCollarCode(row.collar_type, "crew"),
        collar_label: getProductionCollarLabel(normalizeProductionCollarCode(row.collar_type, "crew"), typeof row.collar_label === "string" ? row.collar_label : undefined),
      mockup_url: typeof row.mockup_url === "string" ? row.mockup_url : null,
      player_mode:
        row.player_mode === "name_only" ||
        row.player_mode === "number_only" ||
        row.player_mode === "name_and_number" ||
        row.player_mode === "none"
          ? (row.player_mode as ProductionPlayerMode)
          : "none",
      player_rows: nestedPlayers.map((player, playerIndex): ProductionPlayerRow => {
        const playerRow = typeof player === "object" && player ? (player as Record<string, unknown>) : {};
        const sizeValue = typeof playerRow.size === "string" ? playerRow.size : "";
        const parsedSize: ProductionPlayerRow["size"] = PRODUCTION_SIZE_FIELDS.some((field) => field.key === sizeValue)
          ? (sizeValue as ProductionSizeKey)
          : "";
        return {
          id: typeof playerRow.id === "string" ? playerRow.id : `player-${index}-${playerIndex}`,
          size: parsedSize,
          player_name: typeof playerRow.player_name === "string" ? playerRow.player_name : "",
          jersey_number: typeof playerRow.jersey_number === "string" ? playerRow.jersey_number : "",
          note: typeof playerRow.note === "string" ? playerRow.note : "",
        };
      }),
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
    };
  });
}

function parseProductionExportItems(raw: unknown): ProductionPreviewItem[] {
  if (!Array.isArray(raw)) return [] as ProductionPreviewItem[];
  return raw.slice(0, 6).map((entry, index) => {
    const row = typeof entry === "object" && entry ? (entry as Record<string, unknown>) : {};
    const nestedSizes = typeof row.sizes === "object" && row.sizes ? (row.sizes as Record<string, unknown>) : {};
    const nestedPlayers = Array.isArray(row.player_rows) ? row.player_rows : [];
    return {
      client_id: typeof row.client_id === "string" ? row.client_id : `item-${index}`,
      sleeve_type:
        row.sleeve_type === "long" ||
        row.sleeve_type === "mixed" ||
        row.sleeve_type === "short" ||
        row.sleeve_type === "raglan" ||
        row.sleeve_type === "basketball"
          ? (row.sleeve_type as ProductionSleeveType)
          : "short",
      collar_type: normalizeProductionCollarCode(row.collar_type, "crew"),
        collar_label: getProductionCollarLabel(normalizeProductionCollarCode(row.collar_type, "crew"), typeof row.collar_label === "string" ? row.collar_label : undefined),
      mockup_url: typeof row.mockup_url === "string" ? row.mockup_url : null,
      player_mode:
        row.player_mode === "name_only" ||
        row.player_mode === "number_only" ||
        row.player_mode === "name_and_number" ||
        row.player_mode === "none"
          ? (row.player_mode as ProductionPlayerMode)
          : "none",
      player_rows: nestedPlayers.map((player, playerIndex): ProductionPlayerRow => {
        const playerRow = typeof player === "object" && player ? (player as Record<string, unknown>) : {};
        const sizeValue = typeof playerRow.size === "string" ? playerRow.size : "";
        const parsedSize: ProductionPlayerRow["size"] = PRODUCTION_SIZE_FIELDS.some((field) => field.key === sizeValue)
          ? (sizeValue as ProductionSizeKey)
          : "";
        return {
          id: typeof playerRow.id === "string" ? playerRow.id : `player-${index}-${playerIndex}`,
          size: parsedSize,
          player_name: typeof playerRow.player_name === "string" ? playerRow.player_name : "",
          jersey_number: typeof playerRow.jersey_number === "string" ? playerRow.jersey_number : "",
          note: typeof playerRow.note === "string" ? playerRow.note : "",
        };
      }),
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
    };
  });
}

function getFilledPlayerRows(item: ProductionPreviewItem) {
  return sortProductionPlayerRowsBySize(
    item.player_rows.filter((row) => row.size || row.player_name.trim() || row.jersey_number.trim() || row.note.trim())
  );
}

function playerModeNeedsName(mode: ProductionPlayerMode) {
  return mode === "name_only" || mode === "name_and_number";
}

function playerModeNeedsNumber(mode: ProductionPlayerMode) {
  return mode === "number_only" || mode === "name_and_number";
}

function getPlayerModePreviewTitle(mode: ProductionPlayerMode) {
  if (mode === "name_only") return "NAME LIST";
  if (mode === "number_only") return "NO. LIST";
  return "PLAYER / NO.";
}

function getPlayerModeCsvLabel(mode: ProductionPlayerMode) {
  if (mode === "name_only") return "ຊື່";
  if (mode === "number_only") return "ເບີເສື້ອ";
  if (mode === "name_and_number") return "ຊື່+ເບີເສື້ອ";
  return "ຈຳນວນໄຊສ໌";
}

function getProductionSleeveLabel(value: ProductionSleeveType) {
  return PRODUCTION_SLEEVE_OPTIONS.find((option) => option.value === value)?.label || "-";
}


function isImageFileName(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(name || ""));
}

function getPrimaryDocumentCode(row: Pick<DepositRow, "quotation_quote_no" | "order_code" | "deposit_no">) {
  return row.quotation_quote_no?.trim() || row.order_code?.trim() || row.deposit_no.trim();
}

function getSecondaryDocumentCode(row: Pick<DepositRow, "quotation_quote_no" | "order_code" | "deposit_no">) {
  const primary = row.order_code?.trim() || getPrimaryDocumentCode(row);
  const candidates = [row.quotation_quote_no?.trim(), row.deposit_no.trim()].filter((value): value is string => Boolean(value && value !== primary));
  return candidates.join(" / ");
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return fallback;
}

function buildNameAndNumberValue(name: string, number: string) {
  const trimmedName = name.trim();
  const trimmedNumber = number.trim();
  if (trimmedName && trimmedNumber) return `${trimmedName} | ${trimmedNumber}`;
  return trimmedName || trimmedNumber || "";
}

function toCsvValue(value: CsvCell | null | undefined) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
  return text;
}

function downloadCsvFile(fileName: string, rows: CsvCell[][]) {
  const content = rows.map((row) => row.map((cell) => toCsvValue(cell)).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function buildProductionCsvRows(row: DepositRow): CsvCell[][] {
  const items = parseProductionExportItems(row.production_items).filter((item) => {
    const hasSizes = PRODUCTION_SIZE_FIELDS.some((field) => Number(item.sizes[field.key]) > 0);
    return hasSizes || getFilledPlayerRows(item).length > 0;
  });

  if (items.length === 0) return [];

  const csvRows: CsvCell[][] = [
    ["ເອກະສານ", getPrimaryDocumentCode(row)],
    ["ລະຫັດອໍເດີ", row.order_code || "-"],
    ["ຊື່ທີມ", row.team_name || "-"],
    ["ລູກຄ້າ", row.customer_name || "-"],
    ["ວັນທີສົ່ງຜະລິດ", row.production_sent_date || "-"],
    [],
  ];

  items.forEach((item, index) => {
    const styleLabel = `ແບບ ${index + 1}`;
    const sleeveLabel = getProductionSleeveLabel(item.sleeve_type);
    const collarLabel = getProductionCollarLabel(item.collar_type, item.collar_label);
    const filledPlayerRows = getFilledPlayerRows(item);

    csvRows.push([styleLabel, `ແຂນ: ${sleeveLabel}`, `ຄໍ: ${collarLabel}`]);
    csvRows.push(["ແບບເສື້ອ", "ປະເພດຂໍ້ມູນ", "ໄຊສ໌ເສື້ອ", "ຈຳນວນ", "ເບີເສື້ອ", "ຊື່", "ຊື່+ເບີເສື້ອ", "ໝາຍເຫດ"]);

    if (filledPlayerRows.length > 0) {
      filledPlayerRows.forEach((player) => {
        const sizeLabel = PRODUCTION_SIZE_FIELDS.find((field) => field.key === player.size)?.label || "-";
        csvRows.push([
          styleLabel,
          getPlayerModeCsvLabel(item.player_mode),
          sizeLabel,
          1,
          player.jersey_number || "",
          player.player_name || "",
          buildNameAndNumberValue(player.player_name, player.jersey_number),
          player.note || "",
        ]);
      });
    } else {
      PRODUCTION_SIZE_FIELDS.filter((field) => Number(item.sizes[field.key]) > 0).forEach((field) => {
        csvRows.push([styleLabel, "SIZE QTY", field.label, Number(item.sizes[field.key]) || 0, "", "", "", ""]);
      });
    }

    csvRows.push([]);
  });

  return csvRows;
}

function buildProductionSheetProps(row: DepositRow, createdByName: string): ProductionSheetA4Props {
  const pantsItems = parsePantsProductionItems(row.pants_items);
  const pantsSummary = getPantsItemsSummary(pantsItems);
  return {
    teamName: row.team_name || "",
    orderCode: row.order_code || "",
    workCategoryLabel: row.work_category_label || row.quotation_snapshot?.workCategoryLabel || getOrderWorkCategoryLabel(row.work_category),
    fabricName: row.fabric_name || "",
    productionSentDate: row.production_sent_date || "",
    customerDeliveryDate: row.delivery_date || "",
    shirtQty: Math.max(0, Number(row.short_qty) || 0) + Math.max(0, Number(row.long_qty) || 0) + Math.max(0, Number(row.free_qty) || 0),
    pantsQty: pantsSummary.billableQty + pantsSummary.freeQty,
    productionPriority: row.production_priority === "urgent" ? "urgent" : "normal",
    urgentDueDate: row.urgent_due_date || "",
    items: parseProductionItems(row.production_items, row.sleeve_type || "short", mapLegacyCollarType(row.collar_type)),
    pantsItems,
    signatureFields: [
      { label: "ຜູ້ອອກໃບສັ່ງຜະລິດ", name: createdByName },
      { label: "ຜູ້ວາງ Pattern", name: "" },
      { label: "ຜູ້ວາງພ້ອມພິມ", name: "" },
      { label: "ຜູ້ສົ່ງໂຮງງານ", name: "" },
    ],
  };
}

function buildProductionCsvFileName(row: DepositRow) {
  const code = row.order_code?.trim() || getPrimaryDocumentCode(row);
  const safeCode = code.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${safeCode || "production-order"}.csv`;
}

export default function FactoryDepositOrdersPage() {
  const [orderIndex, setOrderIndex] = useState<DepositIndexRow[]>([]);
  const [loadedPage, setLoadedPage] = useState<{ indexRows: DepositIndexRow[]; rows: DepositRow[] } | null>(null);
  const [fabrics, setFabrics] = useState<FabricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<AppRole | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [userNamesById, setUserNamesById] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListFilter>("all");
  const [page, setPage] = useState(1);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [sheetJob, setSheetJob] = useState<ProductionSheetJob | null>(null);
  const [sheetProgress, setSheetProgress] = useState(0);
  const sheetShellRef = useRef<HTMLDivElement>(null);
  const [viewerPermissions, setViewerPermissions] = useState<UserPermissionSettings | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [printConfirmations, setPrintConfirmations] = useState<Map<string, PrintConfirmationRow>>(new Map());
  const [printTrackingReady, setPrintTrackingReady] = useState(false);
  const [previewRow, setPreviewRow] = useState<DepositRow | null>(null);
  const [quotationPreviewRow, setQuotationPreviewRow] = useState<DepositRow | null>(null);
  const [quotationPreviewDraft, setQuotationPreviewDraft] = useState<QuotationDraft | null>(null);
  const [quotationPreviewLoading, setQuotationPreviewLoading] = useState(false);
  const [quotationPreviewError, setQuotationPreviewError] = useState<string | null>(null);
  const [slipPreviewRow, setSlipPreviewRow] = useState<DepositRow | null>(null);
  const [slipPreviewRows, setSlipPreviewRows] = useState<DepositSlipRow[]>([]);
  const [slipPreviewLoading, setSlipPreviewLoading] = useState(false);

  // The list stays usable before the migration runs; only the print status is hidden.
  const loadPrintConfirmations = async () => {
    const { data, error } = await fetchAllReportRows<PrintConfirmationRow>((from, to) =>
      supabase.from(PRINT_CONFIRMATIONS_TABLE).select("deposit_order_id,confirmed_by_user_id,confirmed_at").order("deposit_order_id").range(from, to)
    );
    if (error) {
      setPrintTrackingReady(false);
      if (!isMissingPrintConfirmationsTable(error)) toast.error(getErrorMessage(error, "ໂຫຼດສະຖານະການພິມບໍ່ສຳເລັດ"));
      return;
    }
    setPrintConfirmations(new Map((data ?? []).map((row) => [row.deposit_order_id, row])));
    setPrintTrackingReady(true);
  };

  const load = async () => {
    setLoading(true);
    setErr(null);
    void loadPrintConfirmations();
    try {
      const [
        { data: depositData, error: depositError },
        { data: usersData, error: usersError },
        { data: fabricsData, error: fabricsError },
        { data: sessionData },
      ] =
        await Promise.all([
          fetchAllReportRows<DepositIndexRow>((from, to) =>
            supabase.from("factory_deposit_orders")
              .select("id,deposit_no,order_code,quotation_quote_no,customer_name,factory_bill_code,status,created_by_user_id,agent_user_id,net_total")
              .order("deposit_date", { ascending: false })
              .order("created_at", { ascending: false })
              .order("id", { ascending: false })
              .range(from, to)
          ),
          supabase.from("users").select("id,auth_user_id,full_name,role,permission_settings").eq("is_active", true),
          supabase.from("fabrics").select("id,name").eq("is_active", true).order("name", { ascending: true }),
          supabase.auth.getSession(),
        ]);

      if (depositError) throw depositError;
      if (usersError) throw usersError;
      if (fabricsError) throw fabricsError;

      setOrderIndex(depositData ?? []);
      setFabrics((fabricsData ?? []) as FabricRow[]);
      const authUserId = sessionData.session?.user.id ?? null;
      const userRows = (usersData ?? []) as UserRow[];
      setUserNamesById(new Map(userRows.map((item) => [item.id, item.full_name || ""])));
      const currentUser = userRows.find((item) => item.auth_user_id === authUserId) || null;
      setViewerRole(currentUser?.role ?? null);
      setViewerUserId(currentUser?.id ?? null);
      setViewerPermissions(normalizeUserPermissionSettings(currentUser?.permission_settings));
    } catch (error) {
      setErr(error instanceof Error ? error.message : "ໂຫຼດລາຍການບໍ່ສຳເລັດ");
      setOrderIndex([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Runs once on mount; later reloads are triggered by the actions themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return orderIndex.filter((row) => {
      if (!canViewFactoryDepositOrder(row, viewerRole, viewerUserId)) return false;
      if (statusFilter === "print:done") {
        if (!printConfirmations.has(row.id)) return false;
      } else if (statusFilter === "print:pending") {
        if (printConfirmations.has(row.id)) return false;
      } else if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }
      if (!keyword) return true;
      return [row.deposit_no, row.order_code || "", row.quotation_quote_no || "", row.customer_name || "", row.factory_bill_code || ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [query, orderIndex, statusFilter, printConfirmations, viewerRole, viewerUserId]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageIndexRows = useMemo(() => filteredRows.slice(pageStart, pageStart + PAGE_SIZE), [filteredRows, pageStart]);
  const tableLoading = loading || loadedPage?.indexRows !== pageIndexRows;
  const rows = loadedPage?.rows ?? [];

  useEffect(() => {
    let cancelled = false;
    const loadPage = async () => {
      if (pageIndexRows.length === 0) {
        setLoadedPage({ indexRows: pageIndexRows, rows: [] });
        return;
      }

      setErr(null);
      try {
        const { data, error } = await supabase.from("factory_deposit_orders")
          .select("*")
          .in("id", pageIndexRows.map((row) => row.id));
        if (error) throw error;
        if (cancelled) return;

        const byId = new Map(((data ?? []) as DepositRow[]).map((row) => [row.id, row]));
        const pageRows = pageIndexRows.flatMap((row) => {
          const detail = byId.get(row.id);
          return detail ? [detail] : [];
        });
        setLoadedPage({ indexRows: pageIndexRows, rows: pageRows });
      } catch (error) {
        if (cancelled) return;
        setErr(getErrorMessage(error, "ໂຫຼດລາຍການບໍ່ສຳເລັດ"));
        setLoadedPage({ indexRows: pageIndexRows, rows: [] });
      }
    };
    void loadPage();
    return () => { cancelled = true; };
  }, [pageIndexRows]);

  // Sheets are mounted off-screen for the job, then printed or captured from the same markup.
  useEffect(() => {
    if (!sheetJob) return;
    let cancelled = false;
    const finishPrint = () => setSheetJob(null);

    const run = async () => {
      const shell = sheetShellRef.current;
      if (!shell) return;
      await waitForSheetAssets(shell);
      // Let sheets re-split pages after late fonts or images before printing or capturing.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (cancelled) return;

      if (sheetJob.action === "print") {
        window.addEventListener("afterprint", finishPrint, { once: true });
        window.print();
        return;
      }

      try {
        const documents = Array.from(shell.querySelectorAll<HTMLElement>(".production-sheet-document"));
        await downloadSheetsAsPdf(
          documents.map((document, index) => ({
            pages: Array.from(document.querySelectorAll<HTMLElement>(".production-sheet-a4")),
            code: sheetJob.rows[index].order_code?.trim() || getPrimaryDocumentCode(sheetJob.rows[index]),
          })),
          setSheetProgress
        );
        if (!cancelled) toast.success("ດາວໂຫຼດ PDF ສຳເລັດ");
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error, "ດາວໂຫຼດ PDF ບໍ່ສຳເລັດ"));
      } finally {
        if (!cancelled) {
          setSheetProgress(0);
          setSheetJob(null);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", finishPrint);
    };
  }, [sheetJob]);

  // Selection survives paging and searching, so resolve it against what the viewer can still see.
  const selectedIndexRows = useMemo(
    () => orderIndex.filter((row) => selectedIds.has(row.id) && canViewFactoryDepositOrder(row, viewerRole, viewerUserId)),
    [orderIndex, selectedIds, viewerRole, viewerUserId]
  );
  const canSubmitDeposit = (row: DepositIndexRow) => {
    if (!viewerRole || row.status !== "draft") return false;
    if (!canEditWithPermissions(viewerPermissions, "factory_deposit_orders", canEditFactoryDepositOrder(row.status, viewerRole))) return false;
    return viewerRole !== "staff" || row.created_by_user_id === viewerUserId;
  };
  const submittableCount = selectedIndexRows.filter(canSubmitDeposit).length;
  const convertibleCount = selectedIndexRows.filter((row) => row.status === "approved").length;
  const printUnconfirmedCount = selectedIndexRows.filter((row) => !printConfirmations.has(row.id)).length;
  const canConvertAsViewer = !!viewerRole && canConvertFactoryDepositOrder(viewerRole);
  const documentJobRunning = sheetJob?.action === "pdf";
  const bulkBusy = documentJobRunning || bulkProgress !== null;
  const pageRowsAllSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const pageRowsSomeSelected = rows.some((row) => selectedIds.has(row.id));

  const setRowsSelected = (ids: string[], selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => (selected ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  // Bulk actions read fresh rows so decisions never rely on a status from an old page load.
  const fetchSelectedRows = async () => {
    const ids = selectedIndexRows.map((row) => row.id);
    const byId = new Map<string, DepositRow>();
    for (let start = 0; start < ids.length; start += ROW_FETCH_CHUNK_SIZE) {
      const { data, error } = await supabase.from("factory_deposit_orders").select("*").in("id", ids.slice(start, start + ROW_FETCH_CHUNK_SIZE));
      if (error) throw error;
      ((data ?? []) as DepositRow[]).forEach((row) => byId.set(row.id, row));
    }
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  };

  const handleBulkDocument = async (action: ProductionSheetJob["action"]) => {
    setBulkProgress("ກຳລັງໂຫຼດຂໍ້ມູນ...");
    try {
      const selectedRows = await fetchSelectedRows();
      if (selectedRows.length === 0) {
        toast.error("ບໍ່ພົບລາຍການທີ່ເລືອກ");
        return;
      }
      setSheetJob({ rows: selectedRows, action });
    } catch (error) {
      toast.error(getErrorMessage(error, "ໂຫຼດລາຍການບໍ່ສຳເລັດ"));
    } finally {
      setBulkProgress(null);
    }
  };

  const runBulkAction = async (
    eligible: DepositRow[],
    skipped: BulkSkip[],
    progressLabel: string,
    action: (row: DepositRow) => Promise<void>
  ) => {
    const failures: BulkSkip[] = [];
    const succeededIds: string[] = [];
    for (const [index, row] of eligible.entries()) {
      setBulkProgress(`${progressLabel} ${index + 1}/${eligible.length}`);
      try {
        await action(row);
        succeededIds.push(row.id);
      } catch (error) {
        failures.push({ row, reason: getErrorMessage(error, "ບໍ່ສຳເລັດ") });
      }
    }
    setBulkProgress(null);
    setRowsSelected(succeededIds, false);
    await load();

    await Swal.fire({
      icon: failures.length > 0 ? "warning" : skipped.length > 0 ? "info" : "success",
      title: `ສຳເລັດ ${succeededIds.length} ລາຍການ`,
      html: buildBulkDialogContent(
        `ບໍ່ສຳເລັດ ${failures.length} • ຂ້າມ ${skipped.length}`,
        [...failures, ...skipped].map(({ row, reason }) => `${getRowLabel(row)}: ${reason}`)
      ),
      confirmButtonText: "ຕົກລົງ",
    });
  };

  const confirmBulk = async (title: string, eligibleCount: number, skipped: BulkSkip[], confirmButtonText: string) => {
    if (eligibleCount === 0) {
      await Swal.fire({
        icon: "info",
        title: "ບໍ່ມີລາຍການທີ່ເຮັດໄດ້",
        html: buildBulkDialogContent("", skipped.map(({ row, reason }) => `${getRowLabel(row)}: ${reason}`)),
        confirmButtonText: "ຕົກລົງ",
      });
      return false;
    }
    const result = await Swal.fire({
      icon: "question",
      title,
      html: buildBulkDialogContent(
        `ຈະດຳເນີນການ ${eligibleCount} ລາຍການ${skipped.length > 0 ? ` • ຂ້າມ ${skipped.length} ລາຍການ` : ""}`,
        skipped.map(({ row, reason }) => `${getRowLabel(row)}: ${reason}`)
      ),
      showCancelButton: true,
      confirmButtonText,
      cancelButtonText: "ຍົກເລີກ",
      reverseButtons: true,
    });
    return result.isConfirmed;
  };

  const handleBulkConfirmPrinted = async () => {
    if (!viewerUserId) return toast.error("ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້");
    const pending = selectedIndexRows.filter((row) => !printConfirmations.has(row.id));
    const skipped = selectedIndexRows
      .filter((row) => printConfirmations.has(row.id))
      .map((row) => ({ row, reason: "ຢືນຢັນການພິມແລ້ວ" }));
    if (!(await confirmBulk("ຢືນຢັນວ່າພິມສຳເລັດແລ້ວ?", pending.length, skipped, "ຢືນຢັນພິມສຳເລັດ"))) return;

    setBulkProgress("ກຳລັງບັນທຶກ...");
    try {
      const { error } = await supabase
        .from(PRINT_CONFIRMATIONS_TABLE)
        .upsert(
          pending.map((row) => ({ deposit_order_id: row.id, confirmed_by_user_id: viewerUserId })),
          { onConflict: "deposit_order_id", ignoreDuplicates: true }
        );
      if (error) throw isMissingPrintConfirmationsTable(error) ? new Error(PRINT_MIGRATION_MESSAGE) : error;
      setRowsSelected(selectedIndexRows.map((row) => row.id), false);
      await loadPrintConfirmations();
      toast.success(`ຢືນຢັນການພິມ ${pending.length} ໃບສຳເລັດ`);
    } catch (error) {
      toast.error(getErrorMessage(error, "ຢືນຢັນການພິມບໍ່ສຳເລັດ"));
    } finally {
      setBulkProgress(null);
    }
  };

  const handleBulkSubmit = async () => {
    setBulkProgress("ກຳລັງກວດຂໍ້ມູນ...");
    try {
      if (viewerRole === "agent") {
        const { data: ready, error } = await supabase.rpc("sales_agent_deposit_editing_enabled");
        if (error || ready !== true) throw new Error("ກະລຸນາລັນ 20261110_expand_agent_workflow_permissions.sql ໃນ Supabase SQL Editor");
      }
      const selectedRows = await fetchSelectedRows();
      const eligible: DepositRow[] = [];
      const skipped: BulkSkip[] = [];
      selectedRows.forEach((row) => {
        if (row.status !== "draft") {
          skipped.push({ row, reason: `ສະຖານະ${FACTORY_DEPOSIT_ORDER_STATUS_LABELS[row.status]}` });
        } else if (!canSubmitDeposit(row)) {
          skipped.push({ row, reason: "ທ່ານບໍ່ມີສິດແກ້ໄຂໃບນີ້" });
        } else {
          const blocker = getDepositSubmitBlocker(row, !!row.fabric_id && fabricsById.has(row.fabric_id));
          if (blocker) skipped.push({ row, reason: blocker });
          else eligible.push(row);
        }
      });
      setBulkProgress(null);
      if (!(await confirmBulk("ຢືນຢັນບັນທຶກ ແລະ ສົ່ງ?", eligible.length, skipped, "ບັນທຶກ ແລະ ສົ່ງ"))) return;

      await runBulkAction(eligible, skipped, "ກຳລັງສົ່ງ", async (row) => {
        const { data, error } = await supabase
          .from("factory_deposit_orders")
          .update({ status: "submitted" })
          .eq("id", row.id)
          .eq("status", "draft")
          .select("id")
          .maybeSingle();
        if (error) throw new Error(workflowErrorMessage(error));
        if (!data) throw new Error("ໃບມັດຈຳຖືກປ່ຽນສະຖານະ ຫຼື ບໍ່ມີສິດແກ້ໄຂ ກະລຸນາໂຫຼດໃໝ່");
        await insertHistory(row.id, "update", "submit deposit order", row.status, "submitted");
        await syncProductionQueue(row.id, "submitted");
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "ບັນທຶກ ແລະ ສົ່ງບໍ່ສຳເລັດ"));
    } finally {
      setBulkProgress(null);
    }
  };

  const handleBulkConvert = async () => {
    if (!canConvertAsViewer) return toast.error("ທ່ານບໍ່ມີສິດບັນທຶກເປັນອໍເດີ");
    setBulkProgress("ກຳລັງກວດຂໍ້ມູນ...");
    try {
      const selectedRows = await fetchSelectedRows();
      const eligible: DepositRow[] = [];
      const skipped: BulkSkip[] = [];
      selectedRows.forEach((row) => {
        if (row.status !== "approved") skipped.push({ row, reason: row.status === "converted" ? "ບັນທຶກເປັນອໍເດີແລ້ວ" : "ກະລຸນາອະນຸມັດກ່ອນ" });
        else if (row.order_id) skipped.push({ row, reason: "ລາຍການນີ້ຖືກບັນທຶກເປັນອໍເດີແລ້ວ" });
        else if (!row.order_code?.trim()) skipped.push({ row, reason: "ບໍ່ພົບລະຫັດອໍເດີ" });
        else eligible.push(row);
      });
      setBulkProgress(null);
      if (!(await confirmBulk("ຢືນຢັນບັນທຶກເປັນອໍເດີ?", eligible.length, skipped, "ບັນທຶກເປັນອໍເດີ"))) return;

      // One choice covers every row missing a category, instead of one dialog per row.
      const missingCategoryCount = eligible.filter((row) => !normalizeOrderWorkCategory(row.work_category)).length;
      let fallbackCategory: OrderWorkCategory | null = null;
      if (missingCategoryCount > 0) {
        fallbackCategory = await confirmOrderWorkCategory(`${missingCategoryCount} ລາຍການຍັງບໍ່ມີປະເພດງານ`);
        if (!fallbackCategory) return;
      }

      await runBulkAction(eligible, skipped, "ກຳລັງບັນທຶກ", async (row) => {
        const workCategory = normalizeOrderWorkCategory(row.work_category) || fallbackCategory;
        if (!workCategory) throw new Error("ກະລຸນາເລືອກປະເພດງານ");
        await convertDepositRow(row, workCategory);
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "ບັນທຶກເປັນອໍເດີບໍ່ສຳເລັດ"));
    } finally {
      setBulkProgress(null);
    }
  };

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc.amount += Number(row.net_total) || 0;
        if (row.status === "submitted") acc.submitted += 1;
        if (row.status === "approved") acc.approved += 1;
        if (row.status === "converted") acc.converted += 1;
        return acc;
      },
      { total: 0, amount: 0, submitted: 0, approved: 0, converted: 0 }
    );
  }, [filteredRows]);
  const fabricsById = useMemo(() => new Map(fabrics.map((fabric) => [fabric.id, fabric])), [fabrics]);

  const previewItems = useMemo(() => parseProductionPreviewItems(previewRow?.production_items), [previewRow]);
  const previewTotalProductionQty = useMemo(
    () => previewItems.reduce((sum, item) => sum + PRODUCTION_SIZE_FIELDS.reduce((itemSum, field) => itemSum + (Number(item.sizes[field.key]) || 0), 0), 0),
    [previewItems]
  );
  const previewPriorityText =
    previewRow?.production_priority === "urgent"
      ? `ຕ້ອງການເຄື່ອງດ່ວນ! ກຳນົດສົ່ງບໍ່ເກີນວັນທີ ${previewRow.urgent_due_date || "../../...."}`
      : "ງານປົກກະຕິ";

  const insertHistory = async (depositOrderId: string, action: string, detail: string, fromStatus: string, toStatus: string) => {
    await supabase.from("factory_deposit_order_history").insert({
      deposit_order_id: depositOrderId,
      action,
      detail,
      from_status: fromStatus,
      to_status: toStatus,
      action_by_user_id: viewerUserId,
    });
  };

  const syncProductionQueue = async (depositOrderId: string, nextStatus: FactoryDepositOrderStatus) => {
    // Database triggers enqueue agent submissions; agents cannot run a global queue sync.
    if (viewerRole === "agent") return;
    if (nextStatus === "draft" || nextStatus === "cancelled") {
      await supabase.rpc("sync_factory_production_queue_entries", {
        p_actor_user_id: viewerUserId,
      });
      return;
    }

    await supabase.rpc("upsert_factory_production_queue_entry", {
      p_deposit_order_id: depositOrderId,
      p_actor_user_id: viewerUserId,
    });
  };

  const confirmAction = async ({
    icon = "question",
    title,
    text,
    confirmButtonText,
    cancelToast,
  }: {
    icon?: "question" | "warning";
    title: string;
    text: string;
    confirmButtonText: string;
    cancelToast: string;
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

  const handleApprove = async (row: DepositRow) => {
    if (!viewerRole || !canApproveFactoryDepositOrder(viewerRole)) return toast.error("ທ່ານບໍ່ມີສິດອະນຸມັດ");
    if (row.status !== "submitted") return toast.error("ອະນຸມັດໄດ້ສະເພາະລາຍການທີ່ສົ່ງແລ້ວ");

    const confirmed = await confirmAction({
      title: "ຢືນຢັນອະນຸມັດ?",
      text: `${row.deposit_no} / ${row.order_code || "-"}`,
      confirmButtonText: "ຢືນຢັນ",
      cancelToast: "ຍົກເລີກການອະນຸມັດແລ້ວ",
    });
    if (!confirmed) return;

    setWorkingId(row.id);
    try {
      const { error } = await supabase
        .from("factory_deposit_orders")
        .update({ status: "approved", approved_at: new Date().toISOString(), approved_by_user_id: viewerUserId })
        .eq("id", row.id);
      if (error) throw error;

      await insertHistory(row.id, "approve", "approve deposit order", row.status, "approved");
      await syncProductionQueue(row.id, "approved");
      toast.success("ອະນຸມັດໃບມັດຈຳແລ້ວ");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ອະນຸມັດບໍ່ສຳເລັດ");
    } finally {
      setWorkingId(null);
    }
  };

  const handleDelete = async (row: DepositRow) => {
    if (!viewerRole || !canDeleteFactoryDepositOrder(viewerRole)) return toast.error("ທ່ານບໍ່ມີສິດລົບ");

    const confirmed = await confirmAction({
      icon: "warning",
      title: "ຢືນຢັນລົບໃບມັດຈຳ?",
      text: `${row.deposit_no} / ${row.order_code || "-"}`,
      confirmButtonText: "ລົບ",
      cancelToast: "ຍົກເລີກການລົບແລ້ວ",
    });
    if (!confirmed) return;

    setWorkingId(row.id);
    try {
      const { error } = await supabase.from("factory_deposit_orders").delete().eq("id", row.id);
      if (error) throw error;

      toast.success("ລົບໃບມັດຈຳແລ້ວ");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ລົບບໍ່ສຳເລັດ");
    } finally {
      setWorkingId(null);
    }
  };

  const convertDepositRow = async (row: DepositRow, workCategory: OrderWorkCategory) => {
    const orderCode = row.order_code?.trim();
    if (!orderCode) throw new Error("ບໍ່ພົບລະຫັດອໍເດີ");

    let createdOrderId: string | null = null;
    try {
      const pantsItems = parsePantsDraftItems(row.pants_items);
      const pantsFactoryCostTotal = pantsItems.reduce((sum, item) => sum + Math.max(0, Number(item.factoryCost) || 0), 0);
      const shirtTotal =
        (Math.max(0, Number(row.short_qty) || 0) * Math.max(0, Number(row.fabric_short_price) || 0)) +
        (Math.max(0, Number(row.long_qty) || 0) * Math.max(0, Number(row.fabric_long_price) || 0));
      const plusSizeTotal =
        Math.max(0, Number(row.qty_3xl) || 0) * 20000 +
        Math.max(0, Number(row.qty_4xl) || 0) * 25000 +
        Math.max(0, Number(row.qty_5xl) || 0) * 35000 +
        Math.max(0, Number(row.qty_6xl) || 0) * 35000;

      const orderPayload = {
        ...(row.agent_user_id ? { source_deposit_order_id: row.id } : {}),
        order_code: orderCode,
        order_date: row.order_date || row.deposit_date,
        work_category: workCategory,
        customer_phone: row.customer_phone?.trim() || null,
        customer_whatsapp: row.customer_whatsapp?.trim() || null,
        factory_bill_code: row.factory_bill_code?.trim() || null,
        admin_user_id: row.admin_user_id || null,
        graphic_user_id: row.graphic_user_id || null,
        fabric_id: row.fabric_id,
        fabric_name: row.fabric_name,
        fabric_short_price: Number(row.fabric_short_price) || 0,
        fabric_long_price: Number(row.fabric_long_price) || 0,
        short_qty: Number(row.short_qty) || 0,
        long_qty: Number(row.long_qty) || 0,
        free_qty: Number(row.free_qty) || 0,
        qty_3xl: Number(row.qty_3xl) || 0,
        qty_4xl: Number(row.qty_4xl) || 0,
        qty_5xl: Number(row.qty_5xl) || 0,
        qty_6xl: Number(row.qty_6xl) || 0,
        collar_type: row.collar_type || "none",
        collar_label: row.collar_label,
        collar_unit_price: row.collar_unit_price,
        work_category_label: row.work_category_label,
        collar_qty: Math.max(0, Number(row.collar_qty) || 0),
        sleeve_charge_qty: Math.max(0, Number(row.sleeve_charge_qty) || 0),
        size_upcharge: 20000,
        extra_charge: Number(row.extra_charge) || 0,
        design_deposit: Number(row.design_deposit) || 0,
        initial_deposit: Number(row.initial_deposit) || 0,
        factory_cost: Number(row.factory_cost) || 0,
        gross_total: Number(row.gross_total) || 0,
        net_total: Number(row.net_total) || 0,
        balance: Number(row.balance) || 0,
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
        Math.max(0, Number(row.short_qty) || 0) > 0 ||
        Math.max(0, Number(row.long_qty) || 0) > 0 ||
        Math.max(0, Number(row.free_qty) || 0) > 0 ||
        Math.max(0, Number(row.qty_3xl) || 0) > 0 ||
        Math.max(0, Number(row.qty_4xl) || 0) > 0 ||
        Math.max(0, Number(row.qty_5xl) || 0) > 0 ||
        Math.max(0, Number(row.qty_6xl) || 0) > 0;
      const hasPantsLine = pantsItems.some((item) => getPantsTotalQty(item) > 0);

      const itemPayloads = [
        ...(hasShirtLine
          ? [
              buildShirtOrderItemPayload({
                orderId,
                lineNo: 1,
                fabric: {
                  id: row.fabric_id || "",
                  name: row.fabric_name || "",
                  shortPrice: Number(row.fabric_short_price) || 0,
                  longPrice: Number(row.fabric_long_price) || 0,
                },
                shortQty: Number(row.short_qty) || 0,
                longQty: Number(row.long_qty) || 0,
                freeQty: Number(row.free_qty) || 0,
                qty3XL: Number(row.qty_3xl) || 0,
                qty4XL: Number(row.qty_4xl) || 0,
                qty5XL: Number(row.qty_5xl) || 0,
                qty6XL: Number(row.qty_6xl) || 0,
                grossTotal: shirtTotal + plusSizeTotal,
                netTotal: shirtTotal + plusSizeTotal,
                factoryCostTotal: Math.max(0, (Math.max(0, Number(row.factory_cost) || 0) - pantsFactoryCostTotal)),
              }),
            ]
          : []),
        ...pantsItems.map((item, index) =>
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

      const { data: updatedDeposit, error: updateDepositError } = await supabase
        .from("factory_deposit_orders")
        .update({
          status: "converted",
          order_id: orderId,
          converted_at: new Date().toISOString(),
          converted_by_user_id: viewerUserId,
        })
        .eq("id", row.id)
        .eq("status", "approved")
        .select("id")
        .maybeSingle();
      if (updateDepositError) throw new Error(`ອັບເດດສະຖານະໃບມັດຈຳບໍ່ສຳເລັດ: ${updateDepositError.message}`);
      if (!updatedDeposit) throw new Error("ໃບມັດຈຳຖືກປ່ຽນສະຖານະ ຫຼື ບໍ່ມີສິດແກ້ໄຂ ກະລຸນາໂຫຼດໃໝ່");

      await syncProductionQueue(row.id, "converted");
      await insertHistory(row.id, "convert_to_order", `convert to order ${row.order_code}`, row.status, "converted");
    } catch (error) {
      if (createdOrderId) {
        await supabase.from("orders").delete().eq("id", createdOrderId);
      }
      throw error;
    }
  };

  const handleConvert = async (row: DepositRow) => {
    if (!viewerRole || !canConvertFactoryDepositOrder(viewerRole)) return toast.error("ທ່ານບໍ່ມີສິດບັນທຶກເປັນອໍເດີ");
    if (row.status !== "approved") return toast.error("ກະລຸນາອະນຸມັດກ່ອນ");
    if (row.order_id) return toast.error("ລາຍການນີ້ຖືກບັນທຶກເປັນອໍເດີແລ້ວ");
    if (!row.order_code?.trim()) return toast.error("ບໍ່ພົບລະຫັດອໍເດີ");

    const workCategory = normalizeOrderWorkCategory(row.work_category) || await confirmOrderWorkCategory(`${row.deposit_no} -> ${row.order_code}`);
    if (!workCategory) return;

    setWorkingId(row.id);
    try {
      await convertDepositRow(row, workCategory);
      toast.success("ບັນທຶກເປັນອໍເດີແລ້ວ");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, "ບັນທຶກເປັນອໍເດີບໍ່ສຳເລັດ"));
    } finally {
      setWorkingId(null);
    }
  };

  const handleCancelConvert = async (row: DepositRow) => {
    if (!viewerRole || !canConvertFactoryDepositOrder(viewerRole)) return toast.error("ທ່ານບໍ່ມີສິດຍົກເລີກການບັນທຶກອໍເດີ້");
    if (row.status !== "converted") return toast.error("ຍົກເລີກໄດ້ສະເພາະລາຍການທີ່ບັນທຶກເປັນອໍເດີແລ້ວ");

    const confirmed = await confirmAction({
      icon: "warning",
      title: "ຢືນຢັນຍົກເລີກການບັນທຶກອໍເດີ້?",
      text: `${row.order_code || row.deposit_no} ຈະຖືກຖອນກັບໄປສະຖານະອະນຸມັດ`,
      confirmButtonText: "ຍົກເລີກການບັນທຶກອໍເດີ້",
      cancelToast: "ຍົກເລີກການຖອນອໍເດີ້ແລ້ວ",
    });
    if (!confirmed) return;

    setWorkingId(row.id);
    try {
      if (row.order_id) {
        const { error: deleteOrderError } = await supabase.from("orders").delete().eq("id", row.order_id);
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
        .eq("id", row.id);
      if (updateDepositError) throw updateDepositError;

      await insertHistory(row.id, "cancel_convert_to_order", `cancel order ${row.order_code || row.deposit_no}`, row.status, "approved");
      toast.success("ຍົກເລີກການບັນທຶກອໍເດີ້ແລ້ວ");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ຍົກເລີກການບັນທຶກອໍເດີ້ບໍ່ສຳເລັດ");
    } finally {
      setWorkingId(null);
    }
  };

  const handleOpenSlipPreview = async (row: DepositRow) => {
    setSlipPreviewRow(row);
    setSlipPreviewRows([]);
    setSlipPreviewLoading(true);
    try {
      const { data, error } = await supabase
        .from("factory_deposit_order_slips")
        .select("id,deposit_order_id,file_name,file_path,file_url,note,uploaded_at")
        .eq("deposit_order_id", row.id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;

      const slips = (data ?? []) as DepositSlipRow[];
      if (slips.length > 0) {
        setSlipPreviewRows(slips);
      } else if (row.transfer_slip_url || row.transfer_slip_path) {
        setSlipPreviewRows([
          {
            id: `${row.id}-fallback-slip`,
            deposit_order_id: row.id,
            file_name: row.transfer_slip_path?.split("/").pop() || "transfer-slip",
            file_path: row.transfer_slip_path || "",
            file_url: row.transfer_slip_url || null,
            note: null,
            uploaded_at: row.deposit_date,
          },
        ]);
      } else {
        setSlipPreviewRows([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ໂຫຼດສະລິບບໍ່ສຳເລັດ");
      setSlipPreviewRow(null);
      setSlipPreviewRows([]);
    } finally {
      setSlipPreviewLoading(false);
    }
  };

  const handleOpenQuotationPreview = async (row: DepositRow) => {
    const quotationDraftId = row.quotation_draft_id?.trim();
    if (!quotationDraftId) {
      toast.error("ບໍ່ພົບໃບປະເມີນລາຄາ");
      return;
    }

    setQuotationPreviewRow(row);
    setQuotationPreviewDraft(null);
    setQuotationPreviewError(null);
    setQuotationPreviewLoading(true);

    try {
      const draft = await getQuotationDraftById(quotationDraftId);
      if (!draft) throw new Error("ບໍ່ພົບໃບປະເມີນລາຄາ");
      setQuotationPreviewDraft(draft);
    } catch (error) {
      setQuotationPreviewError(getErrorMessage(error, "ໂຫຼດໃບປະເມີນລາຄາບໍ່ສຳເລັດ"));
    } finally {
      setQuotationPreviewLoading(false);
    }
  };

  const handleExportCsv = (row: DepositRow) => {
    setExportingId(row.id);
    try {
      const csvRows = buildProductionCsvRows(row);
      if (csvRows.length === 0) {
        toast.error("ບໍ່ພົບຂໍ້ມູນໄຊສ໌ / ຊື່ / ເບີ ສຳລັບ export");
        return;
      }

      downloadCsvFile(buildProductionCsvFileName(row), csvRows);
      toast.success("Export CSV ສຳເລັດ");
    } catch (error) {
      toast.error(getErrorMessage(error, "Export CSV ບໍ່ສຳເລັດ"));
    } finally {
      setExportingId(null);
    }
  };

  const buildRowMenuItems = (row: DepositRow): RowActionMenuItem[] => {
    const viewOnly = viewerRole === "staff" && row.created_by_user_id !== viewerUserId;
    const canCancelConvert = !!viewerRole && canConvertFactoryDepositOrder(viewerRole) && row.status === "converted";
    const canDelete = !!viewerRole && canDeleteFactoryDepositOrder(viewerRole);
    const busy = workingId === row.id;
    return [
      { key: "sheet", label: "ເບິ່ງໃບສັ່ງຜະລິດ", icon: <Eye size={14} />, onSelect: () => setPreviewRow(row) },
      { key: "quotation", label: "ເບິ່ງໃບປະເມີນລາຄາ", icon: <FileText size={14} />, disabled: !row.quotation_draft_id?.trim(), onSelect: () => void handleOpenQuotationPreview(row) },
      {
        key: "edit",
        label: viewOnly ? "ເບິ່ງລາຍລະອຽດ" : "ແກ້ໄຂ",
        icon: viewOnly ? <Eye size={14} /> : <PencilLine size={14} />,
        href: `/factory-deposit-orders/new?id=${row.id}`,
      },
      ...(canCancelConvert
        ? [{ key: "cancel-convert", label: "ຍົກເລີກການບັນທຶກອໍເດີ້", icon: <Undo2 size={14} />, danger: true, separatorBefore: true, disabled: busy, onSelect: () => void handleCancelConvert(row) }]
        : []),
      ...(canDelete
        ? [{ key: "delete", label: "ລົບ", icon: <Trash2 size={14} />, danger: true, separatorBefore: !canCancelConvert, disabled: busy, onSelect: () => void handleDelete(row) }]
        : []),
    ];
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">ລາຍການໃບມັດຈຳສັ່ງຜະລິດ</h1>
          <div className="mt-2 text-sm font-medium text-slate-500">ລວມໃບມັດຈຳຂອງແອັດມິນທຸກຄົນ ແລະ ອະນຸມັດ ຫຼື ບັນທຶກເປັນອໍເດີໄດ້ຈາກໜ້ານີ້</div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            ໂຫຼດໃໝ່
          </button>
          <Link href="/factory-deposit-orders/new" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700">
            <FilePlus2 size={16} />
            ສ້າງໃບມັດຈຳ
          </Link>
        </div>
      </div>

      {err && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 print:hidden">ຂໍ້ຜິດພາດ: {err}</div>}

      <div className="grid gap-4 md:grid-cols-4 print:hidden">
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ທັງໝົດ</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{summary.total.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-sky-100 bg-sky-50 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-sky-700">ສົ່ງແລ້ວ</div>
          <div className="mt-2 text-2xl font-black text-sky-900">{summary.submitted.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">ອະນຸມັດແລ້ວ</div>
          <div className="mt-2 text-2xl font-black text-emerald-900">{summary.approved.toLocaleString()}</div>
        </div>
        <div className="rounded-3xl border border-violet-100 bg-violet-50 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-violet-700">ບັນທຶກເປັນອໍເດີແລ້ວ</div>
          <div className="mt-2 text-2xl font-black text-violet-900">{summary.converted.toLocaleString()}</div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm print:hidden">
        <div className="mb-4 grid gap-3 md:grid-cols-[220px,1fr,180px]">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as ListFilter);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="all">ສະຖານະທັງໝົດ</option>
            <optgroup label="ສະຖານະເອກະສານ">
              <option value="draft">ຮ່າງ</option>
              <option value="submitted">ສົ່ງແລ້ວ</option>
              <option value="approved">ອະນຸມັດແລ້ວ</option>
              <option value="converted">ບັນທຶກເປັນອໍເດີແລ້ວ</option>
            </optgroup>
            <optgroup label="ສະຖານະການພິມ">
              <option value="print:done" disabled={!printTrackingReady}>ພິມສຳເລັດ</option>
              <option value="print:pending" disabled={!printTrackingReady}>ຍັງບໍ່ທັນພິມ</option>
            </optgroup>
          </select>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="ຄົ້ນຫາເລກທີ່ໃບມັດຈຳ / ລະຫັດອໍເດີ / ລູກຄ້າ / ລະຫັດໂຮງງານ"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
          />
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700">ຍອດລວມ {summary.amount.toLocaleString()}</div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="w-10 p-3 text-center">
                  <input
                    type="checkbox"
                    aria-label="ເລືອກທຸກລາຍການໃນໜ້ານີ້"
                    checked={pageRowsAllSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = pageRowsSomeSelected && !pageRowsAllSelected;
                    }}
                    onChange={(event) => setRowsSelected(rows.map((row) => row.id), event.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-emerald-600"
                  />
                </th>
                <th className="p-3 text-left text-[11px] font-black uppercase">ເອກະສານ</th>
                <th className="p-3 text-left text-[11px] font-black uppercase">ລູກຄ້າ</th>
                <th className="p-3 text-left text-[11px] font-black uppercase">ລາຍການ</th>
                <th className="p-3 text-right text-[11px] font-black uppercase">ຍອດການເງິນ</th>
                <th className="p-3 text-center text-[11px] font-black uppercase">ສະຖານະ</th>
                <th className="p-3 text-center text-[11px] font-black uppercase">ສະຖານະການພິມ</th>
                <th className="p-3 text-right text-[11px] font-black uppercase">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tableLoading ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center font-medium text-slate-400">
                    ກຳລັງໂຫຼດ...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center font-medium text-slate-400">
                    ຍັງບໍ່ມີລາຍການ
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className={selectedIds.has(row.id) ? "bg-emerald-50/50" : "hover:bg-slate-50/70"}>
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`ເລືອກ ${getRowLabel(row)}`}
                        checked={selectedIds.has(row.id)}
                        onChange={(event) => setRowsSelected([row.id], event.target.checked)}
                        className="h-4 w-4 cursor-pointer accent-emerald-600"
                      />
                    </td>
                    <td className="p-3">
                      <div className="whitespace-nowrap font-black text-slate-900">{row.order_code?.trim() || getPrimaryDocumentCode(row)}</div>
                      <div className="text-xs font-medium text-slate-500">{getSecondaryDocumentCode(row) || "-"}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{row.customer_name || "-"}</div>
                      <div className="text-xs font-medium text-slate-500">{row.customer_phone || "-"}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{row.fabric_name || "-"}</div>
                      <div className="text-xs font-medium text-slate-500">ໂຮງງານ: {row.factory_bill_code || "-"}</div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="font-black text-emerald-700">{Number(row.net_total).toLocaleString()}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500">
                        ຫັກຄ່າແບບ: <span className="text-slate-700">{Number(row.design_deposit).toLocaleString()}</span>
                      </div>
                      <div className="mt-1 whitespace-nowrap text-xs font-bold text-slate-500">
                        ມັດຈຳສັ່ງຜະລິດ: <span className="text-slate-700">{Number(row.initial_deposit).toLocaleString()}</span>
                      </div>
                      <div className="mt-1 whitespace-nowrap text-xs font-bold text-amber-700">
                        ຍອດຄ້າງຈາກລູກຄ້າ: <span>{Number(row.balance).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${FACTORY_DEPOSIT_ORDER_STATUS_STYLES[row.status]}`}>
                        {FACTORY_DEPOSIT_ORDER_STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {(() => {
                        if (!printTrackingReady) return <span title={PRINT_MIGRATION_MESSAGE} className="text-xs font-bold text-slate-400">-</span>;
                        const confirmation = printConfirmations.get(row.id);
                        return confirmation ? (
                          <span
                            title={`${userNamesById.get(confirmation.confirmed_by_user_id) || "-"} • ${new Date(confirmation.confirmed_at).toLocaleString("en-GB")}`}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700"
                          >
                            <CheckCircle2 size={12} />
                            ພິມສຳເລັດ
                          </span>
                        ) : (
                          <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">ຍັງບໍ່ທັນພິມ</span>
                        );
                      })()}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col items-end gap-1.5">
                        {viewerRole && canConvertFactoryDepositOrder(viewerRole) && row.status === "approved" && (
                          <button onClick={() => handleConvert(row)} disabled={workingId === row.id} className="h-10 whitespace-nowrap rounded-lg bg-violet-50 px-3 text-xs font-black text-violet-700 transition hover:bg-violet-100 disabled:opacity-50">
                            {workingId === row.id ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກເປັນອໍເດີ"}
                          </button>
                        )}
                        <div className="flex items-center justify-end gap-1.5">
                          {viewerRole && canApproveFactoryDepositOrder(viewerRole) && row.status === "submitted" && (
                            <button onClick={() => handleApprove(row)} disabled={workingId === row.id} className="mr-1 h-10 whitespace-nowrap rounded-lg bg-emerald-50 px-3 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
                              {workingId === row.id ? "ກຳລັງອະນຸມັດ..." : "ອະນຸມັດ"}
                            </button>
                          )}
                          <button
                            type="button"
                            title="ດາວໂຫຼດ PDF"
                            aria-label={`ດາວໂຫຼດ PDF ${getRowLabel(row)}`}
                            onClick={() => setSheetJob({ rows: [row], action: "pdf" })}
                            disabled={bulkBusy}
                            className={`${ROW_ICON_BUTTON_CLASS} text-rose-700 hover:bg-rose-50 focus-visible:ring-rose-400`}
                          >
                            <FileDown size={20} className={documentJobRunning && sheetJob?.rows[0]?.id === row.id ? "animate-pulse" : ""} />
                            <span className={ROW_ICON_CAPTION_CLASS}>PDF</span>
                          </button>
                          <button
                            type="button"
                            title="ພິມໃບສັ່ງຜະລິດ"
                            aria-label={`ພິມໃບສັ່ງຜະລິດ ${getRowLabel(row)}`}
                            onClick={() => setSheetJob({ rows: [row], action: "print" })}
                            disabled={bulkBusy}
                            className={`${ROW_ICON_BUTTON_CLASS} text-sky-700 hover:bg-sky-50 focus-visible:ring-sky-400`}
                          >
                            <Printer size={20} />
                            <span className={ROW_ICON_CAPTION_CLASS}>ພິມ</span>
                          </button>
                          <button
                            type="button"
                            title="Export CSV"
                            aria-label={`Export CSV ${getRowLabel(row)}`}
                            onClick={() => handleExportCsv(row)}
                            disabled={exportingId === row.id}
                            className={`${ROW_ICON_BUTTON_CLASS} text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-400`}
                          >
                            <FileSpreadsheet size={20} />
                            <span className={ROW_ICON_CAPTION_CLASS}>CSV</span>
                          </button>
                          <button
                            type="button"
                            title="ເບິ່ງສະລິບ"
                            aria-label={`ເບິ່ງສະລິບ ${getRowLabel(row)}`}
                            onClick={() => void handleOpenSlipPreview(row)}
                            className={`${ROW_ICON_BUTTON_CLASS} text-amber-700 hover:bg-amber-50 focus-visible:ring-amber-400`}
                          >
                            <ReceiptText size={20} />
                            <span className={ROW_ICON_CAPTION_CLASS}>ສະລິບ</span>
                          </button>
                          <span className="ml-1">
                            <RowActionMenu items={buildRowMenuItems(row)} />
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-bold text-slate-600">
          <div role="status">
            ສະແດງ {filteredRows.length === 0 ? 0 : pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredRows.length)} ຈາກ {filteredRows.length.toLocaleString()} ລາຍການ
          </div>
          <nav aria-label="ເລືອກໜ້າລາຍການ" className="flex items-center gap-3">
            <button
              type="button"
              aria-label="ໜ້າກ່ອນໜ້າ"
              onClick={() => setPage(currentPage - 1)}
              disabled={tableLoading || currentPage <= 1}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={18} />
            </button>
            <span>ໜ້າ {currentPage} / {totalPages}</span>
            <button
              type="button"
              aria-label="ໜ້າຖັດໄປ"
              onClick={() => setPage(currentPage + 1)}
              disabled={tableLoading || currentPage >= totalPages}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={18} />
            </button>
          </nav>
        </div>

        {selectedIndexRows.length > 0 ? (
          <div role="toolbar" aria-label="ຈັດການລາຍການທີ່ເລືອກ" className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            <div className="flex flex-wrap items-center gap-2 px-2 text-xs font-black text-slate-900">
              <span role="status">ເລືອກແລ້ວ {selectedIndexRows.length.toLocaleString()} ລາຍການ</span>
              {filteredRows.some((row) => !selectedIds.has(row.id)) ? (
                <button type="button" disabled={bulkBusy} onClick={() => setRowsSelected(filteredRows.map((row) => row.id), true)} className="font-black text-emerald-700 hover:underline disabled:opacity-40">
                  ເລືອກທັງໝົດ {filteredRows.length.toLocaleString()}
                </button>
              ) : null}
              <button type="button" aria-label="ຍົກເລີກການເລືອກ" title="ຍົກເລີກການເລືອກ" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())} className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 disabled:opacity-40">
                <X size={14} />
              </button>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {bulkProgress || documentJobRunning ? (
                <span role="status" className="px-2 text-xs font-bold text-slate-500">
                  {bulkProgress || `ກຳລັງສ້າງ PDF ${sheetProgress}/${sheetJob?.rows.length ?? 0}`}
                </span>
              ) : null}
              <button type="button" disabled={bulkBusy} onClick={() => void handleBulkDocument("pdf")} className={BULK_BUTTON_CLASS}>
                <FileDown size={15} />
                ດາວໂຫຼດ
              </button>
              <button type="button" disabled={bulkBusy} onClick={() => void handleBulkDocument("print")} className={BULK_BUTTON_CLASS}>
                <Printer size={15} />
                ພິມ
              </button>
              <button
                type="button"
                disabled={bulkBusy || printUnconfirmedCount === 0}
                onClick={() => void handleBulkConfirmPrinted()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCircle2 size={15} />
                ຢືນຢັນພິມສຳເລັດ{printUnconfirmedCount > 0 ? ` (${printUnconfirmedCount})` : ""}
              </button>
              <button type="button" disabled={bulkBusy || submittableCount === 0} onClick={() => void handleBulkSubmit()} className={BULK_BUTTON_CLASS}>
                <Send size={15} />
                ບັນທຶກ ແລະ ສົ່ງ{submittableCount > 0 ? ` (${submittableCount})` : ""}
              </button>
              {canConvertAsViewer ? (
                <button type="button" disabled={bulkBusy || convertibleCount === 0} onClick={() => void handleBulkConvert()} className={BULK_BUTTON_CLASS}>
                  <ClipboardCheck size={15} />
                  ບັນທຶກເປັນອໍເດີ້ທັງໝົດ{convertibleCount > 0 ? ` (${convertibleCount})` : ""}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {sheetJob ? (
        <div ref={sheetShellRef} aria-hidden="true" className="production-sheet-preview-shell fixed left-[-10000px] top-0 w-[760px] bg-white">
          {sheetJob.rows.map((row) => (
            <ProductionSheetA4 key={row.id} {...buildProductionSheetProps(row, userNamesById.get(row.created_by_user_id || "") || "")} />
          ))}
        </div>
      ) : null}

      {previewRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="relative max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl">
            <button
              type="button"
              aria-label="ປິດໃບສັ່ງຜະລິດ"
              onClick={() => setPreviewRow(null)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            >
              <X size={18} />
            </button>

            <div className="mb-4 pr-12">
              <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Production Order Preview</div>
              <div className="mt-2 text-lg font-black text-slate-900">{getPrimaryDocumentCode(previewRow)}</div>
              <div className="mt-1 text-sm font-medium text-slate-500">
                {previewRow.customer_name || "-"} • {previewRow.deposit_date || "-"}
              </div>
            </div>

            <div className="mx-auto max-w-[980px] overflow-hidden rounded-[24px] border border-slate-300 bg-white [font-family:'Noto_Sans_Lao_Looped','Noto_Sans_Lao',Tahoma,Arial,sans-serif]">
              <div className="bg-white p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-slate-700 p-4">
                    <div className="text-[12px] font-black text-slate-700">ຊື່ທີມ:</div>
                    <div className="mt-1 text-[18px] font-black leading-tight text-slate-900">{previewRow.team_name || "-"}</div>
                    <div className="mt-3 text-[15px] font-black text-slate-700">
                      ລະຫັດອໍເດີ້: <span className="font-black text-sky-700">{previewRow.order_code || "-"}</span>
                    </div>
                    <div className="mt-1 text-[15px] font-black text-slate-700">
                      ຜ້າ: <span className="font-bold text-slate-900">{previewRow.fabric_name || "-"}</span>
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-700 p-4">
                    <div className="text-[15px] font-black text-slate-700">
                      ວັນທີ່ສົ່ງຜະລິດ: <span className="font-black text-slate-900">{previewRow.production_sent_date || "-"}</span>
                    </div>
                    <div className="mt-1 text-[15px] font-black text-slate-700">
                      ກຳນົດສົ່ງລູກຄ້າ: <span className="font-black text-slate-900">{previewRow.delivery_date || "-"}</span>
                    </div>
                    <div className="mt-4 text-[12px] font-black text-slate-700">ຈຳນວນທັງໝົດ</div>
                    <div className="mt-1 text-[26px] font-black leading-none text-sky-700">{previewTotalProductionQty.toLocaleString()} ຕົວ</div>
                  </div>
                </div>

                <div
                  className={`mt-3 rounded-md border px-4 py-2.5 text-center text-[13px] font-black shadow-sm ${
                    previewRow.production_priority === "urgent"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-sky-200 bg-sky-50 text-slate-700"
                  }`}
                >
                  <span className="opacity-80">ປະເພດງານ:</span>{" "}
                  <span className={previewRow.production_priority === "urgent" ? "text-red-600" : "text-sky-700"}>{previewPriorityText}</span>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-3">
                  {previewItems.length > 0 ? (
                    previewItems.map((item, index) => {
                      const sleeveLabel = PRODUCTION_SLEEVE_OPTIONS.find((option) => option.value === item.sleeve_type)?.label || "-";
                      const collarLabel = getProductionCollarLabel(item.collar_type, item.collar_label);
                      const filledPlayerRows = getFilledPlayerRows(item);
                      return (
                        <div key={item.client_id} className="flex min-h-0 flex-col">
                          <div className="mb-2 rounded-md border border-slate-700 px-2 py-1.5 text-center text-[11px] font-black text-slate-700">
                            ແບບ {index + 1} • {sleeveLabel} • {collarLabel}
                          </div>
                          <div className="aspect-square overflow-hidden rounded-md border border-slate-700 bg-white">
                            {item.mockup_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.mockup_url} alt={`preview-${index + 1}`} className="h-full w-full object-contain bg-white" />
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
                                <div className="space-y-2 text-[17px]">
                                  {PRODUCTION_SIZE_FIELDS.filter((field) => Number(item.sizes[field.key]) > 0).map((field) => (
                                    <div key={field.key} className="flex items-center justify-between gap-3">
                                      <span className="font-black text-slate-900">{field.label}:</span>
                                      <span className="font-black text-rose-600">{item.sizes[field.key].toLocaleString()}</span>
                                    </div>
                                  ))}
                                  {PRODUCTION_SIZE_FIELDS.every((field) => Number(item.sizes[field.key]) <= 0) ? (
                                    <div className="text-center text-[13px] font-bold text-slate-400">ຍັງບໍ່ມີຈຳນວນໄຊສ໌</div>
                                  ) : null}
                                </div>
                              </>
                            ) : null}

                            {item.player_mode !== "none" && filledPlayerRows.length > 0 ? (
                              <div className="mt-4 border-t border-slate-200 pt-3">
                                <div className="mb-2 text-center text-[12px] font-black text-slate-700">{getPlayerModePreviewTitle(item.player_mode)}</div>
                                <div className="space-y-0.5 text-[10px] leading-tight text-slate-900">
                                  {filledPlayerRows.map((row) => {
                                    const sizeLabel = PRODUCTION_SIZE_FIELDS.find((field) => field.key === row.size)?.label || "-";
                                    const lineParts = [
                                      sizeLabel,
                                      playerModeNeedsName(item.player_mode) ? row.player_name || "-" : null,
                                      playerModeNeedsNumber(item.player_mode) ? row.jersey_number || "-" : null,
                                      row.note ? row.note : null,
                                    ].filter(Boolean);
                                    return (
                                      <div key={row.id} className="truncate font-semibold">
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
                    })
                  ) : (
                    <div className="col-span-4 flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm font-bold text-slate-400">
                      ຍັງບໍ່ມີຂໍ້ມູນໃບສັ່ງຜະລິດ
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {slipPreviewRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setSlipPreviewRow(null);
                setSlipPreviewRows([]);
              }}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            >
              <X size={18} />
            </button>

            <div className="mb-4 pr-12">
              <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Transfer Slip Preview</div>
              <div className="mt-2 text-lg font-black text-slate-900">{getPrimaryDocumentCode(slipPreviewRow)}</div>
              <div className="mt-1 text-sm font-medium text-slate-500">{slipPreviewRow.customer_name || "-"}</div>
            </div>

            {slipPreviewLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center text-sm font-bold text-slate-500">ກຳລັງໂຫຼດສະລິບ...</div>
            ) : slipPreviewRows.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center text-sm font-bold text-slate-400">ບໍ່ພົບສະລິບໂອນເງິນ</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {slipPreviewRows.map((slip) => {
                  const fileName = slip.file_name || slip.file_path.split("/").pop() || "slip";
                  const isImage = isImageFileName(fileName);
                  return (
                    <div key={slip.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                          {new Date(slip.uploaded_at).toLocaleString("en-GB")}
                        </div>
                        {slip.file_url ? (
                          <Link href={slip.file_url} target="_blank" className="inline-flex items-center gap-1 text-xs font-black text-sky-700">
                            <ExternalLink size={13} />
                            ເປີດໄຟລ໌
                          </Link>
                        ) : null}
                      </div>
                      <div className="p-4">
                        <div className="mb-3 truncate text-sm font-black text-slate-900">{fileName}</div>
                        {isImage && slip.file_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={slip.file_url} alt={fileName} className="h-64 w-full rounded-2xl border border-slate-100 object-contain bg-slate-50" />
                        ) : (
                          <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-500">
                            <div className="text-center">
                              {isImage ? <FileImage size={28} className="mx-auto mb-2" /> : <FileText size={28} className="mx-auto mb-2" />}
                              <div className="text-sm font-bold">{isImage ? "ໄຟລ໌ຮູບພາບ" : "ໄຟລ໌ເອກະສານ"}</div>
                            </div>
                          </div>
                        )}
                        {slip.note ? <div className="mt-3 text-sm font-medium text-slate-500">{slip.note}</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {quotationPreviewRow ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => {
            setQuotationPreviewRow(null);
            setQuotationPreviewDraft(null);
            setQuotationPreviewError(null);
          }}
        >
          <div
            className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setQuotationPreviewRow(null);
                setQuotationPreviewDraft(null);
                setQuotationPreviewError(null);
              }}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            >
              <X size={18} />
            </button>

            <div className="mb-4 pr-12">
              <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Quotation Preview A5</div>
              <div className="mt-2 text-lg font-black text-slate-900">
                {quotationPreviewDraft?.quoteNo || quotationPreviewRow.quotation_quote_no || quotationPreviewRow.order_code || quotationPreviewRow.deposit_no}
              </div>
            </div>

            {quotationPreviewLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center text-sm font-bold text-slate-500">
                ກຳລັງໂຫຼດໃບປະເມີນລາຄາ...
              </div>
            ) : quotationPreviewError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm font-bold text-rose-700">
                {quotationPreviewError}
              </div>
            ) : quotationPreviewDraft ? (
              <QuotationA5Preview draft={quotationPreviewDraft} />
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center text-sm font-bold text-slate-400">
                ບໍ່ພົບໃບປະເມີນລາຄາ
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
