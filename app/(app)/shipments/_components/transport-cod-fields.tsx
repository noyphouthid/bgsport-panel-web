"use client";

import { getTransportNoteContactPhone } from "@/lib/transport-notes";

export function TransportCodFields({ enabled, amount, disabled, onChange }: {
  enabled: boolean;
  amount: number;
  disabled?: boolean;
  onChange: (enabled: boolean, amount: number) => void;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 disabled:opacity-60">
      <label className="flex cursor-pointer items-center gap-3 text-sm font-bold text-slate-800">
        <input type="checkbox" checked={enabled} onChange={event => onChange(event.target.checked, event.target.checked ? amount : 0)} className="h-4 w-4 accent-blue-600" />
        COD — ເກັບເງິນປາຍທາງ
      </label>
      {enabled ? <label className="block text-sm font-bold text-slate-700">
        ຈຳນວນເງິນ COD (ກີບ)
        <input
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={amount ? Math.round(amount).toLocaleString("en-US") : ""}
          // Kip has no decimals, so treat "." and "," as thousands separators: "127.000" means 127000, not 127.
          onChange={event => onChange(true, Number(event.target.value.replace(/\D/g, "").slice(0, 13)) || 0)}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </label> : null}
      <p className="text-xs text-slate-600">ເບີຮ້ານໃນໃບບິນ: <strong>{getTransportNoteContactPhone(enabled)}</strong></p>
    </fieldset>
  );
}
