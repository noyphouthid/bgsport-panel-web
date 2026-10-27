// Isolated PostgreSQL validation; no production connections or writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.argv[2] || "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec("create table public.transport_notes (id text primary key); create table public.shipment_delivery_requests (id text primary key, delivery_method text); insert into public.transport_notes values ('legacy'); insert into public.shipment_delivery_requests values ('legacy', 'transport');");
  const sql = await readFile(new URL("../supabase/migrations/20261102_add_transport_cod.sql", import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec(sql);
  assert.deepEqual((await db.query("select * from public.transport_notes")).rows[0], { id: "legacy", cod_enabled: false, cod_amount: "0.00" });
  assert.equal((await db.query("select transport_cod_enabled from public.shipment_delivery_requests")).rows[0].transport_cod_enabled, false);
  await assert.rejects(db.exec("update public.transport_notes set cod_enabled=true, cod_amount=0"));
  await assert.rejects(db.exec("update public.transport_notes set cod_amount=-1"));
  await assert.rejects(db.exec("update public.shipment_delivery_requests set delivery_method='pickup', transport_cod_enabled=true, transport_cod_amount=500"));
  await db.exec("update public.transport_notes set cod_enabled=true, cod_amount=1500000; update public.shipment_delivery_requests set transport_cod_enabled=true, transport_cod_amount=1500000;");
  assert.equal((await db.query("select cod_amount from public.transport_notes")).rows[0].cod_amount, "1500000.00");
  await db.exec("update public.transport_notes set cod_enabled=false, cod_amount=0; update public.shipment_delivery_requests set transport_cod_enabled=false, transport_cod_amount=0;");
  console.log("COD migration passed: repeatable, legacy defaults, positive amounts, transport-only requests, enabling and clearing COD.");
} finally {
  await db.close();
}
