"use client";

type OrderHistoryFieldChange = {
  label?: string | null;
  before?: string | null;
  after?: string | null;
};

type OrderHistoryMeta = {
  changed_fields?: OrderHistoryFieldChange[] | null;
  summary_lines?: string[] | null;
};

export type OrderHistoryEntry = {
  id: string;
  action: string;
  detail: string | null;
  action_at: string;
  actor_name?: string | null;
  actor_role?: string | null;
  action_meta?: unknown;
};

type OrderActivityPanelProps = {
  items: OrderHistoryEntry[];
  loading?: boolean;
};

const ACTION_LABELS: Record<string, string> = {
  create_order: "ສ້າງອໍເດີ",
  update_order: "ແກ້ໄຂອໍເດີ",
  receive_customer_payment: "ຮັບເງິນລູກຄ້າ",
  pay_factory: "ຈ່າຍເງິນໂຮງງານ",
  production_completed: "ຜະລິດສຳເລັດ",
  close_order: "ປິດອໍເດີ",
  cancel_factory_receipt: "ຍົກເລີກນຳເຂົ້າ",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB");
}

function parseMeta(value: unknown): OrderHistoryMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const raw = value as {
    changed_fields?: unknown;
    summary_lines?: unknown;
  };

  const changed_fields = Array.isArray(raw.changed_fields)
    ? raw.changed_fields
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const row = item as Record<string, unknown>;
          return {
            label: typeof row.label === "string" ? row.label : null,
            before: typeof row.before === "string" ? row.before : null,
            after: typeof row.after === "string" ? row.after : null,
          };
        })
    : [];

  const summary_lines = Array.isArray(raw.summary_lines)
    ? raw.summary_lines.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return { changed_fields, summary_lines };
}

function getActionTone(action: string) {
  if (action === "create_order") return "border-emerald-200 bg-emerald-50/60 text-emerald-800";
  if (action === "update_order") return "border-sky-200 bg-sky-50/70 text-sky-800";
  if (action === "close_order") return "border-violet-200 bg-violet-50/70 text-violet-800";
  if (action === "cancel_factory_receipt") return "border-rose-200 bg-rose-50/70 text-rose-800";
  return "border-slate-200 bg-slate-50/70 text-slate-700";
}

export function OrderActivityPanel({ items, loading = false }: OrderActivityPanelProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-900 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
        <div className="font-black text-slate-900">ປະຫວັດການແກ້ໄຂ</div>
        <div className="text-[11px] font-bold text-slate-500">{items.length.toLocaleString()} ລາຍການ</div>
      </div>

      {loading ? (
        <div className="py-4 text-sm font-medium text-slate-500">ກຳລັງໂຫຼດປະຫວັດ...</div>
      ) : items.length === 0 ? (
        <div className="py-4 text-sm font-medium text-slate-500">ຍັງບໍ່ມີປະຫວັດການແກ້ໄຂ</div>
      ) : (
        <div className="mt-3 space-y-3">
          {items.map((item) => {
            const meta = parseMeta(item.action_meta);
            const changedFields = meta.changed_fields || [];
            const actorLabel = item.actor_name?.trim() || "ບໍ່ຮູ້ຜູ້ດຳເນີນການ";
            const actionLabel = ACTION_LABELS[item.action] || item.action;

            return (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${getActionTone(item.action)}`}>
                      {actionLabel}
                    </div>
                    <div className="text-sm font-black text-slate-900">{actorLabel}</div>
                    <div className="text-[11px] font-bold text-slate-500">{formatDateTime(item.action_at)}</div>
                  </div>
                  {item.actor_role ? (
                    <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-600">
                      {item.actor_role}
                    </div>
                  ) : null}
                </div>

                {item.detail?.trim() ? <div className="mt-3 text-sm font-medium text-slate-700">{item.detail}</div> : null}

                {meta.summary_lines?.length ? (
                  <div className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    {meta.summary_lines.map((line, index) => (
                      <div key={`${item.id}-summary-${index}`} className="text-[11px] font-bold text-slate-600">
                        {line}
                      </div>
                    ))}
                  </div>
                ) : null}

                {changedFields.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">ສ່ວນທີ່ຖືກແກ້</div>
                    {changedFields.slice(0, 6).map((field, index) => (
                      <div key={`${item.id}-field-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="font-black text-slate-900">{field.label || "ຟິວບໍ່ລະບຸ"}</div>
                        <div className="mt-1 text-[11px] font-medium text-slate-500">ເກົ່າ: {field.before || "-"}</div>
                        <div className="text-[11px] font-medium text-slate-700">ໃໝ່: {field.after || "-"}</div>
                      </div>
                    ))}
                    {changedFields.length > 6 ? (
                      <div className="text-[11px] font-bold text-slate-500">ຍັງມີອີກ {changedFields.length - 6} ລາຍການ</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
