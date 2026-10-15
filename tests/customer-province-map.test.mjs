import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as provinces from "../lib/laos-provinces.ts";

const source = readFileSync(new URL("../lib/customer-province-map.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const compiled = { exports: {} };
new Function("require", "module", "exports", outputText)((name) => {
  assert.equal(name, "@/lib/laos-provinces");
  return provinces;
}, compiled, compiled.exports);
const { normalizeCustomerPhone, buildCustomerProvinceMap } = compiled.exports;

const row = (overrides = {}) => ({
  order_id: "order-1", status: "delivered", updated_at: "2026-10-14T10:00:00Z", order_date: "2026-09-20",
  work_category: "sports", market_province: "ນະຄອນຫຼວງວຽງຈັນ", market_district: "", is_store_pickup: true,
  shirt_quantity: 10, order_net_total: 1000000, customer_phone: "020 1234 5678", customer_whatsapp: null, ...overrides,
});

test("phone formats normalize to the same Lao customer contact", () => {
  for (const phone of ["02012345678", "20 1234 5678", "+856 20 1234 5678", "00856-20-1234-5678", "856(020)12345678"]) {
    assert.equal(normalizeCustomerPhone(phone), "2012345678");
  }
  for (const phone of [null, "", "FB: Test", "020xxxxxxxx", "1111111111", "123", "20 1234 5678 / 20 9876 5432"]) assert.equal(normalizeCustomerPhone(phone), null);
});

test("province aliases resolve without conflating Vientiane province and capital", () => {
  for (const name of ["ນະຄອນຫລວງ ວຽງຈັນ", "ນະຄອນຫຼວງ", "Vientiane Capital"]) assert.equal(provinces.resolveLaosProvince(name).id, "LAVT");
  for (const name of ["ວຽງຈັນ", "ແຂວງວຽງຈັນ", "Vientiane Province"]) assert.equal(provinces.resolveLaosProvince(name).id, "LAVI");
  assert.equal(provinces.resolveLaosProvince("ບໍແກ້ວ").id, "LABK");
  assert.equal(provinces.resolveLaosProvince("ສະຫວັນນະເຂດ\u200b").id, "LASV");
  for (const value of ['"', ",", "ວັງວຽງ", "unknown"]) assert.equal(provinces.resolveLaosProvince(value), null);
});

test("repeat orders and alternate phone formatting do not become new customers", () => {
  const summary = buildCustomerProvinceMap([row(), row({ order_id: "order-2", customer_phone: "+8562012345678" })]);
  const capital = summary.provinces.find(province => province.id === "LAVT");
  assert.equal(capital.customers, 1);
  assert.equal(capital.orders, 2);
  assert.equal(capital.sales, 2000000);
  assert.equal(summary.customers, 1);
});

test("multiple requests for one order count once and use the latest delivered destination", () => {
  const summary = buildCustomerProvinceMap([row(), row({ market_province: "ບໍ່ແກ້ວ", updated_at: "2026-10-15T10:00:00Z" }), row({ status: "cancelled", updated_at: "2026-10-16T10:00:00Z" })]);
  assert.equal(summary.orders, 1);
  assert.equal(summary.provinces.find(province => province.id === "LAVT").orders, 0);
  assert.equal(summary.provinces.find(province => province.id === "LABK").customers, 1);
});

test("the same phone can appear in two destination provinces while the nationwide count stays unique", () => {
  const summary = buildCustomerProvinceMap([row(), row({ order_id: "order-2", market_province: "ວຽງຈັນ" })]);
  assert.equal(summary.provinces.find(province => province.id === "LAVT").customers, 1);
  assert.equal(summary.provinces.find(province => province.id === "LAVI").customers, 1);
  assert.equal(summary.customers, 1);
  assert.equal(summary.mappedCustomers, 1);
});

test("WhatsApp is a fallback contact; orders without a valid contact remain visible as orders", () => {
  const summary = buildCustomerProvinceMap([
    row({ customer_phone: "Facebook name", customer_whatsapp: "+8562012345678" }),
    row({ order_id: "order-2", customer_phone: null }),
    row({ order_id: "order-3", customer_phone: "020xxxxxxxx" }),
  ]);
  const capital = summary.provinces.find(province => province.id === "LAVT");
  assert.equal(capital.customers, 1);
  assert.equal(capital.orders, 3);
  assert.equal(capital.missingCustomerOrders, 2);
  assert.equal(summary.missingCustomerOrders, 2);
});

test("unmatched locations and non-delivered requests do not inflate mapped provinces", () => {
  const summary = buildCustomerProvinceMap([row({ market_province: "ວັງວຽງ" }), row({ order_id: "order-2", status: "draft" })]);
  assert.equal(summary.orders, 1);
  assert.equal(summary.mappedOrders, 0);
  assert.deepEqual(summary.unmatched, [{ name: "ວັງວຽງ", orders: 1 }]);
  assert.equal(summary.provinces.every(province => province.customers === 0), true);
});

test("empty maps contain all 18 areas with zero counts and source geometry matches their IDs", () => {
  const summary = buildCustomerProvinceMap([]);
  const geometry = JSON.parse(readFileSync(new URL("../lib/maps/laos-provinces.json", import.meta.url), "utf8"));
  assert.equal(summary.provinces.length, 18);
  assert.equal(summary.provinces.every(province => province.customers === 0 && province.orders === 0), true);
  assert.deepEqual(geometry.provinces.map(province => province.id).sort(), provinces.LAOS_PROVINCES.map(province => province.id).sort());
  for (const area of geometry.provinces) {
    assert.match(area.path, /^M[MLZ\d .-]+Z$/);
    assert.equal(area.label.length, 2);
    assert.equal(area.label.every(Number.isFinite), true);
  }
});
