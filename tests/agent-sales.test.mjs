import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadTs(path, dependencies = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", outputText)(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, compiled, compiled.exports);
  return compiled.exports;
}
const sales = loadTs("../lib/agent-sales.ts");
const permissions = loadTs("../lib/user-permissions.ts", { "@/lib/app-navigation": loadTs("../lib/app-navigation.ts") });
const access = loadTs("../lib/access-control.ts", { "@/lib/user-permissions": permissions });
const deposits = loadTs("../lib/factory-deposit-orders.ts");

test("paid shirts earn 2500 each; free shirts, extra sizes and pants are not counted twice", () => {
  const order = { short_qty: 80, long_qty: 20, free_qty: 5, qty_3xl: 10, pants_qty: 50, net_total: 9000000, agent_commission_rate_lak: 2500 };
  assert.equal(sales.paidAgentShirts(order), 100);
  assert.equal(sales.agentOrderCommission(order), 250000);
  assert.deepEqual(sales.summarizeAgentSales([order]), { orders: 1, paidShirts: 100, freeShirts: 5, salesLak: 9000000, commissionLak: 250000 });
  assert.equal(sales.agentOrderCommission({ ...order, short_qty: 0, long_qty: 0 }), 0);
});

test("empty months, negative legacy quantities and snapshotted rates are deterministic", () => {
  assert.equal(sales.summarizeAgentSales([]).commissionLak, 0);
  assert.equal(sales.agentOrderCommission({ short_qty: -5, long_qty: 2, agent_commission_rate_lak: 2500 }), 5000);
  assert.equal(sales.agentOrderCommission({ short_qty: 2, long_qty: 0, agent_commission_rate_lak: 3000 }), 6000);
});

test("creation periods use Laos midnight, exclusive month ends and year rollover", () => {
  assert.deepEqual(sales.agentSalesPeriod(2026, 11), { start: "2026-11-01T00:00:00+07:00", endExclusive: "2026-12-01T00:00:00+07:00" });
  assert.equal(new Date(sales.agentSalesPeriod(2026, 11).start).toISOString(), "2026-10-31T17:00:00.000Z");
  assert.equal(sales.agentSalesPeriod(2026, 12).endExclusive, "2027-01-01T00:00:00+07:00");
  for (const pair of [[2026,0],[2026,13],[2026,1.5],[NaN,1],[1999,1]]) assert.throws(() => sales.agentSalesPeriod(...pair));
});

test("agents can open exactly the requested pages and real edit URL", () => {
  for (const path of ["/orders","/orders/new","/orders/00000000-0000-4000-8000-000000000001/edit","/order-alerts","/design-queue","/design-queue/completed","/design-queue/assets","/quotations","/quotations/new","/factory-deposit-orders","/factory-deposit-orders/new","/factory-receipts/orders","/shipments","/shipments/notes"]) {
    assert.equal(access.canAccessPath(path, "agent"), true, path);
    assert.equal(access.canAccessPath(`${path}/`, "agent"), true, path);
  }
  assert.equal(access.getDefaultPathForRole("agent"), "/orders");
});

test("employee overrides cannot expand agent boundaries or unlock other subpages", () => {
  const accessSettings = Object.fromEntries(permissions.ACCESS_PERMISSION_ITEMS.map(item => [item.key, "allow"]));
  for (const path of ["/dashboard","/orders/123","/orders/123/edit/extra","/orders/new/extra","/users","/payments","/reports/agent-sales","/factory-deposit-orders/new/unknown","/factory-receipts","/shipments/approvals","/shipments/cod","/shipments/transport-note","/design-queue/assets/unknown","/design-queue/completed/unknown"]) {
    assert.equal(access.canAccessPath(path, "agent", { access: accessSettings }), false, path);
  }
  assert.equal(access.canAccessPath("/orders/new", "agent", { access: { "/orders": "deny" } }), false);
});

test("agent deposit ownership follows the selling agent even when staff created the document", () => {
  assert.equal(deposits.canViewFactoryDepositOrder({ agent_user_id: "a", created_by_user_id: "admin" }, "agent", "a"), true);
  assert.equal(deposits.canViewFactoryDepositOrder({ agent_user_id: "b", created_by_user_id: "a" }, "agent", "a"), false);
  assert.equal(deposits.canViewFactoryDepositOrder({ agent_user_id: null, created_by_user_id: "a" }, "agent", "a"), false);
  assert.equal(deposits.canViewFactoryDepositOrder({ created_by_user_id: "a" }, "staff", "a"), true);
  assert.equal(deposits.canViewFactoryDepositOrder({ created_by_user_id: "b" }, "admin", "a"), true);
  assert.equal(deposits.canEditFactoryDepositOrder("draft", "agent"), true);
  assert.equal(deposits.canEditFactoryDepositOrder("submitted", "agent"), false);
  assert.equal(deposits.canEditFactoryDepositOrder("approved", "agent"), false);
  assert.equal(deposits.canEditFactoryDepositOrder("converted", "agent"), false);
  assert.equal(deposits.canApproveFactoryDepositOrder("agent"), false);
  assert.equal(deposits.canConvertFactoryDepositOrder("agent"), false);
  assert.equal(deposits.canConvertFactoryDepositOrder("accountant"), false);
  assert.equal(deposits.canConvertFactoryDepositOrder("superadmin"), true);
  assert.equal(deposits.canApproveFactoryDepositOrder("accountant", { agent_user_id: null }), true);
  assert.equal(deposits.canApproveFactoryDepositOrder("accountant", { agent_user_id: "a" }), false);
  assert.equal(deposits.canApproveFactoryDepositOrder("superadmin", { agent_user_id: "a" }), true);
  assert.equal(deposits.canDeleteFactoryDepositOrder("agent"), false);
});

function routeFixture(actor, rows = []) {
  const queries = [];
  const db = { from(table) {
    assert.equal(table, "orders", "An agent must never fetch other profiles");
    const operations = [];
    queries.push(operations);
    const q = Object.fromEntries(["select","not","gte","lt","order","range","eq"].map(method => [method, (...args) => { operations.push([method,...args]); return q; }]));
    q.then = resolve => {
      const range = operations.find(op => op[0] === "range");
      return resolve({ data: range ? rows.slice(range[1], range[2] + 1) : rows, error: null });
    };
    return q;
  } };
  const route = loadTs("../app/api/agent-sales/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    "@/lib/admin-api-auth": { getActorFromAuthHeader: async () => actor },
    "@/lib/supabase-admin": { getSupabaseAdmin: () => db },
    "@/lib/agent-sales": sales,
    "@/lib/report-query": loadTs("../lib/report-query.ts"),
  });
  const request = params => ({ headers: new Headers(), nextUrl: new URL(`https://test.local/api/agent-sales?${params}`) });
  return { route, queries, request };
}

test("report API authenticates, rejects cross-agent requests and validates periods before querying", async () => {
  const actor = { role: "agent", profileId: "00000000-0000-4000-8000-000000000001" };
  const f = routeFixture(actor);
  assert.equal((await f.route.GET(f.request("year=2026&month=11&agentId=00000000-0000-4000-8000-000000000002"))).status, 403);
  assert.equal((await f.route.GET(f.request("year=2026&month=13"))).status, 400);
  assert.equal(f.queries.length, 0);
  const unauth = routeFixture(null);
  assert.equal((await unauth.route.GET(unauth.request("year=2026&month=11"))).status, 403);
});

test("agent report always filters by verified profile ID and created_at; no staff selector leaks", async () => {
  const actor = { role: "agent", profileId: "00000000-0000-4000-8000-000000000001" };
  const f = routeFixture(actor);
  const response = await f.route.GET(f.request("year=2026&month=11"));
  assert.deepEqual(response.body.agents, []);
  assert.deepEqual(response.body.summary, sales.summarizeAgentSales([]));
  assert.ok(f.queries[0].some(op => op[0] === "eq" && op[1] === "agent_user_id" && op[2] === actor.profileId));
  assert.ok(f.queries[0].some(op => op[0] === "gte" && op[1] === "created_at"));
  assert.ok(!f.queries[0].some(op => op[1] === "order_date"));
  assert.equal(response.headers["Cache-Control"], "private, no-store");
});

test("reports aggregate every database page instead of truncating at 1000 orders", async () => {
  const actor = { role: "agent", profileId: "00000000-0000-4000-8000-000000000001" };
  const rows = Array.from({ length: 1201 }, (_, i) => ({ id: String(i), short_qty: 1, long_qty: 0, free_qty: 1, net_total: 50000, agent_commission_rate_lak: 2500 }));
  const f = routeFixture(actor, rows);
  const response = await f.route.GET(f.request("year=2026&month=11"));
  assert.equal(f.queries.length, 3);
  assert.equal(response.body.orders.length, 1201);
  assert.equal(response.body.summary.commissionLak, 1201 * 2500);
});
