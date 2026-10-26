import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as orderAlerts from "../lib/order-alerts.ts";
import {
  fetchOrderAlertOrdersWithClient,
  getOrderAlertEndDate,
  getOrderAlertTiming,
  getOrderAlertToday,
} from "../lib/order-alerts.ts";

const today = "2026-10-27";
const deposit = {
  status: "converted",
  order_id: "order-1",
  production_sent_date: "2026-10-20",
  delivery_date: today,
};
const order = {
  id: "order-1",
  status: "in_progress",
  closed_at: null,
  production_completed_at: null,
  shipment_status: "pending",
  shipment_completed_at: null,
};

test("alerts include overdue orders, today and the next three days, excluding day four", () => {
  for (const [delivery_date, dueInDays] of [
    ["2026-10-26", -1], [today, 0], ["2026-10-28", 1], ["2026-10-29", 2], ["2026-10-30", 3],
  ]) {
    assert.deepEqual(getOrderAlertTiming({ ...deposit, delivery_date }, order, today), {
      dueInDays,
      productionDays: 7,
    });
  }
  assert.equal(getOrderAlertTiming({ ...deposit, delivery_date: "2026-10-31" }, order, today), null);
});

test("alert dates follow Laos calendar days across midnight, month and year boundaries", () => {
  assert.equal(getOrderAlertToday(new Date("2026-10-26T16:59:59Z")), "2026-10-26");
  assert.equal(getOrderAlertToday(new Date("2026-10-26T17:00:00Z")), today);
  assert.equal(getOrderAlertEndDate(today), "2026-10-30");
  assert.equal(getOrderAlertEndDate("2026-10-30"), "2026-11-02");
  assert.equal(getOrderAlertEndDate("2026-12-30"), "2027-01-02");
  assert.equal(getOrderAlertEndDate("2028-02-27"), "2028-03-01");
});

test("finished orders remain excluded from both overdue and upcoming alerts", () => {
  for (const delivery_date of ["2026-10-26", "2026-10-30"]) {
    for (const state of [
      { status: "completed" }, { closed_at: today }, { production_completed_at: today },
      { shipment_status: "shipped" }, { shipment_completed_at: today }, { id: "other-order" },
    ]) {
      assert.equal(getOrderAlertTiming({ ...deposit, delivery_date }, { ...order, ...state }, today), null);
    }
    assert.equal(getOrderAlertTiming({ ...deposit, delivery_date }, null, today), null);
  }
});

test("unconverted, unsent and invalid-date deposits cannot trigger alerts", () => {
  for (const changes of [
    { status: "draft" }, { order_id: null }, { production_sent_date: "2026-10-28" },
    { production_sent_date: null }, { delivery_date: null }, { delivery_date: "2026-02-30" },
  ]) {
    assert.equal(getOrderAlertTiming({ ...deposit, ...changes }, order, today), null);
  }
});

test("a factory receipt suppresses alerts even when production completion was not saved", async () => {
  const client = {
    from(table) {
      return {
        select() {
          return {
            async in() {
              return { data: table === "orders" ? [order] : [{ order_id: order.id }], error: null };
            },
          };
        },
      };
    },
  };
  assert.deepEqual(await fetchOrderAlertOrdersWithClient(client, [order.id]), []);
});

test("navigation badge counts overdue and upcoming orders using the same cutoff and exclusions", async () => {
  const { outputText } = ts.transpileModule(readFileSync(new URL("../lib/nav-badge-counts.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const compiled = { exports: {} };
  const dependencies = {
    "@/lib/order-alerts": { ...orderAlerts, getOrderAlertToday: () => today },
    "@/lib/factory-deposit-orders": { canManageAllFactoryDepositOrders: () => true },
    "@/lib/transport-notes": { canManageAllTransportNotes: () => true },
    "@/lib/supabase": {},
  };
  new Function("require", "module", "exports", outputText)(name => dependencies[name], compiled, compiled.exports);
  const deposits = ["2026-10-26", today, "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-10-28", "2026-10-29"]
    .map((delivery_date, index) => ({ ...deposit, id: `deposit-${index}`, order_id: `order-${index}`, delivery_date }));
  const orders = deposits.map(row => ({ ...order, id: row.order_id, production_completed_at: row.id === "deposit-7" ? today : null }));
  const client = {
    from(table) {
      const filters = [];
      const query = {
        select() { return query; },
        then(resolve) {
          let data = [];
          if (table === "factory_deposit_orders" && filters.some(([method, field, value]) => method === "eq" && field === "status" && value === "converted")) {
            assert.ok(filters.some(([method, field, value]) => method === "lte" && field === "delivery_date" && value === "2026-10-30"));
            data = deposits.filter(row => row.delivery_date <= getOrderAlertEndDate(today));
          } else if (table === "orders") data = orders;
          else if (table === "factory_receipt_items") data = [{ order_id: "order-6" }];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      for (const method of ["eq", "not", "lte", "in", "neq"]) {
        query[method] = (...args) => { filters.push([method, ...args]); return query; };
      }
      return query;
    },
  };
  const badges = await compiled.exports.fetchNavBadgeCountsWithClient(client, { id: "qa", role: "superadmin" });
  assert.equal(badges["/order-alerts"].count, 5);
  for (let index = 0; index < 5; index++) assert.ok(badges["/order-alerts"].signature.includes(`deposit-${index}:`));
  for (let index = 5; index < 8; index++) assert.equal(badges["/order-alerts"].signature.includes(`deposit-${index}:`), false);
});
