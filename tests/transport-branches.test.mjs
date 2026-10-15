import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as provinces from "../lib/laos-provinces.ts";
function compile(path, deps) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    (name) => {
      assert.ok(name in deps, name);
      return deps[name];
    },
    compiled,
    compiled.exports,
  );
  return compiled.exports;
}
const branches = compile("../lib/transport-branches.ts", {
  "@/lib/laos-provinces": provinces,
});
const { createTransportBranchLoader } = compile(
  "../lib/transport-branches-server.ts",
  { "@/lib/transport-branches": branches },
);
const hal = {
  id: 1,
  name: "ຮ່ອງຄ້າ",
  code: "HL01-01-0001",
  status: 1,
  district: { name: "ຈັນທະບູລີ" },
  province: { name: "ນະຄອນຫລວງວຽງຈັນ" },
};
const anousith = {
  id_branch: "a",
  branch_name: "ສາຂາ ທົດສອບ",
  branch_code: "FCS-001",
  public: 1,
  districtName: "ເມືອງ ມະຫາໄຊ",
  provinceID: { provinceName: "ແຂວງ ຄຳມ່ວນ" },
};
const json = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });

test("HAL excludes hidden, closed, deleted and inactive branches, canonicalizes location and drops unused data", () => {
  const data = branches.normalizeTransportBranches("hal", [
    hal,
    { ...hal, id: 2, status: 0 },
    { ...hal, id: 3, is_hide: 1 },
    { ...hal, id: 4, is_permanently_closed: true },
    { ...hal, id: 5, deleted_at: "date" },
    { ...hal, owner_phone: "secret" },
  ]);
  assert.deepEqual(data, [
    {
      id: "1",
      name: hal.name,
      code: hal.code,
      district: "ຈັນທະບູລີ",
      province: "ນະຄອນຫຼວງວຽງຈັນ",
    },
  ]);
});
test("Anousith normalizes geography without guessing missing districts, keeps capital distinct", () => {
  const data = branches.normalizeTransportBranches("anousith", [
    anousith,
    {
      ...anousith,
      id_branch: "b",
      districtName: null,
      provinceID: { provinceName: "ແຂວງ ວຽງຈັນ" },
    },
    { ...anousith, id_branch: "c", public: 0 },
    { ...anousith, id_branch: "d", isDeleted: 1 },
  ]);
  assert.equal(data.length, 2);
  assert.equal(data.find((b) => b.id === "a").district, "ມະຫາໄຊ");
  assert.equal(data.find((b) => b.id === "b").district, "");
  assert.equal(data.find((b) => b.id === "b").province, "ວຽງຈັນ");
  assert.deepEqual(
    branches.addressForTransportBranch(
      "anousith",
      data.find((b) => b.id === "a"),
    ),
    {
      branch: anousith.branch_name,
      branchCode: anousith.branch_code,
      city: "ມະຫາໄຊ",
      province: "ຄຳມ່ວນ",
      transporters: ["Anousith Express"],
    },
  );
  assert.equal(branches.branchProviderForTransporter("HAL Logistic"), "hal");
  assert.equal(branches.isBranchProvider("https://invalid.example"), false);
});
test("HAL uses the active=true endpoint, shares in-flight loads and caches for six hours", async () => {
  let calls = 0;
  const loader = createTransportBranchLoader(async (url) => {
    calls++;
    assert.equal(new URL(url).searchParams.get("is_active"), "true");
    return json([hal]);
  });
  const [a, b] = await Promise.all([loader("hal"), loader("hal")]);
  assert.deepEqual(a, b);
  await loader("hal");
  assert.equal(calls, 1);
});
test("Anousith loads every public page with the exact multiline query", async () => {
  let calls = 0;
  const loader = createTransportBranchLoader(async (url, init) => {
    assert.equal(url, "https://pro.api.anousith.express/graphql");
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body);
    assert.deepEqual(body.variables.where, { public: 1, isDeleted: 0 });
    assert.ok(body.query.includes("\n      branch_name\n"));
    const skip = body.variables.skip;
    calls++;
    return json({
      data: {
        branches: {
          total: 205,
          data: Array.from({ length: Math.min(200, 205 - skip) }, (_, i) => ({
            ...anousith,
            id_branch: String(skip + i),
          })),
        },
      },
    });
  });
  assert.equal((await loader("anousith")).branches.length, 205);
  assert.equal(calls, 2);
});
test("an upstream failure serves recent last-good data and retries after a minute, then rejects expired data", async () => {
  let time = Date.now(),
    fail = false,
    calls = 0;
  const loader = createTransportBranchLoader(
    async () => {
      calls++;
      if (fail) throw new Error("offline");
      return json([hal]);
    },
    () => time,
  );
  const initial = await loader("hal");
  fail = true;
  time += 6 * 60 * 60 * 1000 + 1;
  const stale = await loader("hal");
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, initial.fetchedAt);
  await loader("hal");
  assert.equal(calls, 2);
  time += 60001;
  await loader("hal");
  assert.equal(calls, 3);
  time += 7 * 24 * 60 * 60 * 1000;
  await assert.rejects(loader("hal"), /offline/);
});
test("GraphQL errors, incomplete pagination and repeated pages do not become a partial directory", async () => {
  for (const response of [
    { errors: [{ message: "upstream" }] },
    { data: { branches: { total: 300, data: [anousith] } } },
  ]) {
    await assert.rejects(
      createTransportBranchLoader(async () => json(response))("anousith"),
    );
  }
  const repeated = Array.from({ length: 200 }, (_, i) => ({
    ...anousith,
    id_branch: String(i),
  }));
  await assert.rejects(
    createTransportBranchLoader(async () =>
      json({ data: { branches: { total: 400, data: repeated } } }),
    )("anousith"),
    /pagination changed/,
  );
});

if (process.env.VERIFY_LIVE_BRANCHES === "1") {
  const loader = createTransportBranchLoader();
  for (const provider of ["hal", "anousith"]) {
    const directory = await loader(provider);
    assert.ok(directory.branches.length > 100);
    assert.equal(directory.stale, false);
    console.log(
      JSON.stringify({
        provider,
        branches: directory.branches.length,
        missingDistrict: directory.branches.filter((b) => !b.district).length,
        missingProvince: directory.branches.filter((b) => !b.province).length,
      }),
    );
  }
}

test("the route authenticates requests and rejects arbitrary providers before loading upstream data", async () => {
  let authenticated = false,
    loads = 0;
  const { GET } = compile("../app/api/transport-branches/route.ts", {
    "next/server": {
      NextResponse: {
        json: (body, init = {}) => ({
          body,
          status: init.status || 200,
          headers: init.headers,
        }),
      },
    },
    "@/lib/admin-api-auth": {
      getActorFromAuthHeader: async () =>
        authenticated ? { profileId: "qa" } : null,
    },
    "@/lib/transport-branches": branches,
    "@/lib/transport-branches-server": {
      loadTransportBranchDirectory: async (provider) => {
        loads++;
        return { provider, branches: [] };
      },
    },
  });
  const request = (provider) => ({
    headers: new Headers(),
    nextUrl: new URL(
      "http://localhost/api/transport-branches?provider=" +
        encodeURIComponent(provider),
    ),
  });
  assert.equal((await GET(request("hal"))).status, 401);
  assert.equal(loads, 0);
  authenticated = true;
  assert.equal((await GET(request("https://invalid.example"))).status, 400);
  assert.equal(loads, 0);
  const result = await GET(request("hal"));
  assert.equal(result.status, 200);
  assert.equal(result.body.provider, "hal");
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.equal(loads, 1);
});
