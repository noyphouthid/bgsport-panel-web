"use client";

import { useState } from "react";
import { MessageCircleMore } from "lucide-react";
import { buildWhatsappUrl, type WhatsappContactOption } from "@/lib/whatsapp";

type Props = {
  open: boolean;
  title?: string;
  message: string;
  phoneOptions: WhatsappContactOption[];
  initialPhone?: string;
  onClose: () => void;
};

export function WhatsappMessageModal({ open, title = "ສົ່ງຂໍ້ຄວາມ WhatsApp", message, phoneOptions, initialPhone, onClose }: Props) {
  const [selectedPhone, setSelectedPhone] = useState(initialPhone || phoneOptions[0]?.value || "");
  const [draftMessage, setDraftMessage] = useState(message);

  if (!open) return null;

  const whatsappUrl = buildWhatsappUrl(selectedPhone, draftMessage);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-black text-slate-900">{title}</div>
            <div className="mt-1 text-sm font-medium text-slate-500">ເລືອກເບີ ແລະ ແກ້ຂໍ້ຄວາມກ່ອນສົ່ງໄດ້</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
            ປິດ
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ເລືອກເບີສົ່ງ</label>
            <select
              value={selectedPhone}
              onChange={(e) => setSelectedPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {phoneOptions.map((option) => (
                <option key={`${option.key}-${option.value}`} value={option.value}>
                  {option.label}: {option.value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">ຂໍ້ຄວາມ</label>
            <textarea
              value={draftMessage}
              onChange={(e) => setDraftMessage(e.target.value)}
              rows={10}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            ຍົກເລີກ
          </button>
          <a
            href={whatsappUrl || "#"}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              if (!whatsappUrl) e.preventDefault();
            }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white ${
              whatsappUrl ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-300"
            }`}
          >
            <MessageCircleMore size={16} />
            ເປີດ WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
