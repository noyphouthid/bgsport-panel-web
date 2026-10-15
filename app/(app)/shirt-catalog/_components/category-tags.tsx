"use client";

import type { StorefrontCategory } from "@/lib/shirt-catalog";

export function CategoryTags({ categories, value, onChange, disabled = false }: {
  categories: StorefrontCategory[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="space-y-2">
    <legend className="text-sm font-medium">Tag ປະເພດເສື້ອ *</legend>
    <p className="text-xs text-[var(--theme-muted)]">ເລືອກໄດ້ຫຼາຍປະເພດ ເຊັ່ນ ເສື້ອທີມງານ + ໂປໂລ</p>
    <div className="flex flex-wrap gap-2">{categories.map(category => <label key={category.id} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${value.includes(category.id) ? "border-amber-400 bg-amber-300/10" : "border-[var(--theme-border)]"}`}>
      <input type="checkbox" checked={value.includes(category.id)} onChange={event => onChange(event.target.checked ? [...value, category.id] : value.filter(id => id !== category.id))}/>
      {category.lo}
    </label>)}</div>
    {!value.length && <p className="text-xs text-amber-600">ກະລຸນາເລືອກຢ່າງໜ້ອຍ 1 ປະເພດ</p>}
  </fieldset>;
}
