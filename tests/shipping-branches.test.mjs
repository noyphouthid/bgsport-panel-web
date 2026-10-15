import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as provinces from "../lib/laos-provinces.ts";
function compile(path, dependencies) {
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
      assert.ok(name in dependencies, name);
      return dependencies[name];
    },
    compiled,
    compiled.exports,
  );
  return compiled.exports;
}
const branches = compile("../lib/transport-branches.ts", {
  "@/lib/laos-provinces": provinces,
});
const { loadImportedTransportBranches, ShippingBranchDirectoryError } = compile(
  "../lib/shipping-branches.ts",
  { "@/lib/transport-branches": branches },
);
const loadImportedAnousithBranches = (client, now) =>
  loadImportedTransportBranches(client, "anousith", now);
const row = (index, overrides = {}) => ({
  id: `db-${String(index).padStart(5, "0")}`,
  source_id: String(index),
  branch_name: `Branch ${index}`,
  branch_code: `ANS-${index}`,
  province: "ແຂວງ ຄຳມ່ວນ",
  district: "ເມືອງ ມະຫາໄຊ",
  ...overrides,
});
function clientFor(page, expectedCompany = "ANOUSITH") {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, "shipping_branches");
      return {
        select(columns, options) {
          assert.equal(
            columns,
            "id,source_id,branch_name,branch_code,province,district",
          );
          assert.deepEqual(options, { count: "exact" });
          return {
            eq(company, value) {
              assert.equal(company, "company");
              assert.equal(value, expectedCompany);
              return {
                eq(active, enabled) {
                  assert.equal(active, "is_active");
                  assert.equal(enabled, true);
                  return {
                    order(column, options) {
                      assert.equal(column, "id");
                      assert.deepEqual(options, { ascending: true });
                      return {
                        range(from, to) {
                          calls.push([from, to]);
                          return page(from, to);
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}
test("imported Anousith reads every database page and exposes only picker fields", async () => {
  const data = Array.from({ length: 1205 }, (_, i) => row(i));
  data[1] = row(1, { branch_code: data[0].branch_code }); // Branch codes can repeat.
  const client = clientFor(async (from, to) => ({
    data: data.slice(from, to + 1),
    error: null,
    count: data.length,
  }));
  const directory = await loadImportedAnousithBranches(client, () => 0);
  assert.equal(directory.branches.length, 1205);
  assert.equal(client.calls.length, 7);
  assert.equal(directory.source, "supabase");
  assert.equal(directory.provider, "anousith");
  assert.equal(directory.stale, false);
  assert.deepEqual(
    directory.branches.find((b) => b.id === "0"),
    {
      id: "0",
      name: "Branch 0",
      code: "ANS-0",
      district: "ມະຫາໄຊ",
      province: "ຄຳມ່ວນ",
    },
  );
  await loadImportedAnousithBranches(client);
  assert.equal(
    client.calls.length,
    14,
    "Imported updates are not hidden behind the six-hour external API cache",
  );
});
test("database pagination respects a row cap below the requested page size", async () => {
  const data = Array.from({ length: 825 }, (_, i) => row(i));
  const client = clientFor(async (from, to) => ({
    data: data.slice(from, Math.min(to + 1, from + 100)),
    count: 825,
    error: null,
  }));
  assert.equal(
    (await loadImportedAnousithBranches(client)).branches.length,
    825,
  );
  assert.equal(client.calls.length, 9);
});
test("missing import, empty directories and read errors are explicit; no API fallback is available", async () => {
  for (const code of ["PGRST205", "42703"]) {
    await assert.rejects(
      loadImportedAnousithBranches(
        clientFor(async () => ({ data: null, count: null, error: { code } })),
      ),
      (error) =>
        error instanceof ShippingBranchDirectoryError &&
        error.status === 503 &&
        error.message.includes("20261018_import_anousith_branches.sql"),
    );
  }
  await assert.rejects(
    loadImportedAnousithBranches(
      clientFor(async () => ({ data: [], count: 0, error: null })),
    ),
    (error) => error.status === 409,
  );
  await assert.rejects(
    loadImportedAnousithBranches(null),
    ShippingBranchDirectoryError,
  );
  await assert.rejects(
    loadImportedAnousithBranches(
      clientFor(async () => ({
        data: null,
        count: null,
        error: { code: "NETWORK" },
      })),
    ),
    ShippingBranchDirectoryError,
  );
});
test("a failed later page, changed count, duplicate ID or incomplete result cannot return a partial directory", async () => {
  const data = Array.from({ length: 205 }, (_, i) => row(i));
  for (const failure of ["error", "count", "duplicate", "empty"]) {
    const client = clientFor(async (from, to) =>
      from === 0
        ? { data: data.slice(from, to + 1), count: 205, error: null }
        : {
            data:
              failure === "empty"
                ? []
                : failure === "duplicate"
                  ? [data[0]]
                  : data.slice(from),
            count: failure === "count" ? 206 : 205,
            error: failure === "error" ? { code: "NETWORK" } : null,
          },
    );
    await assert.rejects(
      loadImportedAnousithBranches(client),
      ShippingBranchDirectoryError,
    );
  }
});
test("source IDs and UUID fallbacks remain distinct and unknown districts are not invented", async () => {
  const data = [
    row(1, { source_id: null, branch_code: null, district: null }),
    row(2, { province: "ແຂວງ ວຽງຈັນ" }),
    row(3, { province: "ນະຄອນຫຼວງວຽງຈັນ" }),
  ];
  const result = await loadImportedAnousithBranches(
    clientFor(async () => ({ data, count: 3, error: null })),
  );
  const missing = result.branches.find((b) => b.id === data[0].id);
  assert.equal(missing.code, "");
  assert.equal(missing.district, "");
  assert.equal(result.branches.find((b) => b.id === "2").province, "ວຽງຈັນ");
  assert.equal(
    result.branches.find((b) => b.id === "3").province,
    "ນະຄອນຫຼວງວຽງຈັນ",
  );
});

test("all three providers read only their imported company without carrier calls", async () => {
  for (const [provider, company] of [
    ["hal", "HAL"],
    ["anousith", "ANOUSITH"],
    ["unitel", "UNITEL"],
  ]) {
    const client = clientFor(
      async () => ({ data: [row(1)], count: 1, error: null }),
      company,
    );
    const directory = await loadImportedTransportBranches(client, provider);
    assert.equal(directory.provider, provider);
    assert.equal(directory.source, "supabase");
    assert.equal(directory.branches[0].id, "1");
    assert.equal(directory.branches[0].province, "ຄຳມ່ວນ");
  }
});
