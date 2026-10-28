import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as alerts from "../lib/order-alerts.ts";
import * as quantities from "../lib/order-quantities.ts";
import * as reportQuery from "../lib/report-query.ts";

const dependencies = { "@/lib/order-alerts": alerts, "@/lib/order-quantities": quantities, "@/lib/report-query": reportQuery };
const { outputText } = ts.transpileModule(readFileSync(new URL("../lib/order-alert-report.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const compiled = { exports: {} };
new Function("require", "module", "exports", outputText)(name => dependencies[name], compiled, compiled.exports);
const { fetchOrderAlertReportWithClient, getOrderAlertReportCells, ORDER_ALERT_REPORT_HEADERS } = compiled.exports;
const today = "2026-10-28";
const deposit = {
  id: "deposit-1", order_id: "order-1", order_code: "BG-001", factory_bill_code: null,
  production_sent_date: "2026-10-01", delivery_date: "2026-10-23", production_priority: "urgent", status: "converted",
};
const order = {
  id: "order-1", factory_bill_code: "000123", short_qty: 10, long_qty: 5, free_qty: 2,
  status: "in_progress", closed_at: null, production_completed_at: null, shipment_status: "pending", shipment_completed_at: null,
};

function mockClient(deposits, orders, receipts = [], failure = null) {
  const pages = [];
  const client = {
    from(table) {
      let from = 0, to = Infinity, ids;
      const query = {
        select() { return query; }, eq() { return query; }, not() { return query; }, lte() { return query; },
        lt(field, value) { assert.equal(field, "delivery_date"); assert.equal(value, today); return query; },
        order() { return query; },
        range(start, end) { from = start; to = end; pages.push([start, end]); return query; },
        in(_field, values) { ids = values; return query; },
        then(resolve) {
          let data = table === "factory_deposit_orders" ? deposits.slice(from, to + 1) : table === "orders" ? orders : receipts;
          if (ids) data = data.filter(row => ids.includes(table === "orders" ? row.id : row.order_id));
          return Promise.resolve({ data, error: failure?.table === table && from === (failure.from ?? 0) ? { message: "Report query failed" } : null }).then(resolve);
        },
      };
      return query;
    },
  };
  return { client, pages };
}

test("report excludes due-today, future, invalid, unconverted, received and finished orders", async () => {
  const changes = [
    {}, { delivery_date: "2026-10-27", production_priority: "normal", factory_bill_code: "DEP-BILL" },
    { delivery_date: today }, { delivery_date: "2026-10-29" }, { delivery_date: "2026-02-30" },
    { production_sent_date: "2026-10-29" }, { status: "draft" }, {}, {}, {}, {}, {},
  ];
  const deposits = changes.map((change, index) => ({ ...deposit, id: `deposit-${index}`, order_id: `order-${index}`, ...change }));
  const states = [{}, {}, {}, {}, {}, {}, {}, {}, { production_completed_at: today }, { status: "completed" }, { closed_at: today }, { shipment_status: "shipped" }];
  const orders = states.map((state, index) => ({ ...order, id: `order-${index}`, ...state }));
  const { client } = mockClient(deposits.reverse(), orders, [{ order_id: "order-7" }]);
  const rows = await fetchOrderAlertReportWithClient(client, today);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.overdueDays), [5, 1]);
  assert.equal(rows[0].factoryBillCode, "000123");
  assert.equal(rows[1].factoryBillCode, "DEP-BILL");
  assert.equal(ORDER_ALERT_REPORT_HEADERS.length, 8);
  assert.deepEqual(getOrderAlertReportCells(rows[0], 0), [1, "BG-001", "000123", 17, "01/10/2026", "23/10/2026", 5, "ງານດ່ວນ"]);
  assert.equal(getOrderAlertReportCells(rows[1], 1)[7], "ປົກກະຕິ");
});

test("report fetches every page and batches linked orders beyond 500 rows", async () => {
  const deposits = Array.from({ length: 501 }, (_, index) => ({ ...deposit, id: `deposit-${index}`, order_id: `order-${index}` }));
  const orders = deposits.map(row => ({ ...order, id: row.order_id }));
  const { client, pages } = mockClient(deposits, orders);
  const rows = await fetchOrderAlertReportWithClient(client, today);
  assert.equal(rows.length, 501);
  assert.deepEqual(pages, [[0, 499], [500, 999]]);
});

test("query failures reject instead of exporting an incomplete report", async () => {
  const deposits = Array.from({ length: 500 }, () => deposit);
  for (const failure of [{ table: "factory_deposit_orders", from: 500 }, { table: "orders" }, { table: "factory_receipt_items" }]) {
    const { client } = mockClient(deposits, [order], [], failure);
    await assert.rejects(fetchOrderAlertReportWithClient(client, today), /Report query failed/);
  }
});
