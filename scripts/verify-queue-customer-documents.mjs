// Isolated PostgreSQL checks. No production database reads or writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.argv[2] || "@electric-sql/pglite");
const db = new PGlite();
const admin = "00000000-0000-4000-8000-000000000001";
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table users (id uuid primary key, auth_user_id uuid, role text);
  insert into users values ('${admin}', '${admin}', 'admin');
  select set_config('test.uid', '${admin}', false);
  create table fabrics (id uuid primary key);
  create table orders (id uuid primary key);
`);
const migration = async name => db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
await migration("20260403_create_design_queue_entries.sql");
await migration("20260325_create_quotation_drafts.sql");
await migration("20260323_create_factory_deposit_orders.sql");
await db.exec(`insert into quotation_drafts(created_by_user_id,quote_no,quote_date) values ('${admin}','QTF26-legacy','2026-10-01');
  insert into factory_deposit_orders(deposit_no) values ('DPF26-legacy');`);
await migration("20261020_link_queue_customer_documents.sql");
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const queue = await one(`select * from create_design_queue_entry(p_queue_date => '2026-10-15', p_type_code => 'PK26', p_customer_name => 'QA Team', p_customer_phone => '20 99 999 999', p_work_category => 'sports')`);
assert.equal(queue.work_category, "sports");
const quote = date => one(`insert into quotation_drafts(created_by_user_id,quote_date,design_queue_entry_id) values ($1,$2,$3) returning *`, [admin, date, queue.id]);
const first = await quote("2026-10-15");
assert.equal(first.quote_no, "QT26-10-000");
assert.equal(first.order_code, `${queue.type_code}-${queue.order_no}`);
assert.equal(first.customer_phone, queue.customer_phone);
assert.equal(first.work_category, "sports");
assert.equal((await quote("2026-10-16")).quote_no, "QT26-10-001");
assert.equal((await quote("2026-11-01")).quote_no, "QT26-11-000");
assert.equal((await quote("2027-10-01")).quote_no, "QT27-10-000");
// Updating or printing a saved document cannot consume another sequence or change its number.
assert.equal((await one(`update quotation_drafts set quote_no='tampered', quote_date='2026-11-02' where id=$1 returning *`, [first.id])).quote_no, first.quote_no);
assert.equal((await quote("2026-10-20")).quote_no, "QT26-10-002");
const deposit = await one(`insert into factory_deposit_orders(quotation_draft_id,deposit_no,deposit_date) values ($1,'','2026-10-15') returning *`, [first.id]);
assert.equal(deposit.deposit_no, "DPF26-10-000");
assert.equal(deposit.quotation_quote_no, first.quote_no);
assert.equal(deposit.order_code, first.order_code);
assert.equal(deposit.design_queue_entry_id, queue.id);
assert.equal(deposit.work_category, "sports");
assert.equal((await one(`insert into factory_deposit_orders(deposit_no,deposit_date) values ('','2026-10-15') returning *`)).deposit_no, "DPF26-10-001");
// Deletion never reuses a document number. More than 999 documents must not truncate.
await db.query(`delete from factory_deposit_orders where id=$1`, [deposit.id]);
assert.equal((await one(`insert into factory_deposit_orders(deposit_no,deposit_date) values ('','2026-10-15') returning *`)).deposit_no, "DPF26-10-002");
await db.exec(`update document_monthly_counters set last_value=999 where document_kind='DPF';`);
assert.equal((await one(`insert into factory_deposit_orders(deposit_no,deposit_date) values ('','2026-10-15') returning *`)).deposit_no, "DPF26-10-1000");
for (const search of ["QA Team", "2099999999", "99 999", first.order_code, queue.queue_number]) {
  assert.equal((await one(`select * from search_design_queue_customers($1)`, [search])).id, queue.id);
}
assert.equal((await db.query(`select * from search_design_queue_customers('%')`)).rows.length, 0);
// Updated queue details do not silently rewrite existing document snapshots.
await db.query(`update design_queue_entries set customer_phone='changed' where id=$1`, [queue.id]);
await db.query(`update quotation_drafts set notes='edited' where id=$1`, [first.id]);
assert.equal((await one(`select * from quotation_drafts where id=$1`, [first.id])).customer_phone, first.customer_phone);
await assert.rejects(db.query(`update design_queue_entries set work_category='PK26' where id=$1`, [queue.id]));
await assert.rejects(db.query(`insert into quotation_drafts(created_by_user_id,quote_date) values ($1,'')`, [admin]));
// Migration can run twice and keeps legacy numbers and counter high-water marks.
await migration("20261020_link_queue_customer_documents.sql");
assert.equal((await one(`select quote_no from quotation_drafts where quote_no='QTF26-legacy'`)).quote_no, "QTF26-legacy");
assert.equal((await one(`select deposit_no from factory_deposit_orders where deposit_no='DPF26-legacy'`)).deposit_no, "DPF26-legacy");
assert.equal((await quote("2026-10-20")).quote_no, "QT26-10-003");
assert.equal((await one(`insert into factory_deposit_orders(deposit_no,deposit_date) values ('','2026-10-15') returning *`)).deposit_no, "DPF26-10-1001");
// Explicit customer edits belong to the document snapshot and do not update the queue.
const customized = await one(`insert into quotation_drafts(created_by_user_id,quote_date,design_queue_entry_id,customer_name,customer_phone) values ($1,'2026-12-01',$2,'Invoice Contact','20 1234 5678') returning *`, [admin, queue.id]);
assert.equal(customized.customer_phone, "20 1234 5678");
assert.equal(customized.customer_name, "Invoice Contact");
assert.equal((await one(`select * from design_queue_entries where id=$1`, [queue.id])).customer_phone, "changed");
// Customer lookup obeys RLS and anonymous callers cannot execute it.
await db.exec(`grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated;
  grant select on users, design_queue_entries to authenticated; set role authenticated;`);
assert.equal((await db.query(`select * from search_design_queue_customers('QA Team')`)).rows.length, 1);
await db.exec(`select set_config('test.uid', '00000000-0000-4000-8000-000000000099', false)`);
assert.equal((await db.query(`select * from search_design_queue_customers('QA Team')`)).rows.length, 0);
await assert.rejects(db.query(`select create_design_queue_entry()`));
await db.exec(`reset role; set role anon;`);
await assert.rejects(db.query(`select * from search_design_queue_customers('QA Team')`));
await db.exec(`reset role;`);
await db.close();
console.log("Queue/customer links, monthly numbering, rollover, non-reuse, legacy preservation, repeat migration and RLS checks passed.");
