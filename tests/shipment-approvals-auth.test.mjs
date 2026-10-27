import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadTs(path, dependencies, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const compiledModule = { exports: {} };
  const require = (name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  };
  new Function("require", "module", "exports", ...Object.keys(globals), outputText)(
    require, compiledModule, compiledModule.exports, ...Object.values(globals)
  );
  return compiledModule.exports;
}

const authUser = { id: "auth-1", email: "owner@example.test" };
const profile = {
  id: "profile-1", auth_user_id: authUser.id, email: authUser.email,
  full_name: "Owner", role: "superadmin", is_active: true,
};

function authFixture({ user = authUser, userError = null, rows = [profile], publicUser, publicKey = false } = {}) {
  const lookups = [];
  let publicCalls = 0;
  const admin = {
    auth: { getUser: async (token) => {
      assert.equal(token, "access-token");
      return { data: { user }, error: userError };
    } },
    from: (table) => {
      assert.equal(table, "users");
      let found;
      const query = {
        select: () => query,
        eq: (key, value) => { lookups.push(key); found = rows.find((row) => row[key] === value); return query; },
        ilike: (key, value) => { lookups.push(key); found = rows.find((row) => row[key].toLowerCase() === value); return query; },
        maybeSingle: async () => ({ data: found ?? null, error: null }),
      };
      return query;
    },
  };
  const api = loadTs("../lib/admin-api-auth.ts", {
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => {
      publicCalls += 1;
      return { data: { user: publicUser ?? null }, error: publicUser ? null : new Error("invalid token") };
    } } }) },
    "@/lib/supabase-admin": { getSupabaseAdmin: () => admin },
    "@/lib/role-groups": { normalizeRole: (role) => String(role || "").trim().toLowerCase() },
  }, { process: { env: publicKey ? { NEXT_PUBLIC_SUPABASE_URL: "https://example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key" } : {} } });
  return { ...api, lookups, publicCalls: () => publicCalls };
}

test("verified superadmin does not require the optional public auth client", async () => {
  const fixture = authFixture();
  const actor = await fixture.getAdminActorFromAuthHeader("Bearer access-token");
  assert.equal(actor.profileId, profile.id);
  assert.equal(actor.role, "superadmin");
  assert.equal(fixture.publicCalls(), 0);
});

test("public auth fallback verifies the token before loading a profile", async () => {
  const fixture = authFixture({ user: null, userError: new Error("service auth failed"), publicKey: true, publicUser: authUser });
  assert.equal((await fixture.getAdminActorFromAuthHeader("Bearer access-token")).profileId, profile.id);
  assert.equal(fixture.publicCalls(), 1);
});

test("invalid tokens and missing authorization never query profiles", async () => {
  const fixture = authFixture({ user: null, userError: new Error("invalid token"), publicKey: true });
  assert.equal(await fixture.getAdminActorFromAuthHeader(null), null);
  assert.equal(await fixture.getAdminActorFromAuthHeader("Bearer access-token"), null);
  assert.deepEqual(fixture.lookups, []);
});

test("inactive accounts and other roles cannot become admin actors", async () => {
  for (const row of [{ ...profile, is_active: false }, { ...profile, role: "staff" }]) {
    const fixture = authFixture({ rows: [row] });
    assert.equal(await fixture.getAdminActorFromAuthHeader("Bearer access-token"), null);
  }
});

test("legacy profiles can still resolve by verified email", async () => {
  const fixture = authFixture({ rows: [{ ...profile, auth_user_id: null }] });
  assert.equal((await fixture.getAdminActorFromAuthHeader("Bearer access-token")).profileId, profile.id);
  assert.deepEqual(fixture.lookups, ["auth_user_id", "email"]);
});

function fetchFixture({ responses = [200], session = { access_token: "old-token" }, refresh = { access_token: "new-token" }, refreshError = null } = {}) {
  const requests = [];
  let refreshCount = 0;
  const { authenticatedFetch } = loadTs("../lib/authenticated-fetch.ts", {
    "@/lib/supabase": { supabase: { auth: {
      getSession: async () => ({ data: { session }, error: null }),
      refreshSession: async () => { refreshCount += 1; return { data: { session: refresh }, error: refreshError }; },
    } } },
  }, { fetch: async (url, init) => {
    requests.push({ url, init });
    return new Response("{}", { status: responses.shift() });
  } });
  return { authenticatedFetch, requests, refreshCount: () => refreshCount };
}

test("expired token is refreshed once and the new token is sent", async () => {
  const fixture = fetchFixture({ responses: [401, 200] });
  const response = await fixture.authenticatedFetch("/api/shipments/approvals", { headers: { "X-Test": "kept" } });
  assert.equal(response.status, 200);
  assert.equal(fixture.refreshCount(), 1);
  assert.deepEqual(fixture.requests.map(({ init }) => init.headers.get("Authorization")), ["Bearer old-token", "Bearer new-token"]);
  assert.equal(fixture.requests[1].init.headers.get("X-Test"), "kept");
});

test("forbidden responses do not refresh or retry", async () => {
  const fixture = fetchFixture({ responses: [403] });
  assert.equal((await fixture.authenticatedFetch("/api/shipments/approvals")).status, 403);
  assert.equal(fixture.refreshCount(), 0);
  assert.equal(fixture.requests.length, 1);
});

test("a second unauthorized response ends the retry", async () => {
  const fixture = fetchFixture({ responses: [401, 401] });
  assert.equal((await fixture.authenticatedFetch("/api/shipments/approvals")).status, 401);
  assert.equal(fixture.refreshCount(), 1);
  assert.equal(fixture.requests.length, 2);
});

test("missing and revoked sessions return a readable sign-in message", async () => {
  for (const options of [{ session: null }, { responses: [401], refresh: null, refreshError: new Error("revoked") }]) {
    const fixture = fetchFixture(options);
    await assert.rejects(fixture.authenticatedFetch("/api/shipments/approvals"), /ເຂົ້າລະບົບໃໝ່/);
    assert.ok(fixture.requests.length <= 1);
  }
});

const shipmentTypes = loadTs("../lib/shipment-delivery-requests.ts", {});
const transportNotes = loadTs("../lib/transport-notes.ts", {});

function apiRequest(status) {
  return new Request(`http://localhost/api/shipments/approvals${status === undefined ? "" : `?status=${status}`}`);
}

function routeFixture(actor, { requests = [], notes = [], orders = [], users = [], errors = {} } = {}) {
  const calls = [], active = {}, maxActive = {};
  const tables = { shipment_delivery_requests: requests, transport_notes: notes, orders, users };
  const { GET } = loadTs("../app/api/shipments/approvals/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/admin-api-auth": { getActorFromAuthHeader: async () => actor },
    "@/lib/shipment-delivery-requests": shipmentTypes,
    "@/lib/supabase-admin": { getSupabaseAdmin: () => ({ from: (table) => {
      let data = tables[table];
      const call = { table, filters: [] };
      calls.push(call);
      const query = {
        select: () => query,
        order: () => query,
        eq: (key, value) => { call.filters.push([key, value]); data = data.filter(row => row[key] === value); return query; },
        in: (key, values) => { call.ids = values; data = data.filter(row => values.includes(row[key])); return query; },
        range: (from, to) => { call.range = [from, to]; data = data.slice(from, to + 1); return query; },
        then: (resolve, reject) => (async () => {
          active[table] = (active[table] || 0) + 1;
          maxActive[table] = Math.max(maxActive[table] || 0, active[table]);
          await new Promise(done => setImmediate(done));
          active[table] -= 1;
          return { data, error: errors[table] || null };
        })().then(resolve, reject),
      };
      return query;
    } }) },
    "@/lib/transport-notes": transportNotes,
  });
  return { GET, calls, maxActive, queryCount: () => calls.length };
}

test("approvals API distinguishes authentication from role restrictions", async () => {
  for (const [actor, status, code] of [[null, 401, "no_session"], [{ role: "staff" }, 403, "forbidden"], [{ role: "admin" }, 403, "forbidden"]]) {
    const fixture = routeFixture(actor);
    const response = await fixture.GET(apiRequest());
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error, code);
    assert.notEqual(body.message, "forbidden");
    assert.equal(fixture.queryCount(), 0);
  }
});

test("verified superadmin can load the approvals API", async () => {
  const fixture = routeFixture({ role: "superadmin", profileId: profile.id });
  const response = await fixture.GET(apiRequest());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.viewerUserId, profile.id);
  assert.deepEqual(body.rows, []);
});

const adminActor = { role: "superadmin", profileId: profile.id };
const requestRow = (id, overrides = {}) => ({
  id, order_id: `order-${id}`, status: "submitted", delivery_method: "pickup",
  requested_by_user_id: profile.id, ...overrides,
});

test("default pending queue skips history and hydrates only visible requests", async () => {
  const requests = [
    requestRow("pickup"), requestRow("deposited", { delivery_method: "transport" }),
    requestRow("receipt", { delivery_method: "transport" }),
    requestRow("waiting", { delivery_method: "transport" }),
    requestRow("missing", { delivery_method: "transport" }),
    requestRow("history", { status: "delivered" }),
  ];
  const fixture = routeFixture(adminActor, {
    requests, users: [profile], orders: requests.map(row => ({ id: row.order_id })),
    notes: [
      { id: "n1", delivery_request_id: "deposited", transport_deposited_at: "2026-01-01" },
      { id: "n2", delivery_request_id: "receipt", transport_deposit_receipt_id: "receipt-1" },
      { id: "n3", delivery_request_id: "waiting" },
    ],
  });
  const response = await fixture.GET(apiRequest());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.rows.map(row => row.id), ["pickup", "deposited", "receipt"]);
  assert.deepEqual(Object.keys(body.ordersById), ["order-pickup", "order-deposited", "order-receipt"]);
  assert.deepEqual(Object.keys(body.usersById), [profile.id]);
  assert.deepEqual(fixture.calls[0].filters, [["status", "submitted"]]);
  assert.deepEqual(fixture.calls.find(call => call.table === "transport_notes").ids, ["deposited", "receipt", "waiting", "missing"]);
});

test("an empty pending queue makes no related-table queries", async () => {
  const fixture = routeFixture(adminActor, { requests: [requestRow("done", { status: "delivered" })] });
  const body = await (await fixture.GET(apiRequest())).json();
  assert.deepEqual(body.rows, []);
  assert.equal(fixture.queryCount(), 1);
});

test("status changes and all-history keep their full search dataset", async () => {
  for (const [status, expected] of [["rejected", ["rejected"]], ["all", ["pending", "rejected", "done"]]]) {
    const fixture = routeFixture(adminActor, { requests: [requestRow("pending"), requestRow("rejected", { status: "rejected" }), requestRow("done", { status: "delivered" })] });
    const body = await (await fixture.GET(apiRequest(status))).json();
    assert.deepEqual(body.rows.map(row => row.id), expected);
  }
});

test("invalid statuses are rejected before any data queries", async () => {
  for (const status of ["unknown", "toString", ""]) {
    const fixture = routeFixture(adminActor);
    assert.equal((await fixture.GET(apiRequest(status))).status, 400);
    assert.equal(fixture.queryCount(), 0);
  }
});

test("queues above the database default limit are not silently truncated", async () => {
  const requests = Array.from({ length: 1005 }, (_, i) => requestRow(`r${i}`, { order_id: null, requested_by_user_id: null }));
  const fixture = routeFixture(adminActor, { requests });
  const body = await (await fixture.GET(apiRequest())).json();
  assert.equal(body.rows.length, 1005);
  assert.deepEqual(fixture.calls.map(call => call.range), [[0, 499], [500, 999], [1000, 1499]]);
});

test("transport batch lookups run concurrently with a bound of four", async () => {
  const requests = Array.from({ length: 450 }, (_, i) => requestRow(`r${i}`, { delivery_method: "transport" }));
  const notes = requests.map(row => ({ id: `n-${row.id}`, delivery_request_id: row.id, transport_deposited_at: "2026-01-01" }));
  const fixture = routeFixture(adminActor, { requests, notes });
  const body = await (await fixture.GET(apiRequest())).json();
  assert.equal(body.rows.length, 450);
  assert.equal(fixture.maxActive.transport_notes, 4);
  assert.equal(fixture.maxActive.orders, 4);
  assert.equal(fixture.calls.filter(call => call.table === "transport_notes").length, 5);
});

test("query failures return the failing step instead of partial success", async () => {
  for (const [table, step] of [["shipment_delivery_requests", "load_requests"], ["transport_notes", "load_transport_notes"], ["orders", "load_orders"], ["users", "load_users"]]) {
    const fixture = routeFixture(adminActor, {
      requests: [requestRow("r1", { delivery_method: "transport" })],
      notes: [{ id: "n1", delivery_request_id: "r1", transport_deposited_at: "2026-01-01" }],
      errors: { [table]: { message: "query failed" } },
    });
    const response = await fixture.GET(apiRequest());
    assert.equal(response.status, 500);
    assert.match((await response.json()).message, new RegExp(`${step}: query failed`));
  }
});
