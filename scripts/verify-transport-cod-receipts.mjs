// Isolated PostgreSQL verification. No live database connections or writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite');
const db = new PGlite();
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create table public.users(id uuid primary key, auth_user_id uuid, full_name text not null, role text, is_active boolean, permission_settings jsonb default '{}');
    create table public.orders(id uuid primary key, order_code text);
    create table public.order_qr_labels(id uuid primary key);
    insert into public.users(id,auth_user_id,full_name,role,is_active) values
      ('${uid(1)}','${uid(1)}','Admin','superadmin',true),
      ('${uid(2)}','${uid(2)}','Staff','staff',true),
      ('${uid(3)}','${uid(3)}','Designer','graphic',true),
      ('${uid(4)}','${uid(4)}','Inactive','superadmin',false);
    insert into public.orders values ('${uid(10)}','BG-COD-001');
    insert into public.order_qr_labels values ('${uid(11)}');
  `);
  for (const file of ['20260327_create_shipment_delivery_requests.sql','20260327_create_transport_notes.sql','20261102_add_transport_cod.sql','20261103_create_transport_cod_receipts.sql','20261103_create_transport_cod_receipts.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
  }
  await db.query(`insert into public.shipment_delivery_requests(id,request_no,order_id,qr_label_id,delivery_method,transport_cod_enabled,transport_cod_amount,transport_receiver_name) values
    ($1,'REQ-1',$3,$4,'transport',true,200000,'Linked receiver'),
    ($2,'REQ-2',$3,$4,'transport',true,300000,'Orphan receiver')`,[uid(20),uid(21),uid(10),uid(11)]);
  await db.query(`insert into public.transport_notes(id,note_no,delivery_request_id,cod_enabled,cod_amount,receiver_name,transporters) values
    ($1,'NOTE-1',$3,true,200000,'Linked receiver','{"HAL Logistic"}'),
    ($2,'NOTE-2',null,true,100000,'Standalone receiver','{"Anousith Express"}')`,[uid(30),uid(31),uid(20)]);
  async function as(role,user,sql,args=[]) {
    await db.exec('begin');
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user || '']);
      await db.exec(`set local role ${role}`);
      const result = await db.query(sql,args);
      await db.exec('commit');return result.rows;
    } catch(error) {await db.exec('rollback');throw error;}
  }
  const list = async (user=uid(1),query='',status='all',limit=50,offset=0) =>
    (await as('authenticated',user,'select public.list_transport_cod($1,$2,$3,$4) as data',[query,status,limit,offset]))[0].data;
  const receive = async(source,id,amount,user=uid(1)) =>
    (await as('authenticated',user,'select (public.receive_transport_cod($1,$2,$3)).*',[source,id,amount]))[0];
  const initial = await list();
  assert.equal(initial.total,3,'Linked snapshots count once and orphan requests remain visible');
  assert.equal(initial.summary.total,600000);
  assert.equal(initial.summary.pending_amount,600000);
  assert.equal(initial.rows.filter(row=>row.delivery_request_id===uid(20)).length,1);
  await assert.rejects(receive('note',uid(31),999),/cod_amount_changed/);
  assert.equal((await db.query('select count(*)::int as n from transport_cod_receipts')).rows[0].n,0);
  const receipt = await receive('note',uid(31),100000,uid(2));
  assert.equal(receipt.received_by_name,'Staff');
  assert.equal((await receive('note',uid(31),100000)).id,receipt.id,'Retry returns the same receipt');
  assert.equal((await receive('note',uid(31),999)).id,receipt.id,'Retry cannot alter an existing receipt');
  assert.equal((await list()).summary.received_amount,100000);
  assert.equal((await list()).summary.pending_amount,500000);
  assert.equal((await list(uid(1),'','received')).total,1);
  assert.equal((await list(uid(1),'','pending')).total,2);
  assert.equal((await list(uid(1),'standalone')).total,1);
  assert.equal((await list(uid(1),'HAL')).total,0,'Linked request snapshot is canonical');
  assert.equal((await list(uid(1),'%')).total,0,'Search treats wildcards literally');
  assert.equal((await list(uid(1),'', 'all', 1, 1)).rows.length,1);
  await assert.rejects(db.query('update transport_notes set cod_amount=1 where id=$1',[uid(31)]),/COD/);
  await assert.rejects(db.query('delete from transport_notes where id=$1',[uid(31)]),/foreign key/);
  await db.query('update transport_notes set receiver_phone=$1 where id=$2',['02012345678',uid(31)]);
  await receive('request',uid(20),200000);
  await assert.rejects(db.query('update shipment_delivery_requests set transport_cod_amount=1 where id=$1',[uid(20)]),/COD/);
  await assert.rejects(db.query('update transport_notes set cod_enabled=false,cod_amount=0 where id=$1',[uid(30)]),/COD/);
  await receive('request',uid(21),300000);
  assert.equal((await list()).summary.pending_amount,0);
  assert.equal((await list()).summary.received_amount,600000);
  await assert.rejects(list(uid(3)),/cod_forbidden/);
  await assert.rejects(list(uid(4)),/cod_forbidden/);
  await assert.rejects(as('anon',null,'select public.list_transport_cod()'),/permission denied/);
  await assert.rejects(as('authenticated',uid(2),'select * from public.transport_cod_items'),/permission denied/);
  await assert.rejects(as('authenticated',uid(2),`insert into transport_cod_receipts(transport_note_id,amount,received_by_name) values ($1,1,'Forged')`,[uid(31)]),/permission denied/);
  await assert.rejects(as('authenticated',uid(2),'update transport_cod_receipts set amount=1'),/permission denied/);
  await db.query('update users set permission_settings=$1 where id=$2',[{access:{'/shipments':'deny'}},uid(2)]);
  await assert.rejects(list(uid(2)),/cod_forbidden/);
  await assert.rejects(receive('request',uid(20),200000,uid(2)),/cod_forbidden/);
  await db.query('update users set permission_settings=$1 where id=$2',[{access:{'/shipments':'deny','/shipments/cod':'allow'}},uid(2)]);
  assert.equal((await list(uid(2))).total,3);
  await db.query('update users set permission_settings=$1 where id=$2',[{access:{'/shipments':'allow','/shipments/cod':'deny'}},uid(2)]);
  await assert.rejects(list(uid(2)),/cod_forbidden/);
  await db.query(`insert into public.transport_notes(note_no,cod_enabled,cod_amount) select 'BULK-'||n,true,1 from generate_series(1,1005) n`);
  const afterCap=await list(uid(1),'BULK-','pending',50,1000);
  assert.equal(afterCap.total,1005);assert.equal(afterCap.rows.length,5);
  assert.equal(afterCap.summary.pending_amount,1005,'Summary covers every page');
  await assert.rejects(list(uid(1),'','invalid'),/invalid_cod_status/);
  console.log('COD SQL passed: repeatable migration, deduplication, orphan requests, exact amounts, retry idempotency, audit identity, filters/totals, protected edits, role/parent/child permissions, denied direct writes, pagination past 1000 rows.');
} finally { await db.close(); }
