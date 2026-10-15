import { useId } from "react";
import { ORDER_WORK_CATEGORIES, type OrderWorkCategory } from "@/lib/order-work-category";

export function WorkCategoryField({ value, onChange, disabled = false }: {
  value: OrderWorkCategory | "";
  onChange: (value: OrderWorkCategory | "") => void;
  disabled?: boolean;
}) {
  const inputId = useId();
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
        {ORDER_WORK_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
      </select>
    </div>
  );
}
