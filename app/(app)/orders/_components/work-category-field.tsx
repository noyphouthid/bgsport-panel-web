import { useId } from "react";
import { type OrderWorkCategory } from "@/lib/order-work-category";

import { useInternalDocumentOptions } from "@/lib/use-internal-document-options";
import type { InternalDocumentOption } from "@/lib/internal-document-options";

export function WorkCategoryField({ value, onChange, disabled = false, options, currentLabel }: {
  value: OrderWorkCategory | "";
  onChange: (value: OrderWorkCategory | "") => void;
  disabled?: boolean;
  options?: InternalDocumentOption[];
  currentLabel?: string;
}) {
  const inputId = useId();
  const catalog = useInternalDocumentOptions(!options);
  const visible = (options || catalog.workCategories).filter(row => row.is_active || row.code === value);
  if (value && !visible.some(row => row.code === value)) visible.push({ code: value, label: currentLabel || value, sort_order: 0, is_active: false });
  return (
    <div>
      <label htmlFor={inputId} className="block text-xs font-bold text-slate-700">ປະເພດງານ / ກຸ່ມເສື້ອ</label>
      <select
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value as OrderWorkCategory | "")}
        disabled={disabled}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
      >
        <option value="">ເລືອກປະເພດງານ</option>
        {visible.map((category) => <option key={category.code} value={category.code}>{category.code === value && currentLabel ? currentLabel : category.label}{!category.is_active ? " (ປິດໃຊ້ງານ)" : ""}</option>)}
      </select>
    </div>
  );
}
