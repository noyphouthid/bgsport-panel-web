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

function routeFixture(actor) {
  let queryCount = 0;
  const { GET } = loadTs("../app/api/shipments/approvals/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/admin-api-auth": { getActorFromAuthHeader: async () => actor },
    "@/lib/supabase-admin": { getSupabaseAdmin: () => ({ from: () => {
      queryCount += 1;
      const result = { data: [], error: null };
      return { select: () => ({ order: async () => result, eq: async () => result }) };
    } }) },
    "@/lib/transport-notes": { isTransportNoteDeposited: () => true },
  });
  return { GET, queryCount: () => queryCount };
}

test("approvals API distinguishes authentication from role restrictions", async () => {
  for (const [actor, status, code] of [[null, 401, "no_session"], [{ role: "staff" }, 403, "forbidden"], [{ role: "admin" }, 403, "forbidden"]]) {
    const fixture = routeFixture(actor);
    const response = await fixture.GET({ headers: new Headers() });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error, code);
    assert.notEqual(body.message, "forbidden");
    assert.equal(fixture.queryCount(), 0);
  }
});

test("verified superadmin can load the approvals API", async () => {
  const fixture = routeFixture({ role: "superadmin", profileId: profile.id });
  const response = await fixture.GET({ headers: new Headers() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.viewerUserId, profile.id);
  assert.deepEqual(body.rows, []);
});
