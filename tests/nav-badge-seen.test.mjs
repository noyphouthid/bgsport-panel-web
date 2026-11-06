import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as navBadgeSeen from "../lib/nav-badge-seen.ts";
import * as reportQuery from "../lib/report-query.ts";
import {
  buildSeenQueryValue,
  countNewerThan,
  getActiveBadgePath,
  getLatestMarker,
  getVisibleBadgeCount,
  isNewerMarker,
  mergeSeenMarkers,
  parseSeenMarkers,
} from "../lib/nav-badge-seen.ts";

const T1 = "2026-11-06T01:00:00+00:00";
const T2 = "2026-11-06T02:00:00.5+00:00";
const T3 = "2026-11-06T03:00:00+00:00";

test("marker order follows time, including fractional seconds", () => {
  assert.equal(isNewerMarker("2026-11-06T01:00:00.5+00:00", "2026-11-06T01:00:00+00:00"), true);
  assert.equal(isNewerMarker("2026-11-06T01:00:00.123+00:00", "2026-11-06T01:00:00.12+00:00"), true);
  assert.equal(isNewerMarker(T1, T1), false);
  assert.equal(getLatestMarker([T1, null, T3, T2]), T3);
  assert.equal(getLatestMarker([]), null);
});

test("only rows after the seen marker count, and everything counts before first view", () => {
  assert.equal(countNewerThan([T1, T2, T3, null], T1), 2);
  assert.equal(countNewerThan([T1, T2], undefined), 2);
  assert.equal(countNewerThan([T1], T1), 0);
});

test("seen input drops unknown paths, bad timestamps and signature pages", () => {
  const seen = parseSeenMarkers(JSON.stringify({
    "/orders": T1,
    "/evil": T1,
    "/payments": "2026-01-01,id.gt.0",
    "/order-alerts": T1,
    "/quotations": 5,
  }));
  assert.deepEqual(seen, { "/orders": T1 });
  assert.deepEqual(parseSeenMarkers("not json"), {});
  assert.deepEqual(parseSeenMarkers(null), {});
  assert.deepEqual(parseSeenMarkers("[1]"), {});
});

test("signature values are never sent to the server", () => {
  assert.deepEqual(JSON.parse(buildSeenQueryValue({ "/orders": T1, "/order-alerts": "a|b" })), { "/orders": T1 });
});

test("the deepest matching page is the active one", () => {
  assert.equal(getActiveBadgePath("/factory-receipts/orders"), "/factory-receipts/orders");
  assert.equal(getActiveBadgePath("/factory-receipts"), "/factory-receipts");
  assert.equal(getActiveBadgePath("/orders/abc/edit"), "/orders");
  assert.equal(getActiveBadgePath("/factory-production-queue/records"), "/factory-production-queue/records");
  assert.equal(getActiveBadgePath("/shipments"), null);
  assert.equal(getActiveBadgePath("/orders-archive"), null);
});

test("visible count is zero on the open page and once the marker is seen", () => {
  const entry = { count: 3, marker: T2, mode: "timestamp" };
  assert.equal(getVisibleBadgeCount("/orders", entry, {}, null), 3);
  assert.equal(getVisibleBadgeCount("/orders", entry, {}, "/orders"), 0);
  assert.equal(getVisibleBadgeCount("/orders", entry, { "/orders": T2 }, null), 0);
  assert.equal(getVisibleBadgeCount("/orders", entry, { "/orders": T1 }, null), 3);
  assert.equal(getVisibleBadgeCount("/orders", { ...entry, count: 0 }, {}, null), 0);
  assert.equal(getVisibleBadgeCount("/orders", undefined, {}, null), 0);
});

test("signature pages hide only while the signature is unchanged", () => {
  const entry = { count: 2, marker: "a|b", mode: "signature" };
  assert.equal(getVisibleBadgeCount("/order-alerts", entry, { "/order-alerts": "a|b" }, null), 0);
  assert.equal(getVisibleBadgeCount("/order-alerts", entry, { "/order-alerts": "a" }, null), 2);
});

test("viewing advances the marker, feeds start a baseline, and work queues keep waiting", () => {
  const counts = {
    "/orders": { count: 2, marker: T3, mode: "timestamp" },
    "/payments": { count: 0, marker: T2, mode: "timestamp", baseline: true },
    "/design-queue": { count: 5, marker: T2, mode: "timestamp" },
  };
  assert.deepEqual(mergeSeenMarkers({ "/orders": T1 }, counts, "/orders"), { "/orders": T3, "/payments": T2 });
  assert.deepEqual(mergeSeenMarkers({ "/orders": T1, "/payments": T1 }, counts, null), { "/orders": T1, "/payments": T1 });
});

test("merging never moves a marker backwards and keeps the same object when unchanged", () => {
  const seen = { "/orders": T3 };
  assert.equal(mergeSeenMarkers(seen, { "/orders": { count: 0, marker: T1, mode: "timestamp" } }, "/orders"), seen);
  assert.equal(mergeSeenMarkers(seen, { "/orders": { count: 0, marker: null, mode: "timestamp" } }, "/orders"), seen);
});

function loadCounts(allowedPaths) {
  const { outputText } = ts.transpileModule(readFileSync(new URL("../lib/nav-badge-counts.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const compiled = { exports: {} };
  const dependencies = {
    "@/lib/order-alerts": {},
    "@/lib/factory-deposit-orders": { canViewAllFactoryDepositOrders: () => true },
    "@/lib/transport-notes": { canManageAllTransportNotes: () => true },
    "@/lib/supabase": {},
    "@/lib/access-control": { canAccessPath: path => allowedPaths.includes(path) },
    "@/lib/nav-badge-seen": navBadgeSeen,
    "@/lib/report-query": reportQuery,
  };
  new Function("require", "module", "exports", outputText)(name => dependencies[name], compiled, compiled.exports);
  return compiled.exports.fetchNavBadgeCountsWithClient;
}

function fakeClient(tables) {
  const calls = [];
  return {
    calls,
    from(table) {
      const state = { table, filters: [], head: false };
      calls.push(state);
      const query = {
        select(_columns, options) { state.head = options?.head === true; return query; },
        then(resolve, reject) {
          const source = tables[table];
          if (source instanceof Error) return Promise.resolve({ data: null, error: source }).then(resolve, reject);
          return Promise.resolve(source(state)).then(resolve, reject);
        },
      };
      for (const method of ["eq", "neq", "not", "in", "is", "or", "gt", "lte", "order", "limit", "range"]) {
        query[method] = (...args) => { state.filters.push([method, ...args]); return query; };
      }
      return query;
    },
  };
}

const profile = { id: "qa", role: "superadmin" };
const quiet = async (run) => {
  const original = console.error;
  console.error = () => {};
  try { return await run(); } finally { console.error = original; }
};

test("a work queue shows all pending first, then only rows changed since the last view", async () => {
  const fetchCounts = loadCounts(["/design-queue"]);
  const client = fakeClient({ design_queue_entries: () => ({ data: [{ updated_at: T1 }, { updated_at: T2 }, { updated_at: T3 }], error: null }) });
  assert.deepEqual(await fetchCounts(client, profile), { "/design-queue": { count: 3, marker: T3, mode: "timestamp" } });
  assert.equal((await fetchCounts(client, profile, { "/design-queue": T2 }))["/design-queue"].count, 1);
  assert.equal((await fetchCounts(client, profile, { "/design-queue": T3 }))["/design-queue"].count, 0);
});

test("a feed starts quiet, then lets the database count rows after the seen marker", async () => {
  const fetchCounts = loadCounts(["/payments"]);
  const client = fakeClient({
    payment_transactions: (state) => (state.head ? { data: null, count: 4, error: null } : { data: [{ created_at: T3 }], error: null }),
  });
  assert.deepEqual(await fetchCounts(client, profile), { "/payments": { count: 0, marker: T3, mode: "timestamp", baseline: true } });
  assert.equal(client.calls.some((call) => call.head), false, "first visit must not count history");

  const later = await fetchCounts(client, profile, { "/payments": T1 });
  assert.equal(later["/payments"].count, 4);
  const counted = client.calls.find((call) => call.head);
  assert.deepEqual(counted.filters, [["gt", "created_at", T1]]);
});

test("pages the viewer cannot open are neither queried nor returned", async () => {
  const fetchCounts = loadCounts(["/design-queue"]);
  const client = fakeClient({ design_queue_entries: () => ({ data: [], error: null }) });
  const counts = await fetchCounts(client, profile);
  assert.deepEqual(Object.keys(counts), ["/design-queue"]);
  assert.deepEqual(client.calls.map((call) => call.table), ["design_queue_entries"]);
});

test("one failing page does not remove the other badges", async () => {
  const fetchCounts = loadCounts(["/design-queue", "/shipments/approvals"]);
  const client = fakeClient({
    design_queue_entries: new Error("boom"),
    shipment_delivery_requests: () => ({ data: [{ updated_at: T1 }], error: null }),
  });
  const counts = await quiet(() => fetchCounts(client, profile));
  assert.deepEqual(Object.keys(counts), ["/shipments/approvals"]);
});

test("receipt orders count only received open orders, and a new item counts as activity", async () => {
  const fetchCounts = loadCounts(["/factory-receipts/orders"]);
  const client = fakeClient({
    orders: () => ({ data: [{ id: "received", updated_at: T1 }, { id: "not-received", updated_at: T3 }], error: null }),
    factory_receipt_items: () => ({ data: [{ order_id: "received", created_at: T2 }], error: null }),
  });
  const first = await fetchCounts(client, profile);
  assert.deepEqual(first["/factory-receipts/orders"], { count: 1, marker: T2, mode: "timestamp" });
  assert.equal((await fetchCounts(client, profile, { "/factory-receipts/orders": T1 }))["/factory-receipts/orders"].count, 1);
  assert.equal((await fetchCounts(client, profile, { "/factory-receipts/orders": T2 }))["/factory-receipts/orders"].count, 0);
});
