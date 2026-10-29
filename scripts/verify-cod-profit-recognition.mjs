// In-memory PostgreSQL only. Never connects to production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite');
const db=new PGlite();
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
const migrate=async file=>db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table users(id uuid primary key,auth_user_id uuid,full_name text,role text,is_active boolean,permission_settings jsonb default '{}');
    insert into users values ('${uid(1)}','${uid(1)}','Admin','superadmin',true,'{}'),('${uid(2)}','${uid(2)}','Accountant','accountant',true,'{"access":{"/shipments/cod":"deny"}}');
    create table orders(id uuid primary key,order_code text,order_date date default '2026-10-01',status text default 'in_progress',shipment_completed_at timestamptz,net_total numeric default 100000,factory_cost numeric default 40000,balance numeric default 0);
    create table order_qr_labels(id uuid primary key);
    insert into order_qr_labels values ('${uid(5)}');
    grant select,update on orders to authenticated;
  `);
  for(const file of ['20260327_create_shipment_delivery_requests.sql','20260327_create_transport_notes.sql','20260331_create_monthly_closings.sql','20261102_add_transport_cod.sql','20261103_create_transport_cod_receipts.sql'])await migrate(file);
  for(let n=10;n<=18;n++)await db.query("insert into orders(id,order_code,shipment_completed_at) values ($1,$2,'2026-10-15T05:00:00Z')",[uid(n),`BG-${n}`]);
  await db.query("insert into transport_notes(id,note_no,order_id,cod_enabled,cod_amount) values ($1,'COD-PENDING',$2,true,60000),($3,'COD-PAID',$4,true,60000)",[uid(30),uid(11),uid(31),uid(12)]);
  await db.query("insert into transport_cod_receipts(transport_note_id,amount,received_at,received_by_name) values ($1,60000,'2026-10-31T17:30:00Z','Admin')",[uid(31)]);
  await db.query("insert into monthly_closings(month_key,start_date,end_date,status,total_profit) values ('2026-09','2026-09-01','2026-09-30','closed',123)");
  await migrate('20261106_cod_profit_recognition.sql');
  await migrate('20261106_cod_profit_recognition.sql');
  const order=async n=>one('select * from orders where id=$1',[uid(n)]);
  assert.equal((await order(10)).profit_recognized_at.toISOString(),'2026-10-15T05:00:00.000Z','Non-COD keeps shipment date');
  assert.equal((await order(11)).profit_recognized_at,null,'Unreceived COD is removed from old shipped profit');
  assert.equal((await order(11)).cod_pending_count,1);
  assert.equal((await order(12)).profit_recognized_at.toISOString(),'2026-10-31T17:30:00.000Z','Backfill uses existing receipt, never migration time');
  await db.query("update orders set profit_recognized_at='2026-10-01',has_transport_cod=false,cod_pending_count=0 where id=$1",[uid(11)]);
  assert.equal((await order(11)).profit_recognized_at,null);assert.equal((await order(11)).has_transport_cod,true,'Cannot forge recognition metadata');
  await db.query("insert into shipment_delivery_requests(id,request_no,order_id,qr_label_id,delivery_method,transport_cod_enabled,transport_cod_amount) values ($1,'REQ-A',$2,$3,'transport',true,60000)",[uid(40),uid(13),uid(5)]);
  assert.equal((await order(13)).profit_recognized_at,null,'Request without note gates recognition');
  await db.query("insert into transport_notes(id,note_no,delivery_request_id,cod_enabled,cod_amount) values ($1,'LINKED-A',$2,true,60000)",[uid(41),uid(40)]);
  assert.equal((await order(13)).cod_pending_count,1,'Request and linked note count once');
  await db.query("insert into transport_notes(id,note_no,order_id,cod_enabled,cod_amount) values ($1,'PART-1',$3,true,30000),($2,'PART-2',$3,true,30000)",[uid(50),uid(51),uid(14)]);
  assert.equal((await order(14)).cod_pending_count,2);
  async function receive(source,id,amount) {
    await db.exec('begin');
    try {
      await db.query("select set_config('test.uid',$1,true)",[uid(1)]);await db.exec('set local role authenticated');
      const result=await one('select * from public.receive_transport_cod($1,$2,$3)',[source,uid(id),amount]);
      await db.exec('commit');return result;
    }catch(error){await db.exec('rollback');throw error;}
  }
  const first=await receive('note',50,30000);
  await db.query("update transport_cod_receipts set received_at='2026-10-20T05:00:00Z' where id=$1",[first.id]);
  assert.equal((await order(14)).profit_recognized_at,null,'Partial COD cannot recognize a whole order');
  const second=await receive('note',51,30000);
  await db.query("update transport_cod_receipts set received_at='2026-11-03T05:00:00Z' where id=$1",[second.id]);
  assert.equal((await order(14)).profit_recognized_at.toISOString(),'2026-11-03T05:00:00.000Z');
  assert.equal((await order(14)).cod_pending_count,0);
  assert.equal((await receive('note',51,30000)).id,second.id);
  assert.equal((await order(14)).profit_recognized_at.toISOString(),'2026-11-03T05:00:00.000Z','Retry cannot move profit to a new month');
  const linked=await receive('request',40,60000);
  await db.query("update transport_cod_receipts set received_at='2026-11-02T05:00:00Z' where id=$1",[linked.id]);
  assert.equal((await order(13)).profit_recognized_at.toISOString(),'2026-11-02T05:00:00.000Z','Receipt finds order through request even when note.order_id is null');
  await db.query("update orders set shipment_completed_at='2026-12-01T00:00:00Z' where id=$1",[uid(13)]);
  assert.equal((await order(13)).profit_recognized_at.toISOString(),'2026-11-02T05:00:00.000Z','Later delivery updates cannot move COD profit');
  await db.query('delete from transport_cod_receipts where id=$1',[second.id]);
  assert.equal((await order(14)).profit_recognized_at,null,'Receipt rollback defers recognition again');
  await db.query("insert into transport_notes(id,note_no,order_id,cod_enabled,cod_amount) values ($1,'MOVE',$2,true,60000)",[uid(60),uid(15)]);
  await db.query('update transport_notes set order_id=$1 where id=$2',[uid(16),uid(60)]);
  assert.equal((await order(15)).has_transport_cod,false);assert.equal((await order(16)).profit_recognized_at,null);
  await db.query('delete from transport_notes where id=$1',[uid(60)]);
  assert.equal((await order(16)).has_transport_cod,false);assert.ok((await order(16)).profit_recognized_at);
  await db.query("update orders set shipment_completed_at=null where id=$1",[uid(17)]);assert.equal((await order(17)).profit_recognized_at,null);
  await db.exec('begin');await db.query("select set_config('test.uid',$1,true)",[uid(2)]);await db.exec('set local role authenticated');
  assert.equal((await one('select count(*)::int as n from transport_cod_receipts')).n,0,'Accountant cannot manage COD');
  assert.ok((await one('select profit_recognized_at from orders where id=$1',[uid(12)])).profit_recognized_at,'Reporting still sees authoritative recognition');
  await db.exec('commit');
  assert.equal((await one("select total_profit from monthly_closings where month_key='2026-09'")).total_profit,'123.00','Migration preserves closed history');
  const nov=await one("insert into monthly_closings(month_key,start_date,end_date,status,total_profit,total_sales,summary_snapshot) values ('2026-11','2026-11-01','2026-11-30','closed',999999,999999,'{}') returning *");
  assert.equal(nov.total_orders,2);assert.equal(nov.total_profit,'120000.00');assert.equal(nov.total_sales,'200000.00');
  assert.equal(nov.summary_snapshot.recognition_basis,'cod_receipt_v1');
  assert.deepEqual(nov.summary_snapshot.orders.map(row=>row.id).sort(),[uid(12),uid(13)],'Lao month boundary and earlier order dates are respected');
  assert.equal(nov.summary_snapshot.orders.some(row=>row.id===uid(11)),false,'No pending COD in closing');
  await migrate('20261106_cod_profit_recognition.sql');
  assert.equal((await one("select total_profit from monthly_closings where month_key='2026-09'")).total_profit,'123.00');
  console.log('COD profit SQL passed: legacy backfill, pending/partial exclusion, receipt transaction/retry, split shipments, request/note deduplication, reassignment/deletion, immutable derived dates, report permissions, Lao month boundary, fresh server-side closing, preserved historical snapshots.');
}finally{await db.close();}
