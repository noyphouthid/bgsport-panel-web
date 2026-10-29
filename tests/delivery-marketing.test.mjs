import assert from "node:assert/strict";
import test from "node:test";
import { buildDeliveryMarketingSummary, getDeliveryMarketLocation, VIENTIANE_CAPITAL, UNKNOWN_LOCATION } from "../lib/customer-delivery-marketing.ts";
import { ORDER_WORK_CATEGORIES, normalizeOrderWorkCategory, getOrderWorkCategoryLabel, isMissingWorkCategoryError } from "../lib/order-work-category.ts";

const row = (overrides = {}) => ({
  order_id: "order-1", status: "delivered", updated_at: "2026-10-14T10:00:00Z",
  order_date: "2026-09-20", work_category: "sports", market_province: "ແຂວງ A", market_district: "ເມືອງ A",
  is_store_pickup: false, shirt_quantity: 20, order_net_total: 2000000, ...overrides,
});

test("store pickup belongs to Vientiane Capital and does not invent a district", () => {
  assert.deepEqual(getDeliveryMarketLocation({ delivery_method: "pickup", transport_city: "old city", transport_province: "old province" }), {
    province: VIENTIANE_CAPITAL, district: "", isStorePickup: true,
  });
});

test("transport uses the recorded destination, with missing addresses kept visible", () => {
  assert.deepEqual(getDeliveryMarketLocation({ delivery_method: "transport", transport_city: "  ເມືອງ A  ", transport_province: " ແຂວງ A " }), {
    province: "ແຂວງ A", district: "ເມືອງ A", isStorePickup: false,
  });
  assert.equal(getDeliveryMarketLocation({ delivery_method: "transport" }).province, UNKNOWN_LOCATION);
});

test("multiple delivery requests count an order and its sales once at the latest completed destination", () => {
  const summary = buildDeliveryMarketingSummary([
    row(), row({ updated_at: "2026-10-15T10:00:00Z", market_province: "ແຂວງ B" }),
    row({ updated_at: "2026-10-16T10:00:00Z", status: "cancelled", market_province: "ແຂວງ C" }),
  ]);
  assert.deepEqual(summary.totals, { orders: 1, shirts: 20, sales: 2000000 });
  assert.equal(summary.provinces[0].province, "ແຂວງ B");
});

test("drafts, submitted, rejected, cancelled and approved requests are excluded from completed sales", () => {
  const summary = buildDeliveryMarketingSummary(["draft", "submitted", "rejected", "cancelled", "approved"].map(status => row({ status })));
  assert.equal(summary.totals.orders, 0);
});

test("the same district name in different provinces remains separate", () => {
  const summary = buildDeliveryMarketingSummary([row(), row({ order_id: "order-2", market_province: "ແຂວງ B" })]);
  assert.equal(summary.districts.length, 2);
  assert.equal(summary.totals.orders, 2);
});

test("pickup and transport combine at province level but pickup stays separate at district level", () => {
  const summary = buildDeliveryMarketingSummary([
    row({ market_province: VIENTIANE_CAPITAL }),
    row({ order_id: "pickup-1", market_province: VIENTIANE_CAPITAL, market_district: "", is_store_pickup: true }),
  ]);
  assert.equal(summary.provinces.length, 1);
  assert.equal(summary.provinces[0].orders, 2);
  assert.equal(summary.districts.length, 2);
  assert.equal(summary.missingLocation, 0);
});

test("monthly work analysis uses order date, preserves unknown categories, and does not substitute delivery payments", () => {
  const summary = buildDeliveryMarketingSummary([
    row({ delivery_scheduled_at: "2026-10-14T10:00:00Z", payment_amount: 50000 }),
    row({ order_id: "legacy-1", work_category: null, order_date: null, market_province: UNKNOWN_LOCATION, market_district: "" }),
  ]);
  assert.equal(summary.categoryMonths.find(value => value.category === "sports").month, "2026-09");
  assert.equal(summary.categoryMonths.find(value => value.category === null).month, "");
  assert.equal(summary.unclassified, 1);
  assert.equal(summary.missingLocation, 1);
  assert.equal(summary.totals.sales, 4000000);
});

test("empty reports return empty groups and zero totals", () => {
  const summary = buildDeliveryMarketingSummary([]);
  assert.deepEqual(summary.totals, { orders: 0, shirts: 0, sales: 0 });
  assert.deepEqual(summary.categoryMonths, []);
});

test("work categories retain defaults and preserve configured custom codes", () => {
  assert.equal(ORDER_WORK_CATEGORIES.length, 8);
  for (const category of ORDER_WORK_CATEGORIES) {
    assert.equal(normalizeOrderWorkCategory(category.value), category.value);
    assert.equal(getOrderWorkCategoryLabel(category.value), category.label);
  }
  for (const value of [null, undefined, "PK26", "bad code", "", 123]) assert.equal(normalizeOrderWorkCategory(value), null);
  assert.equal(normalizeOrderWorkCategory("cycling"), "cycling");
  assert.equal(getOrderWorkCategoryLabel("cycling", [{ value: "cycling", label: "ເສື້ອລົດຖີບ" }]), "ເສື້ອລົດຖີບ");
  assert.equal(isMissingWorkCategoryError({ code: "42703", message: "column orders.work_category does not exist" }), true);
  assert.equal(isMissingWorkCategoryError({ code: "42501", message: "permission denied for work_category" }), false);
});
