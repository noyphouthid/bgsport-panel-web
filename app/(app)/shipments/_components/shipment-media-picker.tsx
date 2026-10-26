"use client";

import { useEffect, useRef } from "react";
import { Camera, FileUp, X } from "lucide-react";
import type { ShipmentAttachmentDraft } from "@/lib/shipment-delivery-requests";
import { isImageFileName, toDisplayMediaUrl } from "@/lib/order-media";

function AttachmentPreview({ item }: { item: ShipmentAttachmentDraft }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!item.file) return;
    const url = URL.createObjectURL(item.file);
    if (linkRef.current) linkRef.current.href = url;
    if (imageRef.current) imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [item.file]);
  const url = item.file ? undefined : toDisplayMediaUrl(item.url) || undefined;
  const isImage = item.file ? item.file.type.startsWith("image/") : isImageFileName(item.file_name) || isImageFileName(item.url);
  return (
    <a ref={linkRef} href={url} target="_blank" rel="noreferrer" className="block">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={imageRef} src={url} alt={item.file_name} className="h-40 w-full rounded-xl object-contain" />
      ) : (
        <span className="flex h-40 items-center justify-center rounded-xl bg-slate-50 text-sm font-bold text-sky-700">ເປີດ PDF</span>
      )}
    </a>
  );
}

export function ShipmentMediaPicker({ title, items, allowPdf = false, disabled, onChange }: {
  title: string;
  items: ShipmentAttachmentDraft[];
  allowPdf?: boolean;
  disabled: boolean;
  onChange: (items: ShipmentAttachmentDraft[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const selectFiles = (input: HTMLInputElement) => {
    const files = Array.from(input.files || []).filter((file) =>
      file.type.startsWith("image/") || (allowPdf && (file.type === "application/pdf" || /\.pdf$/i.test(file.name)))
    );
    if (files.length) onChange([...items, ...files.map((file) => ({ file, file_name: file.name, path: null, url: "" }))]);
    input.value = "";
  };
  return (
    <div className="mt-4" role="group" aria-label={title}>
      <div className="text-sm font-bold text-slate-700">{title}</div>
      <div className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
            <FileUp size={16} /> ເພີ່ມຮູບ
          </button>
          <button type="button" disabled={disabled} onClick={() => cameraRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-50">
            <Camera size={16} /> ຖ່າຍຮູບ
          </button>
          <input ref={inputRef} type="file" multiple accept={allowPdf ? "image/*,.pdf" : "image/*"} aria-label={`${title} — ເລືອກໄຟລ໌`} className="sr-only" disabled={disabled} onChange={(e) => selectFiles(e.currentTarget)} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" aria-label={`${title} — ຖ່າຍຮູບ`} className="sr-only" disabled={disabled} onChange={(e) => selectFiles(e.currentTarget)} />
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500">{items.length ? `${items.length} ໄຟລ໌` : "ຍັງບໍ່ໄດ້ແນບໄຟລ໌"} · ເລືອກໄດ້ຫຼາຍຮູບ ແລະ ເພີ່ມຮູບຕໍ່ໄດ້</p>
        <div className="mt-3 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          {items.map((item, index) => (
            <div key={item.path || `${index}-${item.file_name}`} className="min-w-0 rounded-xl border border-slate-200 p-2">
              <AttachmentPreview item={item} />
              <div className="mt-2 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-600" title={item.file_name}>{item.file_name}</span>
                <button type="button" disabled={disabled} aria-label={`ລຶບ ${item.file_name}`} onClick={() => onChange(items.filter((_, i) => i !== index))} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"><X size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
