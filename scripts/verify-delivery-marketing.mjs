// Uses isolated PostgreSQL; never writes to the production database.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.argv[2] || "@electric-sql/pglite");
const db = new PGlite();
await db.exec("create table public.orders (id text primary key, order_date date, order_code text, net_total numeric); insert into public.orders values ('legacy','2026-09-20','PK26-1001',2000000);");
const migration = await readFile(new URL("../supabase/migrations/20261016_add_order_work_category.sql", import.meta.url), "utf8");
await db.exec(migration);
await db.exec(migration);
assert.equal((await db.query("select work_category from public.orders where id='legacy'")).rows[0].work_category, null);
for (const category of ["team_group", "cockfighting", "boat_racing", "automotive", "rocket_festival", "religious", "sports", "other"]) {
  await db.query("update public.orders set work_category=$1 where id='legacy'", [category]);
  assert.equal((await db.query("select work_category from public.orders where id='legacy'")).rows[0].work_category, category);
}
await assert.rejects(db.query("update public.orders set work_category='PK26' where id='legacy'"));
await db.query("update public.orders set work_category=null where id='legacy'");
assert.deepEqual((await db.query("select order_code,net_total::text from public.orders where id='legacy'")).rows[0], { order_code: "PK26-1001", net_total: "2000000" });
assert.equal((await db.query("select count(*)::int as count from pg_indexes where indexname='orders_work_category_date_idx'")).rows[0].count, 1);
await db.close();
console.log("Migration checks passed: repeatable, legacy orders preserved, all categories accepted, invalid category rejected, financial data unchanged.");
