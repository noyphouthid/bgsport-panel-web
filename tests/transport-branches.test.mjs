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
const unitelProvinces = [
  { id: 17, name: "ອັດຕະປື", status: 1, countrycode: "LA" },
  { id: 1, name: "ນະຄອນຫຼວງ ວຽງຈັນ", status: 1, countrycode: "LA" },
];
const unitelDistricts = [
  { id: 1701, parentId: 17, name: "ສາມະຄີໄຊ", status: 1, countrycode: "LA" },
  { id: 101, parentId: 1, name: "ຈັນທະບູລີ", status: 1, countrycode: "LA" },
];
const unitel = {
  id: 107,
  code: "ATA01",
  name: "ATA01 - ສູນການຕະຫຼາດ",
  address: "ໃກ້ຕະຫຼາດ, ໂພນສະຫວ່າງ, ສາມະຄີໄຊ, ອັດຕະປື, Laos",
  phone: "unused",
};
test("Unitel matches address suffixes against its geography and separates the branch code", () => {
  const rows = branches.normalizeUnitelBranches(
    [
      unitel,
      {
        ...unitel,
        id: 108,
        code: "009",
        name: "Unmatched",
        address: "Text, ຈັນທະບູລີ, ອັດຕະປື, Laos",
      },
      { ...unitel, id: 109, address: "Only a free-text address" },
      { ...unitel, id: 110, address: "Text, ສາມະຄີໄຊ, ອັດຕະປື, Thailand" },
    ],
    unitelProvinces,
    unitelDistricts,
  );
  assert.deepEqual(
    rows.find((row) => row.id === "107"),
    {
      id: "107",
      code: "ATA01",
      name: "ສູນການຕະຫຼາດ",
      district: "ສາມະຄີໄຊ",
      province: "ອັດຕະປື",
    },
  );
  assert.equal(
    rows.find((row) => row.id === "108").district,
    "",
    "A district from another province must not be assigned",
  );
  for (const id of ["109", "110"]) {
    assert.equal(rows.find((row) => row.id === id).district, "");
    assert.equal(rows.find((row) => row.id === id).province, "");
  }
  assert.equal(
    branches.branchProviderForTransporter("Unitel Logistic"),
    "unitel",
  );
  assert.equal(branches.isBranchProvider("unitel"), true);
  assert.deepEqual(
    branches.addressForTransportBranch(
      "unitel",
      rows.find((row) => row.id === "107"),
    ),
    {
      branch: "ສູນການຕະຫຼາດ",
      branchCode: "ATA01",
      city: "ສາມະຄີໄຊ",
      province: "ອັດຕະປື",
      transporters: ["Unitel Logistic"],
    },
  );
  assert.throws(
    () => branches.normalizeUnitelBranches([unitel], [], unitelDistricts),
    /geography/,
  );
});
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
    "@/lib/supabase-admin": { getSupabaseAdmin: () => ({ from: () => {} }) },
    "@/lib/shipping-branches": {
      loadImportedTransportBranches: async (client, provider) => {
        loads++;
        return {
          provider,
          branches: [],
          source: "supabase",
        };
      },
      ShippingBranchDirectoryError: class extends Error {},
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
  const imported = await GET(request("anousith"));
  assert.equal(imported.status, 200);
  assert.equal(imported.body.source, "supabase");
  assert.equal(loads, 2);
  const unitel = await GET(request("unitel"));
  assert.equal(unitel.status, 200);
  assert.equal(unitel.body.source, "supabase");
  assert.equal(unitel.body.provider, "unitel");
  assert.equal(loads, 3);
});
