type OrderSummaryPanelProps = {
  title: string;
  fabricName?: string | null;
  className?: string;
  totalOrderBillableQty: number;
  totalOrderQty: number;
  shirtBillableQty: number;
  pantsBillableQty: number;
  totalOrderFreeQty: number;
  shirtFreeQty: number;
  pantsFreeQty: number;
  shirtsTotal: number;
  pantsTotal: number;
  plusSizeTotal: number;
  collarTotal: number;
  extraCharge: number;
  designDiscount: number;
  primaryPaidLabel: string;
  primaryPaidValue: number;
  secondaryPaidLabel?: string;
  secondaryPaidValue?: number;
  outstandingLabel: string;
  outstandingValue: number;
  netTotal: number;
  totalFactoryCost?: number;
  profitPreview?: number;
  showProfitDetails?: boolean;
  footerNote?: string;
};

function formatMoney(value: number) {
  return `${(Number(value) || 0).toLocaleString()} ກີບ`;
}

function formatCount(value: number) {
  return `${(Number(value) || 0).toLocaleString()} ໂຕ`;
}

function joinClassNames(...classNames: Array<string | undefined | false>) {
  return classNames.filter(Boolean).join(" ");
}

function SummaryField({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value}</div>
      {detail ? <div className="mt-1 text-[11px] font-bold text-slate-500">{detail}</div> : null}
    </div>
  );
}

function SummaryMiniCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "violet" | "orange" | "blue" | "red";
}) {
  const toneClassName =
    tone === "violet"
      ? "border-violet-200 bg-violet-50/70"
      : tone === "orange"
        ? "border-amber-200 bg-amber-50/80"
        : tone === "blue"
          ? "border-sky-200 bg-sky-50/70"
          : tone === "red"
            ? "border-rose-200 bg-rose-50/80"
            : "border-slate-200 bg-white";

  const valueClassName =
    tone === "violet"
      ? "text-violet-700"
      : tone === "orange"
        ? "text-amber-700"
        : tone === "blue"
          ? "text-sky-700"
          : tone === "red"
            ? "text-rose-700"
            : "text-slate-900";

  return (
    <div className={joinClassNames("rounded-2xl border px-4 py-3", toneClassName)}>
      <div className="text-[11px] font-black text-slate-500">{label}</div>
      <div className={joinClassNames("mt-2 text-lg font-black", valueClassName)}>{value}</div>
    </div>
  );
}

function SummaryAccentCard({
  label,
  value,
  tone,
  fullWidth = false,
}: {
  label: string;
  value: string;
  tone: "blue" | "green" | "rose";
  fullWidth?: boolean;
}) {
  const toneClassName =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50/70"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50/70"
        : "border-sky-200 bg-sky-50/75";

  const labelClassName =
    tone === "green"
      ? "text-emerald-700"
      : tone === "rose"
        ? "text-rose-700"
        : "text-sky-700";

  const valueClassName =
    tone === "green"
      ? "text-emerald-900"
      : tone === "rose"
        ? "text-rose-900"
        : "text-sky-900";

  return (
    <div className={joinClassNames("rounded-2xl border px-4 py-4", toneClassName, fullWidth ? "sm:col-span-2" : undefined)}>
      <div className={joinClassNames("text-[11px] font-black uppercase tracking-[0.16em]", labelClassName)}>{label}</div>
      <div className={joinClassNames("mt-2 text-[1.75rem] font-black leading-none tracking-tight", valueClassName)}>{value}</div>
    </div>
  );
}

export function OrderSummaryPanel({
  title,
  fabricName,
  className,
  totalOrderBillableQty,
  totalOrderQty,
  shirtBillableQty,
  pantsBillableQty,
  totalOrderFreeQty,
  shirtFreeQty,
  pantsFreeQty,
  shirtsTotal,
  pantsTotal,
  plusSizeTotal,
  collarTotal,
  extraCharge,
  designDiscount,
  primaryPaidLabel,
  primaryPaidValue,
  secondaryPaidLabel,
  secondaryPaidValue,
  outstandingLabel,
  outstandingValue,
  netTotal,
  totalFactoryCost,
  profitPreview,
  showProfitDetails = false,
  footerNote,
}: OrderSummaryPanelProps) {
  return (
    <div className={joinClassNames("rounded-2xl border border-slate-100 bg-white p-5 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{title}</div>
          <div className="mt-1 text-sm font-bold text-slate-600">ສ່ວນສະຫຼຸບຈຳນວນ ແລະ ການເງິນ</div>
        </div>
        {fabricName ? (
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-700">
            {fabricName}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <SummaryField
          label="ຈຳນວນຄິດເງິນ"
          value={formatCount(totalOrderBillableQty)}
          detail={`ເສື້ອ ${shirtBillableQty.toLocaleString()} • ໂສ້ງ ${pantsBillableQty.toLocaleString()}`}
        />
        <SummaryField
          label="ລາຍການລວມ"
          value={formatCount(totalOrderQty)}
          detail={`ແຖມລວມ ${totalOrderFreeQty.toLocaleString()} • ແຖມເສື້ອ ${shirtFreeQty.toLocaleString()} • ແຖມໂສ້ງ ${pantsFreeQty.toLocaleString()}`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <SummaryMiniCard label="ຄ່າເສື້ອລວມ" value={formatMoney(shirtsTotal)} />
        <SummaryMiniCard label="ຄ່າໂສ້ງລວມ" value={formatMoney(pantsTotal)} />
        <SummaryMiniCard label="ບວກໄຊສ໌ໃຫຍ່" value={formatMoney(plusSizeTotal)} tone="orange" />
        <SummaryMiniCard label="ບວກຄໍເສື້ອ" value={formatMoney(collarTotal)} tone="violet" />
        <SummaryMiniCard label="ບວກເພີ່ມ" value={formatMoney(extraCharge)} tone="blue" />
        <SummaryMiniCard label="ຫັກຄ່າແບບ/ສ່ວນຫຼຸດ" value={`-${formatMoney(designDiscount)}`} tone="red" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SummaryAccentCard label="ຍອດສຸດທິ" value={formatMoney(netTotal)} tone="blue" fullWidth />
        <SummaryAccentCard label={primaryPaidLabel} value={formatMoney(primaryPaidValue)} tone="green" />
        <SummaryAccentCard label={outstandingLabel} value={formatMoney(outstandingValue)} tone="rose" />
      </div>

      {secondaryPaidLabel && secondaryPaidValue !== undefined ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-bold text-slate-600">{secondaryPaidLabel}</span>
            <span className="font-black text-slate-900">{formatMoney(secondaryPaidValue)}</span>
          </div>
        </div>
      ) : null}

      {showProfitDetails ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">ຕົ້ນທຶນ ແລະ ກຳໄລ</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-slate-600">ຕົ້ນທຶນລວມ</span>
              <span className="font-black text-slate-900">{formatMoney(totalFactoryCost || 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-slate-600">ກຳໄລເບື້ອງຕົ້ນ</span>
              <span className={joinClassNames("font-black", (profitPreview || 0) >= 0 ? "text-blue-700" : "text-red-700")}>
                {formatMoney(profitPreview || 0)}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {footerNote ? (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-700">
          {footerNote}
        </div>
      ) : null}
    </div>
  );
}
