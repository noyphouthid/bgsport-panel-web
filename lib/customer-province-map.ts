import { LAOS_PROVINCES, resolveLaosProvince, type LaosProvinceId } from "@/lib/laos-provinces";
import type { DeliveryMarketingRow } from "@/lib/customer-delivery-marketing";

export type CustomerMapRow = DeliveryMarketingRow & {
  customer_phone?: string | null;
  customer_whatsapp?: string | null;
};

export function normalizeCustomerPhone(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!/^[+\d\s().-]+$/.test(text)) return null;
  let digits = text.replace(/\D/g, "");
  if (digits.startsWith("00856")) digits = digits.slice(2);
  if (digits.startsWith("856")) digits = digits.slice(3);
  if (/^0(?:20|30)/.test(digits)) digits = digits.slice(1);
  if (digits.length < 7 || digits.length > 15 || /^(\d)\1+$/.test(digits)) return null;
  return digits;
}

export type ProvinceCustomerStats = {
  id: LaosProvinceId;
  name: string;
  customers: number;
  orders: number;
  shirts: number;
  sales: number;
  missingCustomerOrders: number;
  categories: Array<{ category: string | null; orders: number }>;
};

export function buildCustomerProvinceMap(rows: readonly CustomerMapRow[]) {
  const completedOrders = new Map<string, CustomerMapRow>();
  for (const row of rows) {
    if (row.status !== "delivered") continue;
    const existing = completedOrders.get(row.order_id);
    if (!existing || row.updated_at > existing.updated_at) completedOrders.set(row.order_id, row);
  }

  const buckets = new Map(LAOS_PROVINCES.map((province) => [province.id, {
    id: province.id, name: province.name, orders: 0, shirts: 0, sales: 0, missingCustomerOrders: 0,
    contacts: new Set<string>(), categories: new Map<string | null, number>(),
  }]));
  const contacts = new Set<string>();
  const mappedContacts = new Set<string>();
  const unmatched = new Map<string, number>();
  let missingCustomerOrders = 0;

  for (const row of completedOrders.values()) {
    const contact = normalizeCustomerPhone(row.customer_phone) || normalizeCustomerPhone(row.customer_whatsapp);
    if (contact) contacts.add(contact);
    else missingCustomerOrders += 1;
    const province = resolveLaosProvince(row.market_province);
    if (!province) {
      unmatched.set(row.market_province, (unmatched.get(row.market_province) || 0) + 1);
      continue;
    }
    const bucket = buckets.get(province.id)!;
    bucket.orders += 1;
    bucket.shirts += Math.max(0, Number(row.shirt_quantity) || 0);
    bucket.sales += Math.max(0, Number(row.order_net_total) || 0);
    bucket.categories.set(row.work_category, (bucket.categories.get(row.work_category) || 0) + 1);
    if (contact) { bucket.contacts.add(contact); mappedContacts.add(contact); }
    else bucket.missingCustomerOrders += 1;
  }

  const provinces: ProvinceCustomerStats[] = [...buckets.values()].map(({ contacts: provinceContacts, categories, ...bucket }) => ({
    ...bucket,
    customers: provinceContacts.size,
    categories: [...categories].map(([category, orders]) => ({ category, orders })).sort((a, b) => b.orders - a.orders || String(a.category).localeCompare(String(b.category))),
  }));
  return {
    provinces,
    customers: contacts.size,
    mappedCustomers: mappedContacts.size,
    orders: completedOrders.size,
    mappedOrders: provinces.reduce((sum, province) => sum + province.orders, 0),
    missingCustomerOrders,
    unmatched: [...unmatched].map(([name, orders]) => ({ name, orders })).sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name)),
  };
}
