import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Load the real TypeScript modules without adding a test runtime dependency.
function moduleUrl(path, imports = {}) {
  let source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const [specifier, url] of Object.entries(imports)) source = source.replaceAll(specifier, url);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}

const factoryUrl = moduleUrl("lib/lifefootball-order.ts");
const { extractLifefootballOrderId, normalizeLifefootballOrderCode, LIFEFOOTBALL_ORIGIN } = await import(factoryUrl);
const { parseQrInput, extractFactoryBillCode, buildOrderQrCode } = await import(moduleUrl("lib/inventory-qr.ts", {
  "@/lib/lifefootball-order": factoryUrl,
  "@/lib/order-quantities": moduleUrl("lib/order-quantities.ts"),
}));
const serverUrl = moduleUrl("lib/lifefootball-order-server.ts", { "@/lib/lifefootball-order": factoryUrl });
const id = "L-_tmwvfNiYj9RWNUAUmA";
const orderUrl = `${LIFEFOOTBALL_ORIGIN}/agent/orders/${id}`;

test("factory QR links and print links resolve to their complete opaque ID", () => {
  for (const suffix of ["", "/", "?tab=lf", "/factory/print", "/factory/receipt/print", "/receipt/print"]) {
    assert.equal(extractLifefootballOrderId(orderUrl + suffix), id);
    assert.equal(parseQrInput(orderUrl + suffix).kind, "factory_order_url");
    assert.equal(parseQrInput(orderUrl + suffix).factoryBillCode, null);
  }
  const numericIdUrl = `${LIFEFOOTBALL_ORIGIN}/agent/orders/opaque123456`;
  assert.equal(extractFactoryBillCode(numericIdUrl), "");
  assert.equal(parseQrInput(numericIdUrl).kind, "factory_order_url");
});

test("untrusted hosts, credentials, ports, paths, and encoded separators are rejected", () => {
  for (const url of [
    orderUrl.replace("https:", "http:"),
    orderUrl.replace("bgsport.lifefootball.la", "bgsport.lifefootball.la.evil.test"),
    orderUrl.replace("bgsport.lifefootball.la", "bgsport.lifefootball.la:8443"),
    orderUrl.replace("https://", "https://user:secret@"),
    `${LIFEFOOTBALL_ORIGIN}/agent/orders/id%2Fother`,
    `${LIFEFOOTBALL_ORIGIN}/agent/orders/id%5Cother`,
    `${LIFEFOOTBALL_ORIGIN}/agent/orders/id%ZZ`,
    `${LIFEFOOTBALL_ORIGIN}/agent/orders/id/edit`,
    "https://127.0.0.1/agent/orders/123456",
  ]) {
    assert.equal(extractLifefootballOrderId(url), null, url);
    assert.equal(parseQrInput(url).kind, "unknown", url);
  }
});

test("year-prefixed bill numbers retain their year with or without #", () => {
  for (const value of ["26-564653", "#26-564653", " # 26-564653 "]) {
    assert.equal(normalizeLifefootballOrderCode(value), "26-564653");
    assert.equal(extractFactoryBillCode(value), "26-564653");
    assert.deepEqual(parseQrInput(value), { kind: "factory_bill_code", normalized: "26-564653", factoryBillCode: "26-564653" });
  }
  assert.equal(normalizeLifefootballOrderCode("PO-20261006143249-EPG"), null);
});

test("existing shop QR, numeric factory QR, and shop codes remain supported", () => {
  const qr = buildOrderQrCode({ id: "local-id", order_code: "RK26-9097", factory_bill_code: "26-564653" });
  assert.equal(parseQrInput(qr).kind, "shop_qr");
  assert.equal(parseQrInput(qr).factoryBillCode, "26-564653");
  assert.deepEqual(parseQrInput("https://www.tracklifefootball.com/orders/564653/print"), {
    kind: "factory_qr", normalized: "https://www.tracklifefootball.com/orders/564653/print", factoryBillCode: "564653",
  });
  assert.equal(parseQrInput("564653").kind, "factory_bill_code");
  assert.equal(parseQrInput("rk26-9097").normalized, "RK26-9097");
  assert.equal(parseQrInput("").kind, "unknown");
});

function authenticatedResponse() {
  return new Response('{"user":{}}', { headers: { "Set-Cookie": "factory-session=test-session; HttpOnly; Secure; Path=/" } });
}

let moduleId = 0;
async function withFactory(mockFetch, run, configured = true) {
  const previousFetch = globalThis.fetch;
  const previousUsername = process.env.LIFEFOOTBALL_AGENT_USERNAME;
  const previousPassword = process.env.LIFEFOOTBALL_AGENT_PASSWORD;
  globalThis.fetch = mockFetch;
  if (configured) {
    process.env.LIFEFOOTBALL_AGENT_USERNAME = "test-user";
    process.env.LIFEFOOTBALL_AGENT_PASSWORD = "test-password";
  } else {
    delete process.env.LIFEFOOTBALL_AGENT_USERNAME;
    delete process.env.LIFEFOOTBALL_AGENT_PASSWORD;
  }
  try {
    await run(await import(`${serverUrl}#${moduleId++}`));
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of [["LIFEFOOTBALL_AGENT_USERNAME", previousUsername], ["LIFEFOOTBALL_AGENT_PASSWORD", previousPassword]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("authenticated lookup returns h1 order.code, uses fixed origin, and reuses session", async () => {
  let logins = 0;
  await withFactory(async (url, init) => {
    assert.equal(new URL(url).origin, LIFEFOOTBALL_ORIGIN);
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    if (url.endsWith("/sign-in/username")) {
      logins += 1;
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), { username: "test-user", password: "test-password" });
      return authenticatedResponse();
    }
    assert.equal(url, `${LIFEFOOTBALL_ORIGIN}/api/agent-portal/orders/${id}`);
    assert.equal(init.headers.Cookie, "factory-session=test-session");
    assert.equal(init.body, undefined);
    return Response.json({ order: { id, code: "26-564653" }, production: { orderCode: "PO-20261006143249-EPG" } });
  }, async ({ resolveLifefootballOrderCode }) => {
    assert.equal(await resolveLifefootballOrderCode(id), "26-564653");
    assert.equal(await resolveLifefootballOrderCode(id), "26-564653");
    assert.equal(logins, 1);
  });
});

test("an expired session retries login once", async () => {
  let logins = 0;
  let reads = 0;
  await withFactory(async (url) => {
    if (url.endsWith("/sign-in/username")) { logins += 1; return authenticatedResponse(); }
    reads += 1;
    return reads === 1 ? new Response("", { status: 401 }) : Response.json({ order: { id, code: "26-564653" } });
  }, async ({ resolveLifefootballOrderCode }) => {
    assert.equal(await resolveLifefootballOrderCode(id), "26-564653");
    assert.equal(logins, 2);
    assert.equal(reads, 2);
  });
});

test("missing credentials and invalid IDs make no external request", async () => {
  await withFactory(() => { assert.fail("unexpected external request"); }, async ({ resolveLifefootballOrderCode }) => {
    await assert.rejects(() => resolveLifefootballOrderCode(id), { code: "missing_factory_credentials" });
    await assert.rejects(() => resolveLifefootballOrderCode("../other"), { code: "invalid_factory_order_id" });
  }, false);
});

test("lookup errors are explicit and exclude external response contents", async () => {
  const cases = [
    [new Response("secret external error", { status: 404 }), "factory_order_not_found"],
    [new Response("secret external error", { status: 500 }), "factory_order_lookup_failed"],
    [new Response("<html>login</html>"), "invalid_factory_order_response"],
    [Response.json({ order: { id: "wrong-order", code: "26-564653" } }), "invalid_factory_order_response"],
    [Response.json({ order: { id, code: "bad-code" } }), "invalid_factory_order_response"],
  ];
  for (const [response, code] of cases) {
    await withFactory(async (url) => url.endsWith("/sign-in/username") ? authenticatedResponse() : response,
      async ({ resolveLifefootballOrderCode }) => {
        await assert.rejects(() => resolveLifefootballOrderCode(id), (error) => error.code === code && !error.message.includes("secret"));
      });
  }
  await withFactory(async () => new Response("external credential error", { status: 401 }), async ({ resolveLifefootballOrderCode }) => {
    await assert.rejects(() => resolveLifefootballOrderCode(id), { code: "factory_login_failed" });
  });
  await withFactory(async () => { throw new Error("connection failed"); }, async ({ resolveLifefootballOrderCode }) => {
    await assert.rejects(() => resolveLifefootballOrderCode(id), { code: "factory_unavailable" });
  });
});

const permissionsUrl = moduleUrl("lib/user-permissions.ts");
const accessUrl = moduleUrl("lib/access-control.ts", { "@/lib/user-permissions": permissionsUrl });
const require = createRequire(import.meta.url);
function inlineModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function loadRoute({ role = "staff", permissions = {}, profileError = null } = {}) {
  const resolverUrl = inlineModule(`
    export const calls = [];
    export class LifefootballLookupError extends Error {}
    export async function resolveLifefootballOrderCode(id) { calls.push(id); return "26-564653"; }
  `) + `#${moduleId++}`;
  const routeUrl = moduleUrl("app/api/factory-receipts/resolve-order/route.ts", {
    "next/server": pathToFileURL(require.resolve("next/server.js")).href,
    "@/lib/access-control": accessUrl,
    "@/lib/admin-api-auth": inlineModule(`export async function getActorFromAuthHeader(header) {
      return header === "Bearer test-panel-token" ? { profileId: "test-profile", role: ${JSON.stringify(role)} } : null;
    }`),
    "@/lib/lifefootball-order-server": resolverUrl,
    "@/lib/lifefootball-order": factoryUrl,
    "@/lib/supabase-admin": inlineModule(`export function getSupabaseAdmin() {
      return { from() { return { select() { return { eq() { return { async maybeSingle() {
        return { data: { permission_settings: ${JSON.stringify(permissions)} }, error: ${JSON.stringify(profileError)} };
      } }; } }; } }; } };
    }`),
    "@/lib/user-permissions": permissionsUrl,
  });
  return { ...await import(routeUrl), ...await import(resolverUrl) };
}

function panelRequest(url = orderUrl, authenticated = true) {
  return new Request("https://panel.test/api/factory-receipts/resolve-order", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: "Bearer test-panel-token" } : {}) },
    body: JSON.stringify({ url }),
  });
}

test("panel API enforces authentication and receipt permissions before factory access", async () => {
  const unauthenticated = await loadRoute();
  assert.equal((await unauthenticated.POST(panelRequest(orderUrl, false))).status, 403);
  assert.equal(unauthenticated.calls.length, 0);
  for (const settings of [
    { permissions: { access: { "/factory-receipts": "deny" } } },
    { role: "graphic" },
    { profileError: { message: "permission lookup failed" } },
  ]) {
    const route = await loadRoute(settings);
    assert.equal((await route.POST(panelRequest())).status, 403);
    assert.equal(route.calls.length, 0);
  }
});

test("panel API rejects untrusted links and returns only the resolved code", async () => {
  const route = await loadRoute();
  assert.equal((await route.POST(panelRequest("https://evil.test/agent/orders/123456"))).status, 400);
  assert.equal(route.calls.length, 0);
  const response = await route.POST(panelRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { factoryBillCode: "26-564653" });
  assert.deepEqual(route.calls, [id]);
  const permittedGraphic = await loadRoute({ role: "graphic", permissions: { access: { "/factory-receipts": "allow" } } });
  assert.equal((await permittedGraphic.POST(panelRequest())).status, 200);
});
