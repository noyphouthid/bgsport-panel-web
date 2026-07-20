"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { toJpeg } from "html-to-image";
import { Download, Printer, X } from "lucide-react";
import toast from "react-hot-toast";
import { buildFactoryDesignFallbackUrl, toDisplayMediaUrl } from "@/lib/order-media";
import { getPantsTotalQty, parsePantsDraftItems } from "@/lib/order-items";

type QueueDepositRow = {
  id: string;
  created_by_user_id: string | null;
  deposit_no: string;
  order_code: string | null;
  customer_name: string;
  team_name: string | null;
  fabric_name: string;
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

type QueueEntryRow = {
  id: string;
  order_no: string;
  assigned_by_user_id: string | null;
  planner_user_id: string | null;
  pattern_laid_by_user_id: string | null;
  ready_for_print_by_user_id: string | null;
  sent_to_factory_by_user_id: string | null;
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
};

type ParsedPantsItem = {
  clientId: string;
  mockupUrl: string | null;
  sizes: Record<string, number>;
  playerMode: string | null;
  playerRows: ParsedPlayerRow[];
  totalQty: number;
  notes: string;
};

type SendToFactoryPreviewModalProps = {
  row: QueueEntryRow;
  userNameMap: Map<string, string>;
  viewerUserId: string | null;
  confirming?: boolean;
  initialAction?: "download" | "print" | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
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

function normalizeDeposit(row: QueueEntryRow) {
  if (Array.isArray(row.deposit)) return row.deposit[0] ?? null;
  return row.deposit ?? null;
}

function formatDisplayDate(dateValue: string | null) {
  if (!dateValue) return "-";
  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) return dateValue;
  return `${day}/${month}/${year}`;
}

function getUserDisplayName(userId: string | null, userNameMap: Map<string, string>) {
  if (!userId) return "-";
  return userNameMap.get(userId) || "-";
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
      return {
        id: typeof row.id === "string" ? row.id : `player-row-${index + 1}`,
        size: typeof row.size === "string" ? row.size : "",
        playerName: typeof row.player_name === "string" ? row.player_name.trim() : "",
        jerseyNumber: typeof row.jersey_number === "string" ? row.jersey_number.trim() : "",
        note: typeof row.note === "string" ? row.note.trim() : "",
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
      const playerSizes = buildPlayerSizeMap(playerRows);
      const baseSizes = row.sizes ? toNumberRecord(row.sizes) : {};
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
        playerMode: typeof row.player_mode === "string" ? row.player_mode : "none",
        playerRows,
        sizes,
        totalQty,
      };
    })
    .filter((item) => item.totalQty > 0 || item.mockupUrl || Object.keys(item.sizes).length > 0 || item.playerRows.length > 0);
}

function parsePantsItems(raw: unknown) {
  return parsePantsDraftItems(raw).map((item, index) => ({
    clientId: item.clientId || `pants-${index + 1}`,
    mockupUrl: item.mockupPreviewUrl || item.mockupUrl || null,
    sizes: Object.fromEntries(
      Object.entries(item.sizeBreakdown || {}).map(([key, value]) => [key, Math.max(0, Number(value) || 0)])
    ),
    playerMode: item.playerMode || "none",
    playerRows: parsePlayerRows(item.playerRows),
    totalQty: getPantsTotalQty(item),
    notes: item.notes || "",
  })) as ParsedPantsItem[];
}

function formatRawLabel(value: string | null) {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
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

function getSizeEntries(sizes: Record<string, number>) {
  return Object.entries(sizes)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([size, qty]) => ({
      key: size,
      label: PRODUCTION_SIZE_LABELS[size] || size.toUpperCase(),
      qty: Number(qty) || 0,
    }));
}

function getPlayerPreviewTitle(mode: string | null) {
  if (mode === "name_only") return "ລາຍຊື່";
  if (mode === "number_only") return "ເບີເສື້ອ";
  if (mode === "name_and_number") return "ຊື່ + ເບີເສື້ອ";
  return "ຈຳນວນໄຊສ໌";
}

function getPlayerPreviewTextClass(mode: string | null, compact = false) {
  if (mode === "name_and_number") return compact ? "text-[10px] leading-tight" : "text-[12px] leading-snug";
  return compact ? "text-[10px] leading-tight" : "text-[13px] leading-snug";
}

function getPlayerPreviewLine(mode: string | null, row: ParsedPlayerRow) {
  const sizeLabel = PRODUCTION_SIZE_LABELS[row.size] || row.size.toUpperCase() || "-";
  if (mode === "name_only") return [sizeLabel, row.playerName || "-"].join(" | ");
  if (mode === "number_only") return [sizeLabel, row.jerseyNumber || "-"].join(" | ");
  if (mode === "name_and_number") return [sizeLabel, row.playerName || "-", row.jerseyNumber || "-"].join(" | ");
  return sizeLabel;
}

async function waitForImages(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll("img"));

  await Promise.all(
    images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) return;

      try {
        if ("decode" in image) {
          await image.decode();
          return;
        }
      } catch {
        // fall through to event-based waiting
      }

      await new Promise<void>((resolve) => {
        const done = () => {
          image.removeEventListener("load", done);
          image.removeEventListener("error", done);
          resolve();
        };
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
      });
    })
  );
}

export function SendToFactoryPreviewModal({
  row,
  userNameMap,
  viewerUserId,
  confirming = false,
  initialAction = null,
  onClose,
  onConfirm,
}: SendToFactoryPreviewModalProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const lastAutoActionRef = useRef<"download" | "print" | null>(null);
  const [downloading, setDownloading] = useState(false);
  const deposit = normalizeDeposit(row);

  const productionItems = useMemo(() => parseProductionItems(deposit?.production_items), [deposit?.production_items]);
  const pantsItems = useMemo(() => parsePantsItems(deposit?.pants_items), [deposit?.pants_items]);
  const fallbackImage = deposit ? buildFactoryDesignFallbackUrl(deposit.factory_bill_code) : null;
  const shirtQty = getShirtTotalQty(deposit);
  const pantsQty = pantsItems.reduce((sum, item) => sum + item.totalQty, 0);
  const hemLabels = Array.from(new Set(productionItems.map((item) => getHemLabel(item.hemType)).filter((label) => label !== "-")));
  const productionSheetPreviewCardCount =
    productionItems.reduce((count, item) => count + (item.playerMode === "name_and_number" ? 2 : 1), 0) + pantsItems.length;
  const usesExpandedProductionSheetLayout = productionSheetPreviewCardCount > 4;
  const priorityBannerText =
    deposit?.production_priority === "urgent"
      ? `ຕ້ອງການເຄື່ອງດ່ວນ! ກຳນົດສົ່ງບໍ່ເກີນວັນທີ ${deposit?.urgent_due_date || "../../...."}`
      : "ງານປົກກະຕິ";
  const signatureFields = [
    {
      label: "ຜູ້ອອກໃບສັ່ງຜະລິດ",
      value: getUserDisplayName(deposit?.created_by_user_id || row.assigned_by_user_id || deposit?.admin_user_id || null, userNameMap),
    },
    {
      label: "ຜູ້ວາງ Pattern",
      value: getUserDisplayName(row.pattern_laid_by_user_id || row.planner_user_id, userNameMap),
    },
    {
      label: "ຜູ້ວາງພ້ອມພິມ",
      value: getUserDisplayName(row.ready_for_print_by_user_id || row.planner_user_id, userNameMap),
    },
    {
      label: "ຜູ້ສົ່ງໂຮງງານ",
      value: getUserDisplayName(row.sent_to_factory_by_user_id || viewerUserId, userNameMap),
    },
  ];

  const handleDownload = async () => {
    if (!previewRef.current) return;
    setDownloading(true);
    try {
      await waitForImages(previewRef.current);
      const sheetRect = previewRef.current.getBoundingClientRect();
      const dataUrl = await toJpeg(previewRef.current, {
        cacheBust: true,
        includeQueryParams: true,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width: Math.max(1, Math.ceil(sheetRect.width)),
        height: Math.max(1, Math.ceil(sheetRect.height)),
        canvasWidth: Math.max(1, Math.ceil(sheetRect.width * 2)),
        canvasHeight: Math.max(1, Math.ceil(sheetRect.height * 2)),
        skipAutoScale: true,
        style: {
          margin: "0",
          transform: "none",
          transformOrigin: "top left",
          background: "#ffffff",
        },
      });

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${row.order_no || deposit?.order_code || deposit?.deposit_no || "production-order"}.jpg`;
      link.click();
      toast.success("ດາວໂຫລດໃບສັ່ງຜະລິດສຳເລັດແລ້ວ");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ດາວໂຫລດບໍ່ສຳເລັດ");
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    if (!previewRef.current) return;
    window.print();
  };

  const triggerInitialAction = useEffectEvent(() => {
    if (initialAction === "download") {
      void handleDownload();
      return;
    }
    if (initialAction === "print") {
      handlePrint();
    }
  });

  useEffect(() => {
    if (!initialAction || lastAutoActionRef.current === initialAction) return;
    lastAutoActionRef.current = initialAction;
    triggerInitialAction();
  }, [initialAction]);

  return (
    <div className="factory-production-modal-shell fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-[1120px] rounded-[28px] bg-white shadow-2xl">
        <div className="factory-production-modal-chrome flex flex-col gap-4 border-b border-slate-200 px-5 py-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[14px] font-black uppercase tracking-[0.18em] text-slate-500">Production Order Preview</div>
            <h2 className="mt-2 text-2xl font-extrabold text-slate-900">ກວດກ່ອນຢືນຢັນການສົ່ງໂຮງງານ</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              ກວດສອບໃບສັ່ງຜະລິດ, ລາຍຊື່ຜູ້ຮັບຜິດຊອບ, ແລະ ດາວໂຫລດ/ພິມ ກ່ອນສົ່ງໂຮງງານ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              {downloading ? "ກຳລັງດາວໂຫລດ..." : "Download .jpg"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <Printer size={16} />
              ພິມ
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <X size={16} />
              ປິດ
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-220px)] overflow-y-auto px-5 py-5">
          <div className="factory-production-print-root mx-auto w-full max-w-[860px] rounded-[24px] border border-slate-300 bg-white p-4 shadow-sm">
            <div ref={previewRef} className="[font-family:'Noto_Sans_Lao_Looped','Noto_Sans_Lao',Tahoma,Arial,sans-serif]" data-production-print-sheet="true">
              <div className="factory-production-print-page production-sheet-a4 mx-auto aspect-[210/297] w-full max-w-[760px] overflow-hidden border border-slate-300 bg-white">
                <div className="flex h-full flex-col bg-white p-5">
                  <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-slate-700 p-4">
                    <div className="text-[12px] font-black text-slate-700">ຊື່ທີມ:</div>
                    <div className="mt-1 text-[18px] font-black leading-tight text-slate-900">
                      {deposit?.team_name || deposit?.customer_name || "-"}
                    </div>
                    <div className="mt-3 text-[15px] font-black text-slate-700">
                      ລະຫັດອໍເດີ້: <span className="text-sky-700">{deposit?.order_code || row.order_no || deposit?.deposit_no || "-"}</span>
                    </div>
                    <div className="mt-1 text-[15px] font-black text-slate-700">
                      ຜ້າ: <span className="text-slate-900">{deposit?.fabric_name || "-"}</span>
                    </div>
                    <div className="mt-1 text-[15px] font-black text-slate-700">
                      ຕີນເສື້ອ: <span className="text-slate-900">{hemLabels.join(", ") || "-"}</span>
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-700 p-4">
                    <div className="text-[15px] font-black text-slate-700">
                      ວັນທີ່ສົ່ງຜະລິດ: <span className="text-slate-900">{formatDisplayDate(deposit?.production_sent_date || null)}</span>
                    </div>
                    <div className="mt-1 text-[15px] font-black text-slate-700">
                      ກຳນົດສົ່ງລູກຄ້າ: <span className="text-slate-900">{formatDisplayDate(deposit?.delivery_date || null)}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-md bg-sky-50 px-3 py-2">
                        <div className="text-[11px] font-black text-slate-700">ຈຳນວນເສື້ອ</div>
                        <div className="mt-1 text-[24px] font-black leading-none text-sky-700">{shirtQty.toLocaleString()}</div>
                      </div>
                      <div className="rounded-md bg-indigo-50 px-3 py-2">
                        <div className="text-[11px] font-black text-slate-700">ຈຳນວນໂສ້ງ</div>
                        <div className="mt-1 text-[24px] font-black leading-none text-indigo-700">{pantsQty.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={`mt-3 rounded-md border px-4 py-2.5 text-center text-[13px] font-black shadow-sm ${
                    deposit?.production_priority === "urgent"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-sky-200 bg-sky-50 text-slate-700"
                  }`}
                >
                  <span className="opacity-80">ປະເພດງານ:</span>{" "}
                  <span className={deposit?.production_priority === "urgent" ? "text-red-600" : "text-sky-700"}>{priorityBannerText}</span>
                </div>

                <div className={`mt-4 grid flex-1 gap-3 ${usesExpandedProductionSheetLayout ? "grid-cols-6" : "grid-cols-4"}`}>
                  {productionItems.map((item) => {
                    const sizeEntries = getSizeEntries(item.sizes);
                    const usesWidePreviewCard = item.playerMode === "name_and_number";
                    return (
                      <div key={`shirt-${item.order}`} className={`flex min-h-0 flex-col ${usesWidePreviewCard ? "col-span-2" : ""}`}>
                        <div className={`rounded-md border border-slate-700 text-center font-black text-slate-700 ${usesExpandedProductionSheetLayout ? "mb-1 px-1.5 py-1 text-[9px]" : "mb-2 px-2 py-1.5 text-[11px]"}`}>
                          ແບບ {item.order} • {getSleeveLabel(item.sleeveType)} • {getCollarLabel(item.collarType)} • {getHemLabel(item.hemType)}
                        </div>
                        <div className={`${usesWidePreviewCard ? (usesExpandedProductionSheetLayout ? "h-[122px]" : "h-[176px]") : "aspect-square"} overflow-hidden rounded-md border border-slate-700 bg-white`}>
                          {item.mockupUrl || fallbackImage ? (
                            <img
                              src={item.mockupUrl || fallbackImage || ""}
                              alt={`production-${item.order}`}
                              crossOrigin="anonymous"
                              className="h-full w-full object-contain bg-white"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-center text-[11px] font-bold text-slate-400">ບໍ່ມີຮູບ Mockup</div>
                          )}
                        </div>
                        <div className={`flex-1 rounded-md border border-slate-700 ${usesExpandedProductionSheetLayout ? "mt-2 p-2" : "mt-3 p-3"}`}>
                          {item.playerMode === "none" ? (
                            <>
                              <div className={`text-center font-black text-sky-700 ${usesExpandedProductionSheetLayout ? "mb-1 text-[13px]" : "mb-2 text-[17px]"}`}>ຈຳນວນໄຊສ໌</div>
                              <div className={`space-y-1.5 ${usesExpandedProductionSheetLayout ? "text-[11px] leading-tight" : "text-[18px]"}`}>
                                {sizeEntries.map((entry) => (
                                  <div key={entry.key} className="flex items-center justify-between gap-3">
                                    <span className="font-black text-slate-900">{entry.label}:</span>
                                    <span className="font-black text-rose-600">{entry.qty.toLocaleString()}</span>
                                  </div>
                                ))}
                                {sizeEntries.length === 0 ? (
                                  <div className="text-center text-[13px] font-bold text-slate-400">ຍັງບໍ່ມີຈຳນວນໄຊສ໌</div>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <div>
                              <div className={`text-center font-black text-slate-700 ${usesExpandedProductionSheetLayout ? "mb-1 text-[11px]" : "mb-2 text-[14px]"}`}>
                                {getPlayerPreviewTitle(item.playerMode)}
                              </div>
                              <div className={`space-y-1 text-slate-900 ${getPlayerPreviewTextClass(item.playerMode, usesExpandedProductionSheetLayout)}`}>
                                {item.playerRows.length > 0 ? (
                                  item.playerRows.map((playerRow) => (
                                    <div key={playerRow.id} className={usesExpandedProductionSheetLayout ? "truncate font-bold" : "whitespace-nowrap font-bold"}>
                                      {getPlayerPreviewLine(item.playerMode, playerRow)}
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-center text-[13px] font-bold text-slate-400">ບໍ່ພົບຂໍ້ມູນລາຍຊື່</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {pantsItems.map((item, index) => {
                    const sizeEntries = getSizeEntries(item.sizes);
                    return (
                      <div key={item.clientId} className="flex min-h-0 flex-col">
                        <div className={`rounded-md border border-indigo-300 bg-indigo-50 text-center font-black text-indigo-700 ${usesExpandedProductionSheetLayout ? "mb-1 px-1.5 py-1 text-[9px]" : "mb-2 px-2 py-1.5 text-[11px]"}`}>
                          ໂສ້ງ {index + 1}
                        </div>
                        <div className="aspect-square overflow-hidden rounded-md border border-slate-700 bg-white">
                          {item.mockupUrl ? (
                            <img src={item.mockupUrl} alt={`pants-${index + 1}`} crossOrigin="anonymous" className="h-full w-full object-contain bg-white" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-center text-[11px] font-bold text-slate-400">ບໍ່ມີຮູບ Mockup</div>
                          )}
                        </div>
                        <div className={`flex-1 rounded-md border border-slate-700 ${usesExpandedProductionSheetLayout ? "mt-2 p-2" : "mt-3 p-3"}`}>
                          {item.playerMode === "none" ? (
                            <>
                              <div className={`text-center font-black text-sky-700 ${usesExpandedProductionSheetLayout ? "mb-1 text-[13px]" : "mb-2 text-[17px]"}`}>ຈຳນວນໄຊສ໌</div>
                              <div className={`space-y-1.5 ${usesExpandedProductionSheetLayout ? "text-[11px] leading-tight" : "text-[18px]"}`}>
                                {sizeEntries.map((entry) => (
                                  <div key={`${item.clientId}-${entry.key}`} className="flex items-center justify-between gap-3">
                                    <span className="font-black text-slate-900">{entry.label}:</span>
                                    <span className="font-black text-rose-600">{entry.qty.toLocaleString()}</span>
                                  </div>
                                ))}
                                {sizeEntries.length === 0 ? (
                                  <div className="text-center text-[13px] font-bold text-slate-400">ຍັງບໍ່ມີຈຳນວນໄຊສ໌</div>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                          {item.playerMode !== "none" && item.playerRows.length > 0 ? (
                            <div>
                              <div className={`text-center font-black text-slate-700 ${usesExpandedProductionSheetLayout ? "mb-1 text-[11px]" : "mb-2 text-[14px]"}`}>
                                LIST
                              </div>
                              <div className={`space-y-1 text-slate-900 ${usesExpandedProductionSheetLayout ? "text-[10px] leading-tight" : "text-[13px] leading-snug"}`}>
                                {item.playerRows.map((playerRow) => (
                                  <div key={playerRow.id} className="truncate font-bold">
                                    {getPlayerPreviewLine("number_only", playerRow)}
                                  </div>
                                ))}
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
                  })}
                </div>

                <div className="mt-5 grid grid-cols-4 gap-6 px-8 text-center text-[12px] text-slate-900">
                  {signatureFields.map((field) => (
                    <div key={field.label}>
                      <div className="font-black">{field.label}</div>
                      <div className="mt-1 min-h-[16px] text-[11px] font-bold text-slate-700">{field.value || "\u00A0"}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>

        <div className="factory-production-modal-chrome flex flex-col gap-3 border-t border-slate-200 px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div className="text-sm font-medium text-slate-500">ເມື່ອຢືນຢັນແລ້ວ ລາຍການນີ້ຈະຖືກຍ້າຍໄປຫນ້າ “ສົ່ງໂຮງງານແລ້ວ” ທັນທີ.</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={confirming}
              className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirming ? "ກຳລັງບັນທຶກ..." : "ຢືນຢັນການສົ່ງໂຮງງານ"}
            </button>
          </div>
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
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .factory-production-print-root,
          .factory-production-print-root * {
            visibility: visible !important;
          }

          .factory-production-modal-shell {
            position: static !important;
            inset: auto !important;
            display: block !important;
            overflow: visible !important;
            background: transparent !important;
            padding: 0 !important;
            backdrop-filter: none !important;
          }

          .factory-production-modal-shell > div {
            max-width: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: transparent !important;
          }

          .factory-production-modal-chrome {
            display: none !important;
          }

          .factory-production-print-root {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }

          .factory-production-print-page {
            width: 100% !important;
            max-width: none !important;
            aspect-ratio: auto !important;
            min-height: calc(297mm - 16mm) !important;
            margin: 0 !important;
            border: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
