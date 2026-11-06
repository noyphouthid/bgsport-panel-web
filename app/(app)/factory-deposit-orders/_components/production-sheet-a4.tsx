"use client";

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
};

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
}: ProductionSheetA4Props) {
  const usesExpandedProductionSheetLayout = items.length + pantsItems.length > 4;
  const priorityBannerText =
    productionPriority === "urgent"
      ? `ຕ້ອງການເຄື່ອງດ່ວນ! ກຳນົດສົ່ງບໍ່ເກີນວັນທີ ${urgentDueDate || "../../...."}`
      : "ງານປົກກະຕິ";

  return (
    <>
        <div className="production-sheet-a4 mx-auto aspect-[210/297] w-full max-w-[760px] overflow-hidden border border-slate-300 bg-white [font-family:'Noto_Sans_Lao_Looped','Noto_Sans_Lao',Tahoma,Arial,sans-serif] print:max-w-none print:border-0">
          <div className="flex h-full flex-col bg-white p-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-slate-700 p-4">
                <div className="text-[12px] font-black text-slate-700">ຊື່ທີມ:</div>
                <div className="mt-1 text-[18px] font-black leading-tight text-slate-900">{teamName || "-"}</div>
                <div className="mt-3 text-[15px] font-black text-slate-700">ລະຫັດອໍເດີ້: <span className="font-black text-sky-700">{orderCode || "-"}</span></div>
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

            <div className={`mt-4 grid flex-1 gap-3 ${usesExpandedProductionSheetLayout ? "grid-cols-6" : "grid-cols-4"}`}>
              {items.map((item, index) => {
                const usesWidePreviewCard = item.player_mode === "name_and_number";
                const sleeveLabel = PRODUCTION_SLEEVE_OPTIONS.find((option) => option.value === item.sleeve_type)?.label || "-";
                const collarLabel = getProductionCollarLabel(item.collar_type, item.collar_label);
                const hemLabel = getProductionHemLabel(item.hem_type);
                const imageUrl = item.mockup_preview_url || item.mockup_url;
                const filledPlayerRows = getFilledPlayerRows(item);
                const itemSizeMap = getProductionItemSizeMap(item);
                return (
                  <div key={item.client_id} className={`flex min-h-0 flex-col ${usesWidePreviewCard ? "col-span-2" : ""}`}>
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
                    );
                  })
                : null}
            </div>

            <div className="mt-5 grid grid-cols-4 gap-6 px-8 text-center text-[12px] text-slate-900">
              {signatureFields.map((field) => (
                <div key={field.label}>
                  <div className="font-black">{field.label}</div>
                  <div className="mt-1 min-h-[16px] text-[11px] font-bold text-slate-700">{field.name || "\u00A0"}</div>
                </div>
              ))}
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

            .production-sheet-a4:not(:last-child) {
              break-after: page;
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
