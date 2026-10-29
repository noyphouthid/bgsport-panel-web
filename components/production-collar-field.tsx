"use client";
import type { InternalDocumentOption } from "@/lib/internal-document-options";
import { selectableProductionCollars } from "@/lib/production-collars";

export function ProductionCollarField({ value, label, options, disabled, designNumber, onChange }: {
  value: string; label?: string; options: InternalDocumentOption[]; disabled?: boolean; designNumber: number;
  onChange: (option: InternalDocumentOption) => void;
}) {
  return <select aria-label={`ຄໍເສື້ອ ແບບທີ ${designNumber}`} value={value} disabled={disabled} onChange={event => {
    const option = options.find(row => row.code === event.target.value);
    if (option) onChange(option);
  }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100">
    {selectableProductionCollars(options, value, label).map(row => <option key={row.code} value={row.code}>{row.label}{!row.is_active ? " (ປິດໃຊ້ງານ)" : ""}</option>)}
  </select>;
}
