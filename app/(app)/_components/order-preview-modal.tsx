"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Eye, FileText, ImageIcon, Package, PencilLine, Shirt, Wallet, X } from "lucide-react";
import type { QuotationDraft } from "@/lib/quotation-drafts";
import { QuotationA5Preview } from "./quotation-a5-preview";

type PreviewGalleryImage = {
  url: string;
  label: string;
};

type OrderPreviewModalProps = {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  order: {
    id: string;
    order_code: string;
    order_date: string;
    customer_phone: string | null;
    customer_whatsapp: string | null;
    factory_bill_code: string | null;
    fabric_name: string;
    net_total: number;
    initial_deposit: number;
    balance: number;
  } | null;
  galleryImages: PreviewGalleryImage[];
  quotationDraft: QuotationDraft | null;
  shirtQty: number;
  pantsQty: number;
  statusBadge: ReactNode;
  onClose: () => void;
};

function formatMoney(value: number) {
  return (Number(value) || 0).toLocaleString();
}

function PreviewField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tintClassName,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tintClassName: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tintClassName}`}>{icon}</div>
        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</div>
      </div>
      <div className="mt-3 text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

export function OrderPreviewModal({
  open,
  loading = false,
  error = null,
  order,
  galleryImages,
  quotationDraft,
  shirtQty,
  pantsQty,
  statusBadge,
  onClose,
}: OrderPreviewModalProps) {
  const [showQuotationPreview, setShowQuotationPreview] = useState(false);

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showQuotationPreview) {
          setShowQuotationPreview(false);
          return;
        }
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, showQuotationPreview]);

  if (!open || !order) return null;

  const primaryContact = order.customer_phone?.trim() || order.customer_whatsapp?.trim() || "-";
  const quotationButtonLabel = loading
    ? "ກຳລັງໂຫຼດໃບປະເມີນ..."
    : quotationDraft
      ? "ເບິ່ງໃບປະເມີນ"
      : "ບໍ່ພົບໃບປະເມີນ";

  return (
    <>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${order.order_code}`}
      >
        <div
          className="relative max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            aria-label="close preview"
          >
            <X size={18} />
          </button>

          <div className="pr-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-sky-700">
              <Eye size={14} />
              Quick View
            </div>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-2xl font-black tracking-tight text-slate-900">{order.order_code}</div>
              </div>
              <div className="shrink-0">{statusBadge}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <PreviewField label="ວັນທີອໍເດີ" value={order.order_date || "-"} />
                <PreviewField label="ບິນໂຮງງານ" value={order.factory_bill_code?.trim() || "-"} />
                <PreviewField label="ເບີຕິດຕໍ່" value={primaryContact} />
                <PreviewField label="WhatsApp" value={order.customer_whatsapp?.trim() || "-"} />
                <PreviewField label="ຜ້າ" value={order.fabric_name || "-"} />
                <PreviewField label="ມັດຈຳ" value={`${formatMoney(order.initial_deposit)} ກີບ`} />
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50/50 p-4">
                <div className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-slate-500">ສະຫຼຸບຈຳນວນ ແລະ ການເງິນ</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SummaryCard
                    icon={<Shirt size={18} className="text-slate-700" />}
                    label="ຈຳນວນເສື້ອ"
                    value={shirtQty.toLocaleString()}
                    tintClassName="bg-slate-100"
                  />
                  <SummaryCard
                    icon={<Package size={18} className="text-indigo-700" />}
                    label="ຈຳນວນໂສ້ງ"
                    value={pantsQty.toLocaleString()}
                    tintClassName="bg-indigo-50"
                  />
                  <SummaryCard
                    icon={<Wallet size={18} className="text-emerald-700" />}
                    label="ຍອດສຸດທິ"
                    value={formatMoney(order.net_total)}
                    tintClassName="bg-emerald-50"
                  />
                  <SummaryCard
                    icon={<FileText size={18} className="text-rose-700" />}
                    label="ຍອດຄ້າງ"
                    value={formatMoney(order.balance)}
                    tintClassName="bg-rose-50"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                <ImageIcon size={16} />
                ຮູບອໍເດີ ແລະ ຮູບແບບຜະລິດ
              </div>

              {error ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>
              ) : null}

              {loading ? (
                <div className="mt-4 flex h-[420px] items-center justify-center rounded-[22px] border border-slate-200 bg-white px-6 text-center text-sm font-bold text-slate-400">
                  ກຳລັງໂຫຼດຮູບພາບ...
                </div>
              ) : galleryImages.length > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {galleryImages.map((image, index) => (
                    <div key={`${image.url}-${index}`} className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                      <a href={image.url} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.url} alt={`${order.order_code}-preview-${index + 1}`} className="h-52 w-full object-cover bg-white transition hover:opacity-95" />
                      </a>
                      <div className="border-t border-slate-100 px-3 py-2 text-[11px] font-bold text-slate-500">{image.label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 flex h-[420px] items-center justify-center rounded-[22px] border border-slate-200 bg-white px-6 text-center text-sm font-bold text-slate-400">
                  ອໍເດີນີ້ຍັງບໍ່ມີຮູບສຳລັບ preview
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setShowQuotationPreview(true)}
              disabled={loading || !quotationDraft}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                loading || !quotationDraft
                  ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                  : "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
              }`}
            >
              <FileText size={16} />
              {quotationButtonLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              ປິດ
            </button>
            <Link
              href={`/orders/${order.id}/edit`}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              <PencilLine size={16} />
              ໄປໜ້າແກ້ໄຂ
            </Link>
          </div>
        </div>
      </div>

      {showQuotationPreview && quotationDraft ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setShowQuotationPreview(false)}>
          <div
            className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowQuotationPreview(false)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            >
              <X size={18} />
            </button>
            <div className="mb-4 pr-12">
              <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Quotation Preview A5</div>
              <div className="mt-2 text-lg font-black text-slate-900">{quotationDraft.quoteNo || order.order_code}</div>
            </div>
            <QuotationA5Preview draft={quotationDraft} />
          </div>
        </div>
      ) : null}
    </>
  );
}
