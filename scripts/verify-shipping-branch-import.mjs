// Isolated PostgreSQL validation; this script never writes to Supabase.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.argv[2] || "@electric-sql/pglite");
const sql = await readFile(
  new URL(
    "../supabase/migrations/20261018_import_anousith_branches.sql",
    import.meta.url,
  ),
  "utf8",
);
const seed = JSON.parse(sql.split("$anousith_seed$")[1]);
assert.equal(seed.length, 825);
assert.ok(
  seed.every(
    (row) => row.company === "ANOUSITH" && row.source_payload.public === 1,
  ),
);
assert.equal(new Set(seed.map((row) => row.source_id)).size, 825);
const db = new PGlite();
try {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  await db.exec(sql);
  const original = await db.query(
    "select id, source_id, created_at from public.shipping_branches order by source_id",
  );
  assert.equal(original.rows.length, 825);
  assert.equal(
    (
      await db.query(
        "select count(distinct branch_code)::int as codes from public.shipping_branches",
      )
    ).rows[0].codes,
    823,
    "Branch codes are not globally unique; source IDs must be the import key",
  );
  await db.exec(
    "insert into public.shipping_branches (company,source_id,branch_name,address) values ('HAL','keep-hal','Existing HAL','Keep HAL address'),('UNITEL','keep-unitel','Existing Unitel','Keep Unitel address'); update public.shipping_branches set is_active=false where company='ANOUSITH' and source_id='4';",
  );
  await db.exec(sql);
  assert.deepEqual(
    (
      await db.query(
        "select id, source_id, created_at from public.shipping_branches where company='ANOUSITH' order by source_id",
      )
    ).rows,
    original.rows,
  );
  const imported = (
    await db.query(
      "select company,source_id,branch_code,branch_name,province,district,village,address,phone,source_url,source_payload from public.shipping_branches where company='ANOUSITH' order by source_id",
    )
  ).rows;
  assert.deepEqual(
    imported,
    seed,
    "All supplied fields, including address contact text and raw JSON, survive import",
  );
  assert.equal(
    (
      await db.query(
        "select is_active from public.shipping_branches where company='ANOUSITH' and source_id='4'",
      )
    ).rows[0].is_active,
    false,
  );
  assert.deepEqual(
    (
      await db.query(
        "select company,address from public.shipping_branches where company<>'ANOUSITH' order by company",
      )
    ).rows,
    [
      { company: "HAL", address: "Keep HAL address" },
      { company: "UNITEL", address: "Keep Unitel address" },
    ],
  );
  const permissions = (
    await db.query(
      "select relrowsecurity as rls, has_table_privilege('anon','public.shipping_branches','select') as anonymous_read, has_table_privilege('authenticated','public.shipping_branches','insert') as client_write, has_table_privilege('service_role','public.shipping_branches','select') as server_read from pg_class where oid='public.shipping_branches'::regclass",
    )
  ).rows[0];
  assert.deepEqual(permissions, {
    rls: true,
    anonymous_read: false,
    client_write: false,
    server_read: true,
  });
  const remainingSql = await readFile(
    new URL(
      "../supabase/migrations/20261019_import_hal_unitel_branches.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(remainingSql.split("$remaining_branches_seed$").length, 3);
  const remainingSeed = JSON.parse(
    remainingSql.split("$remaining_branches_seed$")[1],
  );
  assert.equal(
    remainingSeed.filter((row) => row.company === "HAL").length,
    832,
  );
  assert.equal(
    remainingSeed.filter((row) => row.company === "UNITEL").length,
    895,
  );
  assert.ok(
    remainingSeed.every(
      (row) => row.company === "HAL" || row.company === "UNITEL",
    ),
  );
  await db.exec(remainingSql);
  const importedIds = (
    await db.query(
      "select id,company,source_id,created_at from public.shipping_branches where company in ('HAL','UNITEL') order by company,source_id",
    )
  ).rows;
  await db.exec(
    "update public.shipping_branches set is_active=false where company='HAL' and source_id='1';",
  );
  await db.exec(remainingSql);
  assert.deepEqual(
    (
      await db.query(
        "select id,company,source_id,created_at from public.shipping_branches where company in ('HAL','UNITEL') order by company,source_id",
      )
    ).rows,
    importedIds,
  );
  assert.deepEqual(
    (
      await db.query(
        "select id,source_id,created_at from public.shipping_branches where company='ANOUSITH' order by source_id",
      )
    ).rows,
    original.rows,
  );
  assert.equal(
    (
      await db.query(
        "select is_active from public.shipping_branches where company='HAL' and source_id='1'",
      )
    ).rows[0].is_active,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select is_active from public.shipping_branches where company='ANOUSITH' and source_id='4'",
      )
    ).rows[0].is_active,
    false,
  );
  const remainingColumns = Object.keys(remainingSeed[0]).join(",");
  const importedRemaining = (
    await db.query(
      `select ${remainingColumns} from public.shipping_branches where company in ('HAL','UNITEL') and source_id not in ('keep-hal','keep-unitel')`,
    )
  ).rows;
  const sortRows = (rows) =>
    rows.toSorted(
      (a, b) =>
        a.company.localeCompare(b.company) ||
        a.source_id.localeCompare(b.source_id),
    );
  assert.deepEqual(sortRows(importedRemaining), sortRows(remainingSeed));
  console.log(
    "Remaining import passed: HAL 832, Unitel 895; repeatable, all fields preserved, Anousith untouched, no duplicate IDs or unintended reactivation.",
  );
  console.log(
    "Anousith import passed: 825 rows, repeatable by source ID, original IDs/contact data preserved, HAL/Unitel untouched, disabled flags preserved, server-only access.",
  );
} finally {
  await db.close();
}
