import { useMemo, useRef, useState } from "react";
import { Download, MapPinned, Minus, Plus, RotateCcw, Users } from "lucide-react";
import geometry from "@/lib/maps/laos-provinces.json";
import { buildCustomerProvinceMap, type CustomerMapRow } from "@/lib/customer-province-map";
import { getOrderWorkCategoryLabel } from "@/lib/order-work-category";

const COLORS = ["#e2e8f0", "#dbeafe", "#93c5fd", "#38bdf8", "#0284c7", "#075985"];
const LABEL_POSITIONS: Record<string, [number, number]> = {
  LAPH: [340, 125], LALM: [145, 195], LABK: [115, 300], LAOU: [300, 260],
  LALP: [425, 320], LAHO: [580, 250], LAXA: [215, 405], LAXI: [495, 375],
  LAVI: [285, 465], LAVT: [385, 550], LAXS: [450, 435], LABL: [575, 500],
  LAKH: [670, 595], LASV: [665, 695], LASL: [680, 785], LAXE: [865, 770],
  LACH: [700, 895], LAAT: [865, 910],
};

function densityColor(value: number, max: number) {
  if (!value || !max) return COLORS[0];
  const ratio = value / max;
  return COLORS[ratio <= 0.2 ? 1 : ratio <= 0.4 ? 2 : ratio <= 0.6 ? 3 : ratio <= 0.8 ? 4 : 5];
}

export function LaosCustomerMap({ rows, onProvinceFilter, periodLabel = "" }: {
  rows: readonly CustomerMapRow[];
  onProvinceFilter?: (province: string) => void;
  periodLabel?: string;
}) {
  const summary = useMemo(() => buildCustomerProvinceMap(rows), [rows]);
  const [metric, setMetric] = useState<"customers" | "orders">("customers");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sorted = useMemo(() => [...summary.provinces].sort((a, b) => b[metric] - a[metric] || b.orders - a.orders || a.name.localeCompare(b.name)), [metric, summary]);
  const byId = useMemo(() => new Map(summary.provinces.map((province) => [String(province.id), province])), [summary]);
  const active = byId.get(hoverId || selectedId || "") || sorted[0];
  const max = Math.max(0, ...summary.provinces.map((province) => province[metric]));
  const metricLabel = metric === "customers" ? "ລູກຄ້າ" : "ອໍເດີ";

  const downloadMap = () => {
    if (!svgRef.current) return;
    const svg = svgRef.current.cloneNode(true) as SVGSVGElement;
    svg.setAttribute("width", "1000");
    svg.setAttribute("height", "1050");
    svg.style.width = "1000px";
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `laos-${metric}-map.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section aria-label="ແຜນທີ່ລູກຄ້າຕາມແຂວງ" className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-100 bg-gradient-to-r from-sky-50 to-white p-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-black text-slate-900"><MapPinned size={20} className="text-sky-600" /> ແຜນທີ່ລູກຄ້າທົ່ວປະເທດລາວ</h3>
          <p className="mt-1 text-xs font-medium text-slate-500">ສີເຂັ້ມ = ຈຳນວນຫຼາຍ • ແຕະແຂວງເພື່ອເບິ່ງລາຍລະອຽດ • ອີງຕົວກອງຂອງລາຍງານ</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div aria-label="ຕົວເລກໃນແຜນທີ່" className="flex rounded-xl border border-slate-200 bg-white p-1">
            {(["customers", "orders"] as const).map((value) => <button key={value} type="button" aria-pressed={metric === value} onClick={() => setMetric(value)} className={`rounded-lg px-3 py-1.5 text-xs font-black ${metric === value ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>{value === "customers" ? "ລູກຄ້າ" : "ອໍເດີ"}</button>)}
          </div>
          <button type="button" onClick={downloadMap} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Download size={14} /> ດາວໂຫຼດແຜນທີ່</button>
        </div>
      </div>

      <div className="grid gap-px bg-slate-100 sm:grid-cols-3">
        {[
          ["ລູກຄ້າທີ່ລະບຸເບີໂທ", summary.customers],
          ["ແຂວງທີ່ມີອໍເດີ", summary.provinces.filter((province) => province.orders > 0).length],
          ["ອໍເດີສົ່ງມອບແລ້ວ", summary.orders],
        ].map(([label, value]) => <div key={label} className="bg-white px-4 py-3"><div className="text-xs font-bold text-slate-500">{label}</div><div className="mt-1 text-2xl font-black text-slate-900">{Number(value).toLocaleString()}</div></div>)}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="min-w-0 border-b border-slate-100 bg-sky-50/40 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            <div className="text-xs font-black text-slate-500">18 ເຂດແຂວງ / ນະຄອນຫຼວງ</div>
            <div className="flex gap-1">
              <button type="button" aria-label="ຫຍໍ້ແຜນທີ່" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - 0.25))} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 disabled:opacity-40"><Minus size={16} /></button>
              <button type="button" aria-label="ຂະຫຍາຍແຜນທີ່" disabled={zoom >= 2.5} onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 disabled:opacity-40"><Plus size={16} /></button>
              <button type="button" aria-label="ກັບຂະໜາດແຜນທີ່ເດີມ" onClick={() => setZoom(1)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700"><RotateCcw size={16} /></button>
            </div>
          </div>
          <div className="max-h-[660px] overflow-auto p-2">
            <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1050" role="group" aria-label={`ແຜນທີ່ລາວ: ຈຳນວນ${metricLabel}ຕາມແຂວງ`} style={{ width: `${zoom * 100}%`, height: "auto", display: "block", fontFamily: '"Noto Sans Lao", "Lao Sangam MN", sans-serif' }}>
              <title>ແຜນທີ່{metricLabel}ຕາມແຂວງ — BG SPORT</title>
              <desc>{periodLabel} • ອໍເດີສົ່ງມອບແລ້ວຕາມຕົວກອງລາຍງານ. ລູກຄ້ານັບຕາມເບີໂທບໍ່ຊ້ຳໃນແຕ່ລະແຂວງ.</desc>
              <rect width="1000" height="1050" fill="#f4f9fd" />
              <text x="735" y="30" textAnchor="middle" fontSize="25" fontWeight="900" fill="#075985">{metricLabel}ຕາມແຂວງ</text>
              <text x="735" y="60" textAnchor="middle" fontSize="17" fill="#64748b">{periodLabel}</text>
              <g fill="#94a3b8" fontSize="23" textAnchor="middle" pointerEvents="none">
                <text x="515" y="85">ຈີນ</text><text x="90" y="145">ມຽນມາ</text><text x="760" y="360">ຫວຽດນາມ</text><text x="280" y="745">ໄທ</text><text x="685" y="1000">ກຳປູເຈຍ</text>
              </g>
              {geometry.provinces.map((area) => {
                const province = byId.get(area.id)!;
                const emphasized = area.id === active.id;
                return (
                  <g key={area.id} role="button" tabIndex={0} aria-pressed={area.id === selectedId} aria-label={`${province.name}: ${province[metric].toLocaleString()} ${metricLabel}`} data-province={area.id}
                    onClick={() => setSelectedId(area.id)} onFocus={() => setHoverId(area.id)} onBlur={() => setHoverId(null)} onMouseEnter={() => setHoverId(area.id)} onMouseLeave={() => setHoverId(null)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(area.id); } }}
                    className="cursor-pointer outline-none">
                    <title>{province.name}: {province.customers.toLocaleString()} ລູກຄ້າ / {province.orders.toLocaleString()} ອໍເດີ</title>
                    <path d={area.path} fill={densityColor(province[metric], max)} stroke={emphasized ? "#f59e0b" : "#fff"} strokeWidth={emphasized ? 5 : 2} strokeLinejoin="round" />
                  </g>
                );
              })}
              <g pointerEvents="none">
                {geometry.provinces.map((area) => {
                  const province = byId.get(area.id)!;
                  const [x, y] = LABEL_POSITIONS[area.id] || area.label;
                  const count = province[metric].toLocaleString();
                  const width = Math.max(50, count.length * 16 + 18);
                  const emphasized = area.id === active.id;
                  return <g key={area.id} data-province-label={area.id} pointerEvents="auto" role="button" tabIndex={0} aria-pressed={area.id === selectedId} aria-label={`ຕົວເລກ ${province.name}: ${count} ${metricLabel}`} className="cursor-pointer outline-none"
                    onClick={() => setSelectedId(area.id)} onFocus={() => setHoverId(area.id)} onBlur={() => setHoverId(null)} onMouseEnter={() => setHoverId(area.id)} onMouseLeave={() => setHoverId(null)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(area.id); } }}>
                    <path d={`M${area.label[0]} ${area.label[1]}L${x} ${y}`} fill="none" stroke="#64748b" strokeWidth="1.5" opacity="0.55" />
                    <text x={x} y={y - 23} textAnchor="middle" fontSize="23" fontWeight="700" fill="#0f172a" stroke="#f4f9fd" strokeWidth="4" paintOrder="stroke">{area.id === "LAVT" ? "ນຄ.ວຽງຈັນ" : province.name}</text>
                    <rect x={x - width / 2} y={y - 15} width={width} height="36" rx="18" fill={emphasized ? "#f59e0b" : "#fff"} stroke={emphasized ? "#fff" : "#94a3b8"} strokeWidth="2" />
                    <text x={x} y={y + 10} textAnchor="middle" fontSize="27" fontWeight="900" fill={emphasized ? "#fff" : province[metric] ? "#075985" : "#64748b"}>{count}</text>
                  </g>;
                })}
              </g>
              <text x="500" y="1030" textAnchor="middle" fontSize="17" fill="#64748b">BG SPORT • {metricLabel}ຕາມແຂວງ • Map: Simplemaps.com</text>
            </svg>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sky-100 px-4 py-3 text-xs font-bold text-slate-500">
            <div className="flex items-center gap-1.5"><span>0</span>{COLORS.map((color) => <span key={color} className="h-3 w-6 rounded" style={{ backgroundColor: color }} />)}<span>{max.toLocaleString()} {metricLabel}</span></div>
            <a href="https://simplemaps.com/svg/country/la" target="_blank" rel="noreferrer" className="font-medium text-slate-400 hover:text-sky-600">Map: Simplemaps</a>
          </div>
        </div>

        <div className="min-w-0 space-y-4 p-4">
          <div aria-live="polite" aria-label="ລາຍລະອຽດແຂວງ" className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
            <div className="flex items-center gap-2 text-xs font-black text-sky-600"><MapPinned size={14} /> ແຂວງທີ່ເລືອກ</div>
            <h4 className="mt-2 text-lg font-black text-slate-900">{active.name}</h4>
            <div className="mt-3 flex items-end gap-2"><Users size={20} className="mb-1 text-sky-600" /><span className="text-4xl font-black text-sky-800">{active.customers.toLocaleString()}</span><span className="pb-1 text-sm font-bold text-slate-500">ລູກຄ້າ</span></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><div className="text-slate-500">ອໍເດີ</div><div className="mt-1 font-black">{active.orders.toLocaleString()}</div></div><div><div className="text-slate-500">ເສື້ອ</div><div className="mt-1 font-black">{active.shirts.toLocaleString()}</div></div><div><div className="text-slate-500">ຍອດຂາຍ (ກີບ)</div><div className="mt-1 break-words font-black">{active.sales.toLocaleString()}</div></div></div>
            {active.categories.length ? <div className="mt-3 border-t border-sky-100 pt-3 text-xs"><div className="mb-2 font-bold text-slate-500">ປະເພດງານຫຼາຍທີ່ສຸດ</div>{active.categories.slice(0, 3).map((category) => <div key={category.category || "unknown"} className="flex items-center justify-between gap-2 py-1"><span>{getOrderWorkCategoryLabel(category.category)}</span><span className="shrink-0 font-black">{category.orders.toLocaleString()} ອໍເດີ</span></div>)}</div> : null}
            {active.missingCustomerOrders ? <p className="mt-2 text-xs font-bold text-amber-700">ອີກ {active.missingCustomerOrders.toLocaleString()} ອໍເດີບໍ່ມີເບີໂທສຳລັບນັບລູກຄ້າ</p> : null}
            {onProvinceFilter ? <div className="mt-3 flex gap-2"><button type="button" onClick={() => onProvinceFilter(active.name)} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-black text-white hover:bg-sky-700">ກອງແຂວງນີ້</button><button type="button" onClick={() => onProvinceFilter("all")} className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-700">ທຸກແຂວງ</button></div> : null}
          </div>

          <div>
            <h4 className="mb-2 text-sm font-black text-slate-800">ອັນດັບ{metricLabel}ຕາມແຂວງ</h4>
            <div className="max-h-[360px] space-y-1 overflow-auto pr-1">
              {sorted.map((province, index) => <button key={province.id} type="button" aria-label={`ເລືອກແຂວງ ${province.name}`} aria-pressed={province.id === selectedId} onClick={() => { setSelectedId(province.id); setHoverId(null); }} className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition ${active.id === province.id ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : "hover:bg-slate-50"}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${index < 3 ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span>
                <div className="min-w-0 flex-1"><div className="text-xs font-bold text-slate-700">{province.name}</div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${max ? province[metric] / max * 100 : 0}%` }} /></div></div>
                <span className="text-lg font-black text-sky-800">{province[metric].toLocaleString()}</span>
              </button>)}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <p>ລູກຄ້າ = ເບີໂທ/WhatsApp ບໍ່ຊ້ຳໃນແຕ່ລະແຂວງ; ເບີດຽວສົ່ງຫຼາຍແຂວງຈະນັບໃນແຕ່ລະແຂວງ. ບໍ່ນັບອໍເດີທີ່ບໍ່ມີເບີໂທເປັນລູກຄ້າໃໝ່.</p>
        {summary.missingCustomerOrders ? <p className="font-bold text-amber-700">ຂາດເບີໂທສຳລັບນັບລູກຄ້າ: {summary.missingCustomerOrders.toLocaleString()} ອໍເດີ — ຍັງເບິ່ງຈຳນວນອໍເດີໃນແຜນທີ່ໄດ້</p> : null}
        {summary.unmatched.length ? <details><summary className="cursor-pointer font-bold text-amber-700">ຈັບຄູ່ແຂວງບໍ່ໄດ້: {(summary.orders - summary.mappedOrders).toLocaleString()} ອໍເດີ</summary><div className="mt-2 flex flex-wrap gap-2">{summary.unmatched.map((province) => <span key={province.name} className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-1 text-amber-800">{province.name}: {province.orders.toLocaleString()}</span>)}</div></details> : null}
      </div>
    </section>
  );
}
