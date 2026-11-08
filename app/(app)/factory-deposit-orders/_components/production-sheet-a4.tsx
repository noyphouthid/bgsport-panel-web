"use client";

import JsBarcode from "jsbarcode";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { normalizeFactoryBarcode } from "@/lib/factory-receipt-barcode";
import { getProductionCollarLabel } from "@/lib/production-collars";
import {
  PRODUCTION_SIZE_FIELDS,
  PRODUCTION_SLEEVE_OPTIONS,
  getFilledPlayerRows,
  getPantsProductionItemSizeMap,
  getPlayerModePreviewTitle,
  getPlayerPreviewTextClass,
  getProductionHemLabel,
  getProductionItemSizeMap,
  playerModeNeedsName,
  playerModeNeedsNumber,
  type PantsProductionItem,
  type ProductionItem,
  type ProductionPriority,
} from "@/lib/production-sheet";

export type ProductionSheetA4Props = {
  teamName: string;
  orderCode: string;
  workCategoryLabel: string;
  fabricName: string;
  productionSentDate: string;
  customerDeliveryDate: string;
  shirtQty: number;
  pantsQty: number;
  productionPriority: ProductionPriority;
  urgentDueDate: string;
  items: ProductionItem[];
  pantsItems: PantsProductionItem[];
  signatureFields: Array<{ label: string; name: string }>;
  // Shown on agent deposits so the factory and shipping can tell whose job it is.
  agentName?: string;
};

// Code 128 of the shop order code, scanned on /factory-receipts when goods come back.
function OrderCodeBarcode({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        displayValue: false,
        width: 1.2,
        height: 40,
        margin: 6,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      svgRef.current.innerHTML = "";
    }
  }, [value]);

  return (
    <div className="shrink-0 text-center" data-order-code-barcode>
      <svg ref={svgRef} className="block" aria-label={`Barcode ${value}`} />
      <div className="font-mono text-[10px] font-bold leading-none tracking-wider text-slate-900">{value}</div>
    </div>
  );
}

type SheetCard = { key: string; span: number; node: ReactNode };

// Mirrors CSS grid auto-placement: a card that does not fit the rest of a row starts the next row.
function packCardsIntoRows(cards: SheetCard[], columns: number) {
  const rows: SheetCard[][] = [];
  let used = columns;
  for (const card of cards) {
    const span = Math.min(card.span, columns);
    if (used + span > columns) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(card);
    used += span;
  }
  return rows;
}

type PageSplit = { key: string; rowCounts: number[] };

// A split measured for different content or width no longer applies, so start from one page again.
function resolveRowCounts(pageSplit: PageSplit | null, layoutKey: string, rowCount: number) {
  return pageSplit?.key === layoutKey ? pageSplit.rowCounts : [rowCount];
}

export function ProductionSheetA4({
  teamName,
  orderCode,
  workCategoryLabel,
  fabricName,
  productionSentDate,
  customerDeliveryDate,
  shirtQty,
  pantsQty,
  productionPriority,
  urgentDueDate,
  items,
  pantsItems,
  signatureFields,
  agentName,
}: ProductionSheetA4Props) {
  const usesExpandedProductionSheetLayout = items.length + pantsItems.length > 4;
  const priorityBannerText =
    productionPriority === "urgent"
      ? `ຕ້ອງການເຄື່ອງດ່ວນ! ກຳນົດສົ່ງບໍ່ເກີນວັນທີ ${urgentDueDate || "../../...."}`
      : "ງານປົກກະຕິ";

  const shirtCards: SheetCard[] = items.map((item, index) => {
    const usesWidePreviewCard = item.player_mode === "name_and_number";
    const sleeveLabel = PRODUCTION_SLEEVE_OPTIONS.find((option) => option.value === item.sleeve_type)?.label || "-";
    const collarLabel = getProductionCollarLabel(item.collar_type, item.collar_label);
    const hemLabel = getProductionHemLabel(item.hem_type);
    const imageUrl = item.mockup_preview_url || item.mockup_url;
    const filledPlayerRows = getFilledPlayerRows(item);
    const itemSizeMap = getProductionItemSizeMap(item);
    return {
      key: item.client_id,
      span: usesWidePreviewCard ? 2 : 1,
      node: (
      <div className={`flex min-h-0 flex-col ${usesWidePreviewCard ? "col-span-2" : ""}`}>
        <div className={`rounded-md border border-slate-700 text-center font-black text-slate-700 ${usesExpandedProductionSheetLayout ? "mb-1 px-1.5 py-1 text-[9px]" : "mb-2 px-2 py-1.5 text-[11px]"}`}>
          ແບບ {index + 1} • {sleeveLabel} • {collarLabel} • {hemLabel}
        </div>
        <div className={`${usesWidePreviewCard ? (usesExpandedProductionSheetLayout ? "h-[122px]" : "h-[176px]") : "aspect-square"} overflow-hidden rounded-md border border-slate-700 bg-white`}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={`preview-${index + 1}`} className="h-full w-full object-contain bg-white" />
          ) : (
            <div className="flex h-full items-center justify-center text-center text-[11px] font-bold text-slate-400">
              ບໍ່ມີຮູບ Mockup
            </div>
          )}
        </div>
        <div className={`flex-1 rounded-md border border-slate-700 ${usesExpandedProductionSheetLayout ? "mt-2 p-2" : "mt-3 p-3"}`}>
          {item.player_mode === "none" ? (
            <>
              <div className={`text-center font-black text-sky-700 ${usesExpandedProductionSheetLayout ? "mb-1 text-[13px]" : "mb-2 text-[17px]"}`}>ຈຳນວນໄຊສ໌</div>
              <div className={`space-y-1.5 ${usesExpandedProductionSheetLayout ? "text-[11px] leading-tight" : "text-[18px]"}`}>
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
              <div className={`text-center font-black text-slate-700 ${usesExpandedProductionSheetLayout ? "mb-1 text-[11px]" : "mb-2 text-[14px]"}`}>
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
                    <div key={row.id} className={usesExpandedProductionSheetLayout ? "truncate font-bold" : "whitespace-nowrap font-bold"}>
                      {lineParts.join(" | ")}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    ),
    };
});

  const pantsCards: SheetCard[] = pantsItems.map((item, index) => {
    const imageUrl = item.mockup_preview_url || item.mockup_url;
    const filledPantsPlayerRows = getFilledPlayerRows(item);
    const pantsItemSizeMap = getPantsProductionItemSizeMap(item);
    const sizeEntries = PRODUCTION_SIZE_FIELDS.filter((field) => Number(pantsItemSizeMap[field.key]) > 0);
    return {
      key: `pants-${item.clientId}`,
      span: 1,
      node: (
      <div className="flex min-h-0 flex-col">
        <div className={`rounded-md border border-indigo-300 bg-indigo-50 text-center font-black text-indigo-700 ${usesExpandedProductionSheetLayout ? "mb-1 px-1.5 py-1 text-[9px]" : "mb-2 px-2 py-1.5 text-[11px]"}`}>
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
        <div className={`flex-1 rounded-md border border-slate-700 ${usesExpandedProductionSheetLayout ? "mt-2 p-2" : "mt-3 p-3"}`}>
          {item.player_mode === "none" ? (
            <>
              <div className={`text-center font-black text-sky-700 ${usesExpandedProductionSheetLayout ? "mb-1 text-[13px]" : "mb-2 text-[17px]"}`}>ຈຳນວນໄຊສ໌</div>
              <div className={`space-y-1.5 ${usesExpandedProductionSheetLayout ? "text-[11px] leading-tight" : "text-[18px]"}`}>
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
              <div className={`text-center font-black text-slate-700 ${usesExpandedProductionSheetLayout ? "mb-1 text-[11px]" : "mb-2 text-[14px]"}`}>
                LIST
              </div>
              <div className={`space-y-1 text-slate-900 ${usesExpandedProductionSheetLayout ? "text-[10px] leading-tight" : "text-[13px] leading-snug"}`}>
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
    ),
    };
});

  const columns = usesExpandedProductionSheetLayout ? 6 : 4;
  const rows = packCardsIntoRows([...shirtCards, ...pantsCards], columns);

  // Heights depend on content, fonts and width, so pages are split by measuring the rendered sheet.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pageContentRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [fontsVersion, setFontsVersion] = useState(0);
  const layoutKey = useMemo(
    () =>
      JSON.stringify([
        measuredWidth,
        agentName,
        fontsVersion,
        items,
        pantsItems,
        signatureFields,
        teamName,
        orderCode,
        workCategoryLabel,
        fabricName,
        productionSentDate,
        customerDeliveryDate,
        productionPriority,
        urgentDueDate,
      ]),
    [measuredWidth, agentName, fontsVersion, items, pantsItems, signatureFields, teamName, orderCode, workCategoryLabel, fabricName, productionSentDate, customerDeliveryDate, productionPriority, urgentDueDate]
  );
  const [pageSplit, setPageSplit] = useState<PageSplit | null>(null);
  const rowCount = rows.length;
  const rowCounts = resolveRowCounts(pageSplit, layoutKey, rowCount);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver(([entry]) => setMeasuredWidth(Math.round(entry.contentRect.width)));
    observer.observe(wrapper);
    let active = true;
    void document.fonts?.ready.then(() => {
      if (active) setFontsVersion((version) => version + 1);
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);

  // Rows only ever move forward, so this settles within one pass per row.
  useLayoutEffect(() => {
    const rowCounts = resolveRowCounts(pageSplit, layoutKey, rowCount);
    pageContentRefs.current.length = rowCounts.length;
    for (let pageIndex = 0; pageIndex < rowCounts.length; pageIndex += 1) {
      const content = pageContentRefs.current[pageIndex];
      if (!content || rowCounts[pageIndex] <= 1 || content.scrollHeight <= content.clientHeight + 1) continue;
      const next = [...rowCounts];
      next[pageIndex] -= 1;
      if (pageIndex + 1 < next.length) next[pageIndex + 1] += 1;
      else next.push(1);
      // Splitting needs the measured DOM, so the state update has to follow layout.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPageSplit({ key: layoutKey, rowCounts: next });
      return;
    }
  }, [pageSplit, layoutKey, rowCount]);

  const pages = rowCounts.map((count, pageIndex) => {
    const firstRow = rowCounts.slice(0, pageIndex).reduce((sum, previous) => sum + previous, 0);
    return rows.slice(firstRow, firstRow + count).flat();
  });

  return (
    <>
      <div ref={wrapperRef} className="production-sheet-document space-y-4 print:space-y-0">
        {pages.map((pageCards, pageIndex) => {
          const isFirstPage = pageIndex === 0;
          const isLastPage = pageIndex === pages.length - 1;
          return (
            <div
              key={pageIndex}
              className="production-sheet-a4 mx-auto aspect-[210/297] w-full max-w-[760px] overflow-hidden border border-slate-300 bg-white [font-family:'Noto_Sans_Lao_Looped','Noto_Sans_Lao',Tahoma,Arial,sans-serif] print:max-w-none print:border-0"
            >
              <div
                ref={(element) => {
                  pageContentRefs.current[pageIndex] = element;
                }}
                className="flex h-full flex-col bg-white p-5"
              >
                {isFirstPage ? (
                  <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-slate-700 p-4">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-black text-slate-700">ຊື່ທີມ:</div>
                        <div className="mt-1 break-words text-[18px] font-black leading-tight text-slate-900">{teamName || "-"}</div>
                      </div>
                      {/* Only codes the receipt scanner accepts get a barcode (no spaces or Lao text). */}
                      {normalizeFactoryBarcode(orderCode) ? <OrderCodeBarcode value={normalizeFactoryBarcode(orderCode)} /> : null}
                    </div>
                    <div className="mt-2 text-[15px] font-black text-slate-700">ລະຫັດອໍເດີ້: <span className="font-black text-sky-700">{orderCode || "-"}</span></div>
                    {agentName ? (
                      <div className="mt-1 inline-block rounded border border-indigo-300 bg-indigo-50 px-1.5 text-[12px] font-black text-indigo-700">ຕົວແທນ: {agentName}</div>
                    ) : null}
                    <div className="mt-1 text-[12px] font-bold text-slate-700">ປະເພດງານ: {workCategoryLabel}</div>
                    <div className="mt-1 text-[15px] font-black text-slate-700">ຜ້າ: <span className="font-bold text-slate-900">{fabricName || "-"}</span></div>
                    <div className="mt-1 text-[15px] font-black text-slate-700">
                      ຕີນເສື້ອ:{" "}
                      <span className="font-bold text-slate-900">
                        {Array.from(new Set(items.map((item) => getProductionHemLabel(item.hem_type)))).join(", ") || "-"}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-700 p-4">
                    <div className="text-[15px] font-black text-slate-700">ວັນທີ່ສົ່ງຜະລິດ: <span className="font-black text-slate-900">{productionSentDate || "-"}</span></div>
                    <div className="mt-1 text-[15px] font-black text-slate-700">ກຳນົດສົ່ງລູກຄ້າ: <span className="font-black text-slate-900">{customerDeliveryDate || "-"}</span></div>
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
                    productionPriority === "urgent"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-sky-200 bg-sky-50 text-slate-700"
                  }`}
                >
                  <span className="opacity-80">ຄວາມຮີບດ່ວນ:</span>{" "}
                  <span className={productionPriority === "urgent" ? "text-red-600" : "text-sky-700"}>{priorityBannerText}</span>
                </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 text-[11px] font-black text-slate-500">
                    <span>
                      {teamName || "-"}
                      {agentName ? ` • ຕົວແທນ: ${agentName}` : ""}
                    </span>
                    <span>
                      {orderCode || "-"} • ໜ້າ {pageIndex + 1}/{pages.length}
                    </span>
                  </div>
                )}

                <div className={`grid flex-1 gap-3 ${isFirstPage ? "mt-4" : "mt-3 content-start"} ${usesExpandedProductionSheetLayout ? "grid-cols-6" : "grid-cols-4"}`}>
                  {pageCards.map((card) => (
                    <Fragment key={card.key}>{card.node}</Fragment>
                  ))}
                </div>

                {isLastPage ? (
                  <div className="mt-5 grid grid-cols-4 gap-6 px-8 text-center text-[12px] text-slate-900">
                    {signatureFields.map((field) => (
                      <div key={field.label}>
                        <div className="font-black">{field.label}</div>
                        <div className="mt-1 min-h-[16px] text-[11px] font-bold text-slate-700">{field.name || "\u00A0"}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
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
              width: auto !important;
              top: 0 !important;
              left: 0 !important;
              right: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              border: 0 !important;
              box-shadow: none !important;
            }

            .production-sheet-a4 {
              break-after: page;
            }

            .production-sheet-document:last-child > .production-sheet-a4:last-child {
              break-after: auto;
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
    </>
  );
}
