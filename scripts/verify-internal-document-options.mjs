// Isolated PostgreSQL fixtures. Never connects to the live database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite');
const db = new PGlite();
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.users(id uuid primary key, auth_user_id uuid, role text, is_active boolean, permission_settings jsonb default '{}');
    insert into public.users values
      ('${uid(1)}','${uid(1)}','superadmin',true,'{}'),
      ('${uid(2)}','${uid(2)}','manager',true,'{}'),
      ('${uid(3)}','${uid(3)}','staff',true,'{}'),
      ('${uid(4)}','${uid(4)}','superadmin',false,'{}');
    grant select on public.users to authenticated;
    create table public.fabrics(id uuid primary key);
    create table public.orders(id uuid primary key default gen_random_uuid(), collar_type text not null default 'none' check(collar_type in ('none','polo','mandarin')), work_category text check(work_category in ('sports','team_group')));
  `);
  const migrate=async file=>db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
  for(const file of ['20260403_create_design_queue_entries.sql','20260325_create_quotation_drafts.sql','20260323_create_factory_deposit_orders.sql','20261020_link_queue_customer_documents.sql']) await migrate(file);
  await db.query('insert into quotation_drafts(created_by_user_id,quote_date,collar_type,collar_qty,work_category) values ($1,$2,$3,2,$4)',[uid(1),'2026-10-29','polo','sports']);
  await migrate('20261104_create_internal_document_options.sql');
  await migrate('20261104_create_internal_document_options.sql');
  const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
  const historical=await one('select * from quotation_drafts limit 1');
  assert.equal(historical.collar_unit_price,'20000.00');assert.equal(historical.collar_label,'ຄໍໂປໂລ');
  async function as(user,sql,args=[]) {
    await db.exec('begin');
    try {
      await db.query("select set_config('test.uid',$1,true)",[user]);await db.exec('set local role authenticated');
      const result=await db.query(sql,args);await db.exec('commit');return result.rows;
    } catch(error){await db.exec('rollback');throw error;}
  }
  await assert.rejects(as(uid(3),"insert into internal_collar_types(code,label,unit_price) values ('forged','Forged',1)"),/row-level security/);
  await assert.rejects(as(uid(4),"insert into internal_collar_types(code,label,unit_price) values ('inactive','Inactive',1)"),/row-level security/);
  assert.equal((await as(uid(3),'select * from internal_work_categories')).length,8,'Document users can read choices');
  await as(uid(2),"insert into internal_collar_types(code,label,unit_price) values ('zip_collar','ຄໍຊິບ',35000)");
  await as(uid(1),"insert into internal_work_categories(code,label) values ('cycling','ເສື້ອລົດຖີບ')");
  await assert.rejects(as(uid(2),"update internal_collar_types set code='zip2' where code='zip_collar'"),/immutable/);
  await assert.rejects(as(uid(2),"update internal_collar_types set unit_price=-1 where code='zip_collar'"),/check constraint/);
  await assert.rejects(as(uid(2),"update internal_collar_types set unit_price='NaN' where code='zip_collar'"),/check constraint/);
  await assert.rejects(as(uid(2),"update internal_collar_types set is_active=false where code='none'"),/check constraint/);
  await assert.rejects(as(uid(2),"delete from internal_collar_types where code='polo'"),/permission denied/);
  const quote=await one(`insert into quotation_drafts(created_by_user_id,quote_date,collar_type,collar_qty,work_category) values ($1,'2026-10-29','zip_collar',3,'cycling') returning *`,[uid(1)]);
  assert.equal(quote.collar_unit_price,'35000.00');assert.equal(quote.collar_label,'ຄໍຊິບ');assert.equal(quote.work_category_label,'ເສື້ອລົດຖີບ');
  await as(uid(2),"update internal_collar_types set unit_price=45000,label='ຄໍຊິບໃໝ່' where code='zip_collar'");
  await as(uid(2),"update internal_work_categories set label='ກິລາລົດຖີບ',is_active=false where code='cycling'");
  await db.query("update quotation_drafts set notes='Unrelated edit' where id=$1",[quote.id]);
  const preserved=await one('select * from quotation_drafts where id=$1',[quote.id]);
  assert.equal(preserved.collar_unit_price,'35000.00');assert.equal(preserved.collar_label,'ຄໍຊິບ');assert.equal(preserved.work_category_label,'ເສື້ອລົດຖີບ');
  const deposit=await one(`insert into factory_deposit_orders(deposit_no,deposit_date,quotation_draft_id,collar_type,collar_qty,collar_label,collar_unit_price,work_category_label) values ('','2026-10-29',$1,'zip_collar',3,$2,$3,$4) returning *`,[quote.id,quote.collar_label,quote.collar_unit_price,"Stale submitted label"]);
  assert.equal(deposit.collar_unit_price,'35000.00');assert.equal(deposit.work_category,'cycling');assert.equal(deposit.work_category_label,'ເສື້ອລົດຖີບ');
  const order=await one('insert into orders(collar_type,work_category,collar_label,collar_unit_price,work_category_label) values ($1,$2,$3,$4,$5) returning *',[deposit.collar_type,deposit.work_category,deposit.collar_label,deposit.collar_unit_price,deposit.work_category_label]);
  assert.equal(order.collar_unit_price,'35000.00');assert.equal(order.work_category_label,'ເສື້ອລົດຖີບ');
  const fresh=await one(`insert into quotation_drafts(created_by_user_id,quote_date,collar_type) values ($1,'2026-10-29','zip_collar') returning *`,[uid(1)]);
  assert.equal(fresh.collar_unit_price,'45000.00');assert.equal(fresh.collar_label,'ຄໍຊິບໃໝ່');
  await assert.rejects(db.query("insert into orders(collar_type) values ('missing')"),/foreign key/);
  await assert.rejects(db.query("insert into orders(work_category) values ('missing')"),/foreign key/);
  await migrate('20261104_create_internal_document_options.sql');
  assert.equal((await one('select * from quotation_drafts where id=$1',[quote.id])).collar_unit_price,'35000.00');
  await db.query('update users set permission_settings=$1 where id=$2',[{access:{'/settings':'deny'}},uid(2)]);
  assert.equal((await as(uid(2),"update internal_work_categories set label='Denied' where code='sports' returning code")).length,0);
  await db.query('update users set permission_settings=$1 where id=$2',[{access:{'/settings':'deny','/settings/work-categories':'allow'}},uid(2)]);
  await as(uid(2),"update internal_work_categories set label='Allowed' where code='sports'");
  await migrate('20261105_create_production_collar_types.sql');
  await migrate('20261105_create_production_collar_types.sql');
  assert.equal((await one('select count(*)::int as n from internal_production_collar_types')).n,14);
  assert.equal((await as(uid(3),'select * from internal_production_collar_types')).length,14);
  await assert.rejects(as(uid(3),"insert into internal_production_collar_types(code,label) values ('forged','Forged')"),/row-level security/);
  await assert.rejects(as(uid(4),"insert into internal_production_collar_types(code,label) values ('inactive','Inactive')"),/row-level security/);
  await db.query('update users set permission_settings=$1 where id=$2',[{},uid(2)]);
  await as(uid(2),"insert into internal_production_collar_types(code,label) values ('split_neck','ຄໍແບບໃໝ່')");
  assert.equal((await one("select count(*)::int as n from internal_collar_types where code='split_neck'")).n,0,'Production choices do not add surcharges');
  await as(uid(2),"update internal_production_collar_types set label='Renamed',is_active=false where code='split_neck'");
  await assert.rejects(as(uid(2),"update internal_production_collar_types set code='different' where code='split_neck'"),/immutable/);
  await assert.rejects(as(uid(2),"update internal_production_collar_types set is_active=false where code='crew'"),/check constraint/);
  await assert.rejects(as(uid(2),"delete from internal_production_collar_types where code='split_neck'"),/permission denied/);
  await db.query('update users set permission_settings=$1 where id=$2',[{access:{'/settings':'deny'}},uid(2)]);
  assert.equal((await as(uid(2),"update internal_production_collar_types set label='Denied' where code='split_neck' returning code")).length,0);
  await db.query('update users set permission_settings=$1 where id=$2',[{access:{'/settings':'deny','/settings/production-collars':'allow'}},uid(2)]);
  await as(uid(2),"update internal_production_collar_types set label='Allowed' where code='split_neck'");
  assert.equal((await as(uid(2),"select can_manage_internal_document_options('collars') as allowed"))[0].allowed,false,'Production permission does not grant surcharge management');
  await db.exec('begin;set local role anon');
  await assert.rejects(db.query('select * from internal_collar_types'),/permission denied/);await db.exec('rollback');
  await db.exec('begin;set local role anon');
  await assert.rejects(db.query('select * from internal_production_collar_types'),/permission denied/);await db.exec('rollback');
  console.log('Internal options SQL passed: defaults, repeatable migration, custom choices, quote→deposit→order snapshots, historical prices, renamed/disabled choices, FK validation, immutable codes, role/parent/child permissions, anonymous access denied.');
} finally {await db.close();}
