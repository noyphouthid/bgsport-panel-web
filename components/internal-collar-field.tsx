"use client";
import type { InternalDocumentOption } from "@/lib/internal-document-options";

export function InternalCollarField({ value, label, unitPrice, options, disabled, onChange }: {
  value: string; label: string; unitPrice: number; options: InternalDocumentOption[]; disabled?: boolean;
  onChange: (option: InternalDocumentOption) => void;
}) {
  const visible = options.filter(option => option.is_active || option.code === value);
  if (!visible.some(option => option.code === value)) visible.push({ code: value, label, unit_price: unitPrice, is_active: false, sort_order: 0 });
  return <select aria-label="ຄໍເສື້ອ" value={value} disabled={disabled} onChange={event => {
    const option = options.find(row => row.code === event.target.value);
    if (option) onChange(option);
  }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50">
    {visible.map(option => <option key={option.code} value={option.code}>{option.code === value ? label : option.label}{Number(option.code === value ? unitPrice : option.unit_price) > 0 ? ` +${Number(option.code === value ? unitPrice : option.unit_price).toLocaleString()} ກີບ/ໂຕ` : ""}{!option.is_active ? " (ປິດໃຊ້ງານ)" : ""}</option>)}
  </select>;
}
