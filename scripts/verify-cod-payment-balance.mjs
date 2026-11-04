// In-memory PostgreSQL only. Never connects to production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite');
const db = new PGlite();
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const migrate = async file => db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
const SETTLE = '20261107_cod_receipts_settle_order_balance.sql';
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table users(id uuid primary key,auth_user_id uuid,full_name text,role text,is_active boolean,permission_settings jsonb default '{}');
    insert into users values ('${uid(1)}','${uid(1)}','Admin','superadmin',true,'{}'),('${uid(2)}','${uid(2)}','Accountant','accountant',true,'{}'),('${uid(3)}','${uid(3)}','Staff','staff',true,'{}');
    create table orders(id uuid primary key,order_code text,order_date date default '2026-10-01',status text default 'in_progress',closed_at timestamptz,shipment_completed_at timestamptz,net_total numeric default 100000,factory_cost numeric default 40000,balance numeric default 0,customer_paid_full_at timestamptz);
    create table order_status_history(id uuid primary key default gen_random_uuid(),order_id uuid not null references orders(id) on delete cascade,action text not null,detail text,action_at timestamptz not null default now(),action_by_user_id uuid references users(id),action_meta jsonb);
    create table order_qr_labels(id uuid primary key);
    insert into order_qr_labels values ('${uid(5)}');
  `);
  for (const file of ['20260220_create_payment_transactions.sql', '20260327_create_shipment_delivery_requests.sql', '20260327_create_transport_notes.sql', '20260331_create_monthly_closings.sql', '20261102_add_transport_cod.sql', '20261103_create_transport_cod_receipts.sql', '20261106_cod_profit_recognition.sql']) await migrate(file);

  const addOrder = (n, balance) => db.query("insert into orders(id,order_code,balance,shipment_completed_at) values ($1,$2,$3,'2026-10-15T05:00:00Z')", [uid(n), `BG-${n}`, balance]);
  const addNote = (id, order, amount) => db.query("insert into transport_notes(id,note_no,order_id,cod_enabled,cod_amount) values ($1,$2,$3,true,$4)", [uid(id), `NOTE-${id}`, order === null ? null : uid(order), amount]);
  const order = n => one('select * from orders where id=$1', [uid(n)]);
  const txs = async n => (await db.query('select * from payment_transactions where order_id=$1 order by paid_at', [uid(n)])).rows;
  async function receive(source, id, amount) {
    await db.exec('begin');
    try {
      await db.query("select set_config('test.uid',$1,true)", [uid(1)]);
      await db.exec('set local role authenticated');
      const result = await one('select * from public.receive_transport_cod($1,$2,$3)', [source, uid(id), amount]);
      await db.exec('commit');
      return result;
    } catch (error) { await db.exec('rollback'); throw error; }
  }

  // Receipts that already exist when the migration runs.
  await addOrder(10, 60000); await addNote(30, 10, 60000);
  await addOrder(11, 0); await addNote(31, 11, 60000);
  await addOrder(12, 20000); await addNote(32, 12, 60000);
  await addOrder(13, 90000); await addNote(33, 13, 60000);
  await addOrder(14, 60000); await addNote(34, 14, 60000);
  for (const note of [30, 31, 32, 33]) {
    await db.query("insert into transport_cod_receipts(transport_note_id,amount,received_at,received_by_name) values ($1,60000,'2026-11-01T05:00:00Z','Admin')", [uid(note)]);
  }
  await migrate(SETTLE);
  await migrate(SETTLE);

  assert.equal(Number((await order(10)).balance), 0, 'Backfill clears a fully covered order');
  assert.equal((await order(10)).customer_paid_full_at.toISOString(), '2026-11-01T05:00:00.000Z', 'Backfill dates payment at receipt time');
  assert.equal((await txs(10)).length, 1, 'Re-running the migration does not post twice');
  assert.equal((await txs(10))[0].paid_at.toISOString(), '2026-11-01T05:00:00.000Z');
  assert.equal((await txs(11)).length, 0, 'Already settled order gains no duplicate income');
  assert.equal(Number((await txs(12))[0].amount), 20000, 'Backfill caps to the remaining balance');
  assert.equal(Number((await order(12)).balance), 0);
  assert.equal(Number((await order(13)).balance), 30000, 'Backfill keeps the rest outstanding');
  assert.equal((await order(13)).customer_paid_full_at, null, 'Partly paid order is not marked fully paid');

  // New receipts through the page RPC.
  assert.equal(Number((await order(14)).balance), 60000, 'Pending COD still counts as outstanding');
  const receipt = await receive('note', 34, 60000);
  assert.equal(Number((await order(14)).balance), 0, 'Receiving COD clears the outstanding balance');
  assert.ok((await order(14)).customer_paid_full_at, 'Receiving COD marks the order fully paid');
  assert.equal((await txs(14)).length, 1);
  assert.equal((await txs(14))[0].cod_receipt_id, receipt.id);
  assert.match((await txs(14))[0].note, /COD.*Admin/);
  assert.ok((await order(14)).profit_recognized_at, 'Profit recognition still happens with the receipt');
  assert.equal((await receive('note', 34, 60000)).id, receipt.id);
  assert.equal((await txs(14)).length, 1, 'Retry does not post twice');
  assert.equal(Number((await order(14)).balance), 0);

  await addOrder(15, 100000); await addNote(35, 15, 30000); await addNote(36, 15, 30000);
  await receive('note', 35, 30000);
  assert.equal(Number((await order(15)).balance), 70000, 'First split COD reduces the balance only by its amount');
  assert.equal((await order(15)).customer_paid_full_at, null);
  await receive('note', 36, 30000);
  assert.equal(Number((await order(15)).balance), 40000, 'Second split COD reduces it again');

  await addOrder(16, 60000);
  await db.query("insert into shipment_delivery_requests(id,request_no,order_id,qr_label_id,delivery_method,transport_cod_enabled,transport_cod_amount) values ($1,'REQ-A',$2,$3,'transport',true,60000)", [uid(40), uid(16), uid(5)]);
  await db.query("insert into transport_notes(id,note_no,delivery_request_id,cod_enabled,cod_amount) values ($1,'LINKED-A',$2,true,60000)", [uid(41), uid(40)]);
  await receive('request', 40, 60000);
  assert.equal(Number((await order(16)).balance), 0, 'Order is found through the request and counted once');
  assert.equal((await txs(16)).length, 1);

  await addOrder(17, 10000); await addNote(37, 17, 60000);
  await receive('note', 37, 60000);
  assert.equal(Number((await order(17)).balance), 0, 'Balance never goes negative');
  assert.equal(Number((await txs(17))[0].amount), 60000, 'Log keeps the cash actually received');

  await addNote(38, null, 5000);
  await receive('note', 38, 5000);
  assert.equal((await one('select count(*)::int as n from payment_transactions where amount=5000')).n, 0, 'Standalone note posts no order payment');

  const CANCEL = '20261108_cancel_transport_cod_receipt.sql';
  await migrate(CANCEL);
  await migrate(CANCEL);
  async function cancel(source, id, reason = 'Pressed by mistake', user = 1) {
    await db.exec('begin');
    try {
      await db.query("select set_config('test.uid',$1,true)", [uid(user)]);
      await db.exec('set local role authenticated');
      await db.query('select public.cancel_transport_cod_receipt($1,$2,$3)', [source, uid(id), reason]);
      await db.exec('commit');
    } catch (error) { await db.exec('rollback'); throw error; }
  }
  const receipts = async note => (await one('select count(*)::int as n from transport_cod_receipts where transport_note_id=$1', [uid(note)])).n;

  // Cancelling undoes the balance, payment log and profit together.
  await cancel('note', 34, 'Pressed by mistake', 2);
  assert.equal(Number((await order(14)).balance), 60000, 'Cancel restores the balance');
  assert.equal((await order(14)).customer_paid_full_at, null, 'Cancel clears the fully-paid date');
  assert.equal((await txs(14)).length, 0, 'Cancel removes the payment');
  assert.equal(await receipts(34), 0, 'Cancel returns the item to pending');
  assert.equal((await order(14)).profit_recognized_at, null, 'Cancel withdraws recognized profit');
  assert.equal((await order(14)).cod_pending_count, 1);
  const history = await one('select * from order_status_history where order_id=$1', [uid(14)]);
  assert.equal(history.action, 'cancel_cod_receipt');
  assert.equal(history.action_by_user_id, uid(2), 'History records who cancelled');
  assert.match(history.detail, /NOTE-34; amount=60000.*received_by=Admin; reason=Pressed by mistake/);
  await cancel('note', 34);
  assert.equal(Number((await order(14)).balance), 60000, 'Retry does not restore twice');
  assert.equal((await one('select count(*)::int as n from order_status_history where order_id=$1', [uid(14)])).n, 1);

  await receive('note', 34, 60000);
  assert.equal(Number((await order(14)).balance), 0, 'A cancelled COD can be received again');
  assert.equal((await txs(14)).length, 1);

  await addOrder(18, 10000); await addNote(39, 18, 60000);
  await receive('note', 39, 60000);
  assert.equal(Number((await order(18)).balance), 0);
  await cancel('note', 39);
  assert.equal(Number((await order(18)).balance), 10000, 'Cancel restores only the real reduction, not the cash above the balance');
  // Known limit: a receipt above the balance posted before this migration has no
  // recorded reduction, so cancelling it falls back to the full payment amount.
  await cancel('note', 37);
  assert.equal(Number((await order(17)).balance), 60000, 'Pre-migration payment falls back to its amount');
  await cancel('note', 31);
  assert.equal(Number((await order(11)).balance), 0, 'Receipt that never posted a payment changes no balance');
  await cancel('note', 32);
  assert.equal(Number((await order(12)).balance), 20000, 'Backfilled payment restores its capped amount');
  await receive('note', 36, 30000);
  await cancel('note', 36);
  assert.equal(Number((await order(15)).balance), 70000, 'Cancelling one split COD keeps the other');
  assert.equal((await txs(15)).length, 1);
  await cancel('request', 40);
  assert.equal(Number((await order(16)).balance), 60000, 'Order is found through the request');
  await cancel('note', 38);
  assert.equal(await receipts(38), 0, 'Standalone note can be cancelled');

  await db.query("update orders set status='completed',closed_at=now() where id=$1", [uid(14)]);
  await assert.rejects(cancel('note', 34), /cod_order_closed/, 'Closed order is protected');
  assert.equal(await receipts(34), 1);
  await db.query("update orders set status='in_progress',closed_at=null where id=$1", [uid(14)]);
  await assert.rejects(cancel('note', 34, '   '), /cod_cancel_reason_required/);
  await assert.rejects(cancel('note', 34, 'x', 3), /cod_forbidden/, 'Staff cannot cancel');
  await db.query("update users set permission_settings=$1 where id=$2", [{ access: { '/shipments/cod': 'deny' } }, uid(2)]);
  await assert.rejects(cancel('note', 34, 'x', 2), /cod_forbidden/, 'Page denial also blocks an accountant');
  assert.equal(await receipts(34), 1);

  await db.exec('begin');
  await db.query("select set_config('test.uid',$1,true)", [uid(1)]);
  await db.exec('set local role authenticated');
  await assert.rejects(db.query("select public.post_transport_cod_payment($1,false)", [uid(30)]), /permission denied/, 'Posting cannot be called directly');
  await db.exec('rollback');

  console.log('COD payment SQL passed: backfill dates/caps/idempotency, balance cleared, fully-paid date, profit recognition kept, retry, split COD, request lookup, no negative balance, standalone notes, cancel restores balance/payment/profit with audit, retry, re-receive, closed order, reason, roles, direct call denied.');
} finally { await db.close(); }
