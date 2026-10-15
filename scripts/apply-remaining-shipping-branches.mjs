// Imports only the reviewed HAL/Unitel seed into the existing shipping_branches
// table. No schema changes or deletes. One atomic REST upsert; default is read-only.
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
try {
  await access(envPath);
  process.loadEnvFile(envPath);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const sql = await readFile(
  new URL(
    "../supabase/migrations/20261019_import_hal_unitel_branches.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.equal(sql.split("$remaining_branches_seed$").length, 3);
const seed = JSON.parse(sql.split("$remaining_branches_seed$")[1]);
assert.equal(seed.filter((row) => row.company === "HAL").length, 832);
assert.equal(seed.filter((row) => row.company === "UNITEL").length, 895);
assert.equal(
  new Set(seed.map((row) => `${row.company}|${row.source_id}`)).size,
  seed.length,
);
assert.ok(
  seed.every(
    (row) =>
      ["HAL", "UNITEL"].includes(row.company) &&
      row.source_id &&
      row.branch_name,
  ),
);
const apply = process.argv.includes("--apply");
if (process.argv.some((arg) => arg.startsWith("--") && arg !== "--apply"))
  throw new Error(
    "Only --apply is supported; omit it for read-only verification.",
  );
const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !key)
  throw new Error("Supabase server environment is required.");
const headers = { apikey: key, Authorization: `Bearer ${key}` };
async function request(url, init) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok)
    throw new Error(
      `Supabase HTTP ${response.status}: ${data?.code || "request_failed"}`,
    );
  return { response, data };
}
async function readCompany(company) {
  const rows = [];
  let total = null;
  for (let page = 0; page < 100; page++) {
    const url = new URL("/rest/v1/shipping_branches", baseUrl);
    url.search = new URLSearchParams({
      select: "*",
      company: `eq.${company}`,
      order: "id.asc",
      offset: String(rows.length),
      limit: "200",
    });
    const { response, data } = await request(url, {
      headers: { ...headers, Prefer: "count=exact" },
    });
    const count = Number(response.headers.get("content-range")?.split("/")[1]);
    assert.ok(Array.isArray(data) && Number.isSafeInteger(count) && count >= 0);
    if (total !== null)
      assert.equal(count, total, "Directory changed during verification");
    total = count;
    rows.push(...data);
    if (rows.length === total) return rows;
    assert.ok(data.length && rows.length < total);
  }
  throw new Error("Directory exceeds verification page limit");
}
const companies = ["ANOUSITH", "HAL", "UNITEL"];
const before = Object.fromEntries(
  await Promise.all(
    companies.map(async (company) => [company, await readCompany(company)]),
  ),
);
if (apply) {
  const url = new URL("/rest/v1/shipping_branches", baseUrl);
  url.search = new URLSearchParams({ on_conflict: "company,source_id" });
  const updatedAt = new Date().toISOString();
  await request(url, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(
      seed.map((row) => ({ ...row, updated_at: updatedAt })),
    ),
  });
}
const after = apply
  ? Object.fromEntries(
      await Promise.all(
        companies.map(async (company) => [company, await readCompany(company)]),
      ),
    )
  : before;
assert.deepEqual(
  after.ANOUSITH,
  before.ANOUSITH,
  "Anousith must remain untouched",
);
const bySource = new Map(
  [...after.HAL, ...after.UNITEL].map((row) => [
    `${row.company}|${row.source_id}`,
    row,
  ]),
);
let missing = 0;
for (const source of seed) {
  const imported = bySource.get(`${source.company}|${source.source_id}`);
  if (!imported) {
    missing++;
    continue;
  }
  for (const [field, expected] of Object.entries(source)) {
    const actual = imported[field];
    // PostgREST may serialize float8 coordinates at fewer decimal places.
    // The unrounded original remains exact in source_payload.
    const equal =
      ["latitude", "longitude"].includes(field) && expected !== null
        ? typeof actual === "number" && Math.abs(actual - expected) <= 1e-9
        : isDeepStrictEqual(actual, expected);
    assert.ok(
      equal,
      `Imported field mismatch: ${source.company}/${source.source_id} ${field}`,
    );
  }
}
if (apply) assert.equal(missing, 0);
for (const company of ["HAL", "UNITEL"]) {
  const current = new Map(after[company].map((row) => [row.source_id, row]));
  for (const row of before[company]) {
    const saved = current.get(row.source_id);
    assert.ok(saved);
    assert.equal(saved.id, row.id);
    assert.equal(saved.created_at, row.created_at);
    assert.equal(saved.is_active, row.is_active);
  }
}
console.log(
  JSON.stringify({
    applied: apply,
    missingSeedRows: missing,
    companyCounts: Object.fromEntries(
      companies.map((company) => [company, after[company].length]),
    ),
    anousithUnchanged: true,
    sourceFieldsMatch: missing === 0,
  }),
);
