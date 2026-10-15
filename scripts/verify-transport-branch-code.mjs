// Isolated PostgreSQL validation; no production writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.argv[2] || "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec(
    "create table public.transport_notes (id text primary key, branch text); create table public.shipment_delivery_requests (id text primary key, transport_branch text); insert into public.transport_notes values ('legacy','Old branch'); insert into public.shipment_delivery_requests values ('legacy','Old destination');",
  );
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20261017_add_transport_branch_code.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration);
  assert.deepEqual(
    (await db.query("select * from public.transport_notes where id='legacy'"))
      .rows[0],
    { id: "legacy", branch: "Old branch", branch_code: null },
  );
  assert.deepEqual(
    (
      await db.query(
        "select * from public.shipment_delivery_requests where id='legacy'",
      )
    ).rows[0],
    {
      id: "legacy",
      transport_branch: "Old destination",
      transport_branch_code: null,
    },
  );
  await db.query(
    "update public.transport_notes set branch_code=$1 where id='legacy'",
    ["FCS-0310-PM"],
  );
  await db.query(
    "update public.shipment_delivery_requests set transport_branch_code=$1 where id='legacy'",
    ["HL01-01-0001"],
  );
  assert.equal(
    (await db.query("select branch_code from public.transport_notes")).rows[0]
      .branch_code,
    "FCS-0310-PM",
  );
  assert.equal(
    (
      await db.query(
        "select transport_branch_code from public.shipment_delivery_requests",
      )
    ).rows[0].transport_branch_code,
    "HL01-01-0001",
  );
  console.log(
    "Branch-code migration passed: repeatable, preserves legacy addresses, stores both carrier code formats.",
  );
} finally {
  await db.close();
}
