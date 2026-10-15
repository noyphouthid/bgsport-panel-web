export const VIENTIANE_CAPITAL = "ນະຄອນຫຼວງວຽງຈັນ";
export const UNKNOWN_LOCATION = "ຍັງບໍ່ລະບຸ";

export function getDeliveryMarketLocation(row: {
  delivery_method: string;
  transport_city?: string | null;
  transport_province?: string | null;
}) {
  const clean = (value: string | null | undefined) => String(value || "").trim().replace(/\s+/g, " ");
  if (row.delivery_method === "pickup") {
    return { province: VIENTIANE_CAPITAL, district: "", isStorePickup: true };
  }
  return {
    province: clean(row.transport_province) || UNKNOWN_LOCATION,
    district: clean(row.transport_city),
    isStorePickup: false,
  };
}

export type DeliveryMarketingRow = {
  order_id: string;
  status: string;
  updated_at: string;
  order_date: string | null;
  work_category: string | null;
  market_province: string;
  market_district: string;
  is_store_pickup: boolean;
  shirt_quantity: number;
  order_net_total: number;
};

type MarketTotals = { orders: number; shirts: number; sales: number };
export type RegionMarketSummary = MarketTotals & { province: string; district: string; isStorePickup: boolean };
export type CategoryMonthSummary = MarketTotals & { month: string; category: string | null };

export function buildDeliveryMarketingSummary(rows: readonly DeliveryMarketingRow[]) {
  const ordersById = new Map<string, DeliveryMarketingRow>();
  for (const row of rows) {
    if (row.status !== "delivered") continue;
    const existing = ordersById.get(row.order_id);
    if (!existing || row.updated_at > existing.updated_at) ordersById.set(row.order_id, row);
  }

  const provinces = new Map<string, RegionMarketSummary>();
  const districts = new Map<string, RegionMarketSummary>();
  const categoryMonths = new Map<string, CategoryMonthSummary>();
  const totals: MarketTotals = { orders: 0, shirts: 0, sales: 0 };
  let unclassified = 0;
  let missingLocation = 0;

  for (const row of ordersById.values()) {
    const values = { orders: 1, shirts: Math.max(0, Number(row.shirt_quantity) || 0), sales: Math.max(0, Number(row.order_net_total) || 0) };
    const add = (target: MarketTotals) => {
      target.orders += values.orders;
      target.shirts += values.shirts;
      target.sales += values.sales;
    };
    add(totals);
    if (!row.work_category) unclassified += 1;
    if (!row.is_store_pickup && (row.market_province === UNKNOWN_LOCATION || !row.market_district)) missingLocation += 1;

    const province = provinces.get(row.market_province) ?? { province: row.market_province, district: "", isStorePickup: false, orders: 0, shirts: 0, sales: 0 };
    add(province);
    provinces.set(row.market_province, province);

    // Store pickup belongs to the capital, without assuming a district.
    const districtKey = JSON.stringify([row.market_province, row.market_district, row.is_store_pickup]);
    const district = districts.get(districtKey) ?? { province: row.market_province, district: row.market_district, isStorePickup: row.is_store_pickup, orders: 0, shirts: 0, sales: 0 };
    add(district);
    districts.set(districtKey, district);

    const month = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(row.order_date || "") ? row.order_date!.slice(0, 7) : "";
    const categoryKey = JSON.stringify([month, row.work_category]);
    const category = categoryMonths.get(categoryKey) ?? { month, category: row.work_category, orders: 0, shirts: 0, sales: 0 };
    add(category);
    categoryMonths.set(categoryKey, category);
  }

  const byOrders = (a: MarketTotals, b: MarketTotals) => b.orders - a.orders || b.sales - a.sales;
  return {
    totals, unclassified, missingLocation,
    provinces: [...provinces.values()].sort((a, b) => byOrders(a, b) || a.province.localeCompare(b.province)),
    districts: [...districts.values()].sort((a, b) => byOrders(a, b) || a.province.localeCompare(b.province) || a.district.localeCompare(b.district)),
    categoryMonths: [...categoryMonths.values()].sort((a, b) => b.month.localeCompare(a.month) || byOrders(a, b) || String(a.category).localeCompare(String(b.category))),
  };
}
