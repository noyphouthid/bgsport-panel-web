// Isolated PostgreSQL verification; never connects to the application database.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.argv[2] || "@electric-sql/pglite");
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [superadmin, admin, workerA, workerB, graphic] = [1, 2, 3, 4, 5].map(id);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const migration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8").then(sql => db.exec(sql));
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table users (id uuid primary key, auth_user_id uuid, role text, is_active boolean default true);
  create table orders (id uuid primary key);
  insert into users (id,auth_user_id,role) values
    ('${superadmin}','${superadmin}','superadmin'), ('${admin}','${admin}','admin'),
    ('${workerA}','${workerA}','production'), ('${workerB}','${workerB}','production'),
    ('${graphic}','${graphic}','graphic');
`);
for (const file of ["20260323_create_factory_deposit_orders.sql", "20260401_add_factory_production_sheet_fields.sql", "20260624_create_factory_production_queue_entries.sql", "20260701_add_factory_production_queue_actor_fields.sql", "20260718_fix_factory_production_queue_access.sql"]) await migration(file);
await db.exec(`alter table factory_deposit_orders add column pants_items jsonb default '[]';`);
// An existing started job must keep its owner, status and timestamps on migration.
const historical = await one(`insert into factory_deposit_orders(deposit_no,deposit_date,status,short_qty) values ('HIST','2026-09-22','submitted',30) returning *`);
await one(`select upsert_factory_production_queue_entry($1,$2)`, [historical.id, admin]);
await db.query(`update factory_production_queue_entries set planner_user_id=$1,status='pattern_laid',pattern_laid_at='2026-09-22T12:00:00Z'`, [workerB]);
await migration("20261023_automate_production_queue.sql");
const before = await one(`select * from factory_production_queue_entries where factory_deposit_order_id=$1`, [historical.id]);
assert.equal(before.status, "pattern_laid"); assert.equal(before.planner_user_id, workerB);
const deposit = (name, qty, month = "10", status = "submitted", pants = []) => one(`insert into factory_deposit_orders(deposit_no,deposit_date,status,short_qty,created_by_user_id,pants_items)
  values ($1,$2,$3,$4,$5,$6) returning *`, [name, `2026-${month}-22`, status, qty, admin, JSON.stringify(pants)]);
const queue = d => one(`select * from factory_production_queue_entries where factory_deposit_order_id=$1`, [d.id]);
const draft = await deposit("DRAFT", 100, "10", "draft");
assert.equal(await queue(draft), undefined);
const d1 = await deposit("TWELVE", 12), d2 = await deposit("SIX-A", 6), d3 = await deposit("SIX-B", 6);
const [q1,q2,q3] = await Promise.all([queue(d1),queue(d2),queue(d3)]);
assert.equal(q1.planner_user_id, workerA); assert.equal(q2.planner_user_id, workerB); assert.equal(q3.planner_user_id, workerB);
const totals = (await db.query(`select planner_user_id, sum(workload_piece_qty)::int as qty from factory_production_queue_entries where queue_month=10 group by planner_user_id order by planner_user_id`)).rows;
assert.deepEqual(totals.map(row => row.qty), [12,12]);
assert.equal(new Set([q1.id,q2.id,q3.id]).size,3);
const sync = () => db.query(`select sync_factory_production_queue_entries($1)`, [superadmin]);
await db.exec(`select set_config('test.uid','${superadmin}',false)`);
await sync(); await sync();
assert.deepEqual([...(await db.query(`select id,planner_user_id from factory_production_queue_entries where queue_month=10 order by queue_sequence`)).rows], [q1,q2,q3].map(({id,planner_user_id})=>({id,planner_user_id})));
// Server RPC checks ownership for every stage and makes mixed bulk updates atomic.
const status = (ids,target,actor) => db.query(`select update_factory_production_queue_statuses($1,$2,$3)`, [ids,target,actor]);
for (const target of ["pattern_laid","ready_for_print","sent_to_factory"]) {
  await status([q1.id],target,workerA);
  await assert.rejects(status([q1.id],"queued",workerB), /forbidden/);
}
await assert.rejects(status([q2.id,q1.id],"ready_for_print",workerB), /forbidden/);
assert.equal((await queue(d2)).status,"queued");
await status([q1.id],"queued",superadmin);
assert.equal((await queue(d1)).planner_user_id,workerA, "Reverting preserves assignment");
assert.equal((await queue(d1)).sent_to_factory_at,null);
await status([q1.id],"sent_to_factory",superadmin);
const completed = await queue(d1);
assert.equal(completed.sent_to_factory_by_user_id,workerA);
assert.equal(completed.pattern_laid_by_user_id,workerA);
assert.equal(completed.last_status_updated_by_user_id,superadmin);
await assert.rejects(status([id(999)],"queued",superadmin), /queue_not_found/);
await assert.rejects(status([q1.id],"unknown",superadmin), /invalid_target_status/);
// Completed work still counts toward monthly balancing. New months reset the load.
const d4 = await deposit("NEXT-MONTH",1,"11"); assert.equal((await queue(d4)).planner_user_id,workerA);
const pants = await deposit("PANTS",1,"11","submitted",[{qty:2,freeQty:1},{qty:3,free_qty:2}]);
assert.equal((await queue(pants)).workload_piece_qty,9);
await db.query(`update factory_deposit_orders set free_qty=2, qty_3xl=1 where id=$1`,[pants.id]);
assert.equal((await queue(pants)).workload_piece_qty,12);
await db.query(`update factory_deposit_orders set status='submitted' where id=$1`, [draft.id]);
assert.ok((await queue(draft)).planner_user_id);
await db.query(`update factory_deposit_orders set status='cancelled' where id=$1`,[draft.id]);
assert.equal(await queue(draft),undefined);
// No active production account: hold safely, then recover when a worker is active.
await db.exec(`update users set is_active=false where role='production'`);
const waiting = await deposit("NO-WORKERS",4,"12"); assert.equal((await queue(waiting)).planner_user_id,null);
await assert.rejects(status([(await queue(waiting)).id],"pattern_laid",superadmin), /queue_unassigned/);
await db.query(`update users set is_active=true where id=$1`,[workerA]); await sync();
assert.equal((await queue(waiting)).planner_user_id,workerA);
await db.exec(`update users set is_active=true where role='production'`);
// Re-running the migration must preserve identities and ongoing work.
await migration("20261023_automate_production_queue.sql");
assert.equal((await queue(d1)).id,q1.id); assert.equal((await queue(d1)).status,"sent_to_factory");
assert.equal((await one(`select * from factory_production_queue_entries where id=$1`,[before.id])).pattern_laid_at.toISOString(),before.pattern_laid_at.toISOString());
// Real RLS as authenticated users; no direct update or RPC bypass.
await db.exec(`grant usage on schema public,auth to authenticated,anon,service_role;
  grant select on users,factory_production_queue_entries to authenticated;
  grant execute on function auth.uid() to authenticated;
  set role authenticated;
  select set_config('test.uid','${workerB}',false);`);
const own = (await db.query(`select * from factory_production_queue_entries`)).rows;
assert.ok(own.length); assert.ok(own.every(row=>row.planner_user_id===workerB));
assert.equal((await db.query(`select * from factory_production_queue_entries where id=$1`,[q1.id])).rows.length,0);
await assert.rejects(db.query(`update factory_production_queue_entries set planner_user_id=$1 where id=$2`,[workerB,q1.id]), /permission denied/);
await assert.rejects(db.query(`select enqueue_factory_production_internal($1,$2)`,[d1.id,workerB]), /permission denied/);
await assert.rejects(status([q1.id],"queued",superadmin), /permission denied/);
await assert.rejects(db.query(`select upsert_factory_production_queue_entry($1,$2)`,[d1.id,superadmin]), /forbidden/);
await db.exec(`select set_config('test.uid','${superadmin}',false)`);
assert.ok((await db.query(`select * from factory_production_queue_entries`)).rows.length>own.length);
await db.exec(`select set_config('test.uid','${graphic}',false)`);
assert.equal((await db.query(`select * from factory_production_queue_entries`)).rows.length,0);
await db.exec(`reset role; set role anon;`);
await assert.rejects(db.query(`select sync_factory_production_queue_entries(null)`),/permission denied/);
await db.exec(`reset role; set role service_role;`);
await status([q1.id],"ready_for_print",workerA);
await db.exec(`reset role`);
await db.close();
console.log("Production queue SQL passed: 12/6/6 balance, monthly totals, garment counts, draft/submission/cancellation, stable assignment, no-worker recovery, status ownership, atomic batches, RLS and migration replay.");
