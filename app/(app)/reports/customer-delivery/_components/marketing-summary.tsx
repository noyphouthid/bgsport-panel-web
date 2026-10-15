import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { buildDeliveryMarketingSummary, UNKNOWN_LOCATION, type DeliveryMarketingRow } from "@/lib/customer-delivery-marketing";
import { getOrderWorkCategoryLabel } from "@/lib/order-work-category";
import { LaosCustomerMap } from "./laos-customer-map";
import { buildCustomerProvinceMap } from "@/lib/customer-province-map";

export function MarketingSummary({ rows, onProvinceFilter, periodLabel }: { rows: readonly DeliveryMarketingRow[]; onProvinceFilter?: (province: string) => void; periodLabel?: string }) {
  const [regionLevel, setRegionLevel] = useState<"province" | "district">("province");
  const summary = useMemo(() => buildDeliveryMarketingSummary(rows), [rows]);
  const customerProvinces = useMemo(() => new Map(buildCustomerProvinceMap(rows).provinces.map((province) => [province.name, province])), [rows]);
  const regions = regionLevel === "province" ? summary.provinces : summary.districts;
  const districtLabel = (row: (typeof summary.districts)[number]) => row.isStorePickup ? "ຮັບໜ້າຮ້ານ (ບໍ່ລະບຸເມືອງ)" : row.district || UNKNOWN_LOCATION;

  const exportAnalysis = () => {
    const workbook = XLSX.utils.book_new();
    for (const [name, values] of [
      ["provinces", summary.provinces.map((row) => ({ province: row.province, customers: customerProvinces.get(row.province)?.customers ?? null, missing_customer_orders: customerProvinces.get(row.province)?.missingCustomerOrders ?? null, orders: row.orders, shirts: row.shirts, order_sales: row.sales }))],
      ["districts", summary.districts.map((row) => ({ province: row.province, district: districtLabel(row), orders: row.orders, shirts: row.shirts, order_sales: row.sales }))],
      ["monthly_work_categories", summary.categoryMonths.map((row) => ({ order_month: row.month || UNKNOWN_LOCATION, work_category: getOrderWorkCategoryLabel(row.category), orders: row.orders, shirts: row.shirts, order_sales: row.sales }))],
    ] as const) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([...values]), name);
    }
    XLSX.writeFile(workbook, "customer-delivery-marketing.xlsx");
  };

  return (
    <section aria-label="ວິເຄາະການຕະຫຼາດ" className="space-y-4 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">ວິເຄາະພື້ນທີ່ ແລະ ປະເພດງານຕາມເດືອນ</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">ສະເພາະອໍເດີສົ່ງມອບແລ້ວ • ນັບ 1 ຄັ້ງຕໍ່ອໍເດີ • ເດືອນອີງວັນທີອໍເດີ</p>
          <p className="mt-1 text-xs font-medium text-slate-500">ພື້ນທີ່ອີງບ່ອນສົ່ງຂົນສົ່ງ; ຮັບໜ້າຮ້ານນັບເປັນກຸ່ມນະຄອນຫຼວງວຽງຈັນ</p>
        </div>
        <button type="button" onClick={exportAnalysis} disabled={!summary.totals.orders} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50">
          <Download size={16} /> ດາວໂຫຼດຜົນວິເຄາະ
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["ອໍເດີສົ່ງມອບແລ້ວ", summary.totals.orders],
          ["ຈຳນວນເສື້ອ (ລວມແຖມ)", summary.totals.shirts],
          ["ຍອດຂາຍອໍເດີ (ກີບ)", summary.totals.sales],
        ].map(([label, value]) => <div key={label} className="rounded-xl bg-sky-50 p-3"><div className="text-xs font-bold text-slate-600">{label}</div><div className="mt-1 text-xl font-black text-sky-800">{Number(value).toLocaleString()}</div></div>)}
      </div>
      {summary.unclassified > 0 || summary.missingLocation > 0 ? (
        <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">ຍັງບໍ່ລະບຸປະເພດງານ: {summary.unclassified.toLocaleString()} ອໍເດີ • ຂໍ້ມູນເມືອງ/ແຂວງຂົນສົ່ງບໍ່ຄົບ: {summary.missingLocation.toLocaleString()} ອໍເດີ</p>
      ) : null}
      <LaosCustomerMap rows={rows} onProvinceFilter={onProvinceFilter} periodLabel={periodLabel} />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-100">
          <div className="flex items-center justify-between gap-2 bg-slate-50 p-3">
            <h3 className="text-sm font-black">ອັນດັບພື້ນທີ່</h3>
            <select aria-label="ລະດັບພື້ນທີ່" value={regionLevel} onChange={(event) => setRegionLevel(event.target.value as "province" | "district")} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-bold"><option value="province">ແຂວງ</option><option value="district">ເມືອງ</option></select>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs"><tr><th className="p-3 text-left">ພື້ນທີ່</th><th className="p-3 text-right">ອໍເດີ</th><th className="p-3 text-right">ເສື້ອ</th><th className="p-3 text-right">ຍອດຂາຍ</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {regions.map((row, index) => <tr key={JSON.stringify([row.province, row.district, row.isStorePickup])}><td className="p-3"><div className="font-bold">{index + 1}. {regionLevel === "province" ? row.province : districtLabel(row)}</div>{regionLevel === "district" ? <div className="text-xs text-slate-500">{row.province}</div> : null}</td><td className="p-3 text-right font-bold">{row.orders.toLocaleString()}</td><td className="p-3 text-right">{row.shirts.toLocaleString()}</td><td className="p-3 text-right">{row.sales.toLocaleString()}</td></tr>)}
                {!regions.length ? <tr><td colSpan={4} className="p-6 text-center text-slate-500">ບໍ່ມີອໍເດີສົ່ງມອບແລ້ວໃນໄລຍະນີ້</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-100">
          <h3 className="bg-slate-50 p-3 text-sm font-black">ປະເພດງານຕາມເດືອນອໍເດີ</h3>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs"><tr><th className="p-3 text-left">ເດືອນ</th><th className="p-3 text-left">ປະເພດງານ</th><th className="p-3 text-right">ອໍເດີ</th><th className="p-3 text-right">ເສື້ອ</th><th className="p-3 text-right">ຍອດຂາຍ</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {summary.categoryMonths.map((row) => <tr key={JSON.stringify([row.month, row.category])}><td className="whitespace-nowrap p-3 font-bold">{row.month || UNKNOWN_LOCATION}</td><td className="p-3">{getOrderWorkCategoryLabel(row.category)}</td><td className="p-3 text-right font-bold">{row.orders.toLocaleString()}</td><td className="p-3 text-right">{row.shirts.toLocaleString()}</td><td className="p-3 text-right">{row.sales.toLocaleString()}</td></tr>)}
                {!summary.categoryMonths.length ? <tr><td colSpan={5} className="p-6 text-center text-slate-500">ບໍ່ມີອໍເດີສົ່ງມອບແລ້ວໃນໄລຍະນີ້</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
