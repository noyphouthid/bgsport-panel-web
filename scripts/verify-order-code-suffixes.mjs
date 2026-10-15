// Order-code helpers and isolated PostgreSQL checks; no production database access.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildOrderCode, normalizeOrderNo, parseOrderCode } from "../lib/order-code.ts";
const { PGlite } = await import(process.argv[2] || "@electric-sql/pglite");

for (const suffix of ["9124+2", "9124+A", "9124A+2", "9124+2A"]) {
  const code = `RK26-${suffix}`;
  assert.equal(normalizeOrderNo(suffix.toLowerCase()), suffix);
  assert.equal(buildOrderCode("RK26", suffix), code);
  const parsed = parseOrderCode(code);
  assert.deepEqual(parsed, { orderType: "RK26", orderNo: suffix });
  assert.equal(buildOrderCode(parsed.orderType, parsed.orderNo), code);
}
assert.equal(buildOrderCode("RK26", "1"), "RK26-001");

const db = new PGlite();
try {
  const admin = "00000000-0000-4000-8000-000000000001";
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table users (id uuid primary key, auth_user_id uuid, role text);
    insert into users values ('${admin}', '${admin}', 'admin');
    select set_config('test.uid', '${admin}', false);
    create table fabrics (id uuid primary key);
    create table orders (id uuid primary key default gen_random_uuid(), order_code text unique);
  `);
  const migration = async name => db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  for (const name of ["20260403_create_design_queue_entries.sql", "20260325_create_quotation_drafts.sql", "20260323_create_factory_deposit_orders.sql", "20260521_split_design_deposit_and_discount_fields.sql", "20261020_link_queue_customer_documents.sql", "20261021_add_queue_design_deposits.sql"]) await migration(name);
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const queue = await one(`select * from create_design_queue_entry(p_queue_date => '2026-10-16', p_type_code => 'RK26', p_customer_name => 'Repeat customer', p_customer_phone => '2099999999', p_work_category => 'sports', p_design_payment_type => 'deposit', p_design_deposit_amount => 100000.50)`);
  const quote = (code, queueId = queue.id) => one(`insert into quotation_drafts(created_by_user_id,quote_date,design_queue_entry_id,order_code) values ($1,'2026-10-16',$2,$3) returning *`, [admin, queueId, code]);
  const deposit = (quotation, code = "") => one(`insert into factory_deposit_orders(quotation_draft_id,deposit_no,deposit_date,order_code) values ($1,'','2026-10-16',$2) returning *`, [quotation.id, code]);
  const historical = await quote("");
  const oldDeposit = await deposit(historical);
  await migration("20261022_allow_order_code_suffixes.sql");
  await migration("20261022_allow_order_code_suffixes.sql");
  assert.deepEqual(await one(`select * from quotation_drafts where id=$1`, [historical.id]), historical);
  assert.deepEqual(await one(`select * from factory_deposit_orders where id=$1`, [oldDeposit.id]), oldDeposit);

  for (const code of ["RK26-9124+2", "RK26-9124+A", "RK26-9124A+2"]) {
    const savedQuote = await quote(` ${code} `);
    assert.equal(savedQuote.order_code, code, "Queue linking must preserve the entered code");
    assert.equal(savedQuote.design_deposit, "100000.50");
    assert.equal(savedQuote.customer_name, queue.customer_name);
    assert.equal(savedQuote.work_category, "sports");
    const savedDeposit = await deposit(savedQuote);
    assert.equal(savedDeposit.order_code, code, "Deposits inherit a quotation's suffix");
    assert.equal(savedDeposit.design_deposit, "100000.50");
    assert.equal(savedDeposit.quotation_quote_no, savedQuote.quote_no);
    assert.equal(savedDeposit.design_queue_entry_id, queue.id);
    assert.equal((await one(`insert into orders(order_code) values ($1) returning *`, [savedDeposit.order_code])).order_code, code);
    assert.equal((await one(`select * from quotation_drafts where order_code ilike '%' || $1 || '%'`, [code.toLowerCase()])).id, savedQuote.id);
    const edited = await one(`update factory_deposit_orders set notes='ordinary edit' where id=$1 returning *`, [savedDeposit.id]);
    assert.equal(edited.order_code, code);
    assert.equal(edited.deposit_no, savedDeposit.deposit_no);
  }
  const explicitDeposit = await deposit(historical, " RK26-9124+2A ");
  assert.equal(explicitDeposit.order_code, "RK26-9124+2A", "An explicit deposit suffix must survive creation from a base quotation");
  assert.equal((await quote(" ")).order_code, `${queue.type_code}-${queue.order_no}`);
  assert.equal((await quote("RK26-9124+3", null)).order_code, "RK26-9124+3");
  const editedQuote = await one(`update quotation_drafts set order_code='RK26-9124+4' where id=$1 returning *`, [historical.id]);
  assert.equal(editedQuote.order_code, "RK26-9124+4");
  assert.equal(editedQuote.quote_no, historical.quote_no);
  assert.equal((await one(`select * from factory_deposit_orders where id=$1`, [oldDeposit.id])).order_code, oldDeposit.order_code, "Source edits must not rewrite existing deposit snapshots");

  // Link-only reselection inherits the new source; explicitly changed codes survive.
  const freeQueue = await one(`select * from create_design_queue_entry(p_queue_date => '2026-10-16', p_type_code => 'RK26', p_design_payment_type => 'free')`);
  const reselected = await one(`update quotation_drafts set design_queue_entry_id=$1 where id=$2 returning *`, [freeQueue.id, editedQuote.id]);
  assert.equal(reselected.order_code, `${freeQueue.type_code}-${freeQueue.order_no}`);
  assert.equal(reselected.design_deposit, "0.00");
  const customized = await one(`update quotation_drafts set design_queue_entry_id=$1,order_code='RK26-9124+5' where id=$2 returning *`, [queue.id, editedQuote.id]);
  assert.equal(customized.order_code, "RK26-9124+5");
  assert.equal(customized.design_deposit, "100000.50");
  const otherQuote = await quote("RK26-9124+6");
  assert.equal((await one(`update factory_deposit_orders set quotation_draft_id=$1 where id=$2 returning *`, [otherQuote.id, explicitDeposit.id])).order_code, otherQuote.order_code);
  assert.equal((await one(`update factory_deposit_orders set quotation_draft_id=$1,order_code='RK26-9124+7' where id=$2 returning *`, [historical.id, explicitDeposit.id])).order_code, "RK26-9124+7");
  await assert.rejects(quote("RK26-9124+8", "00000000-0000-4000-8000-000000000099"));
  const flags = await one(`select prosecdef from pg_proc where oid='public.link_workflow_customer()'::regprocedure`);
  assert.equal(flags.prosecdef, false, "The trigger must continue to obey the caller's RLS");
  console.log("PASS: order-code round trips, numeric/alphabetic suffixes, linked quotation/deposit inserts and edits, literal searches, source reselection, payment inheritance, legacy preservation and repeat migration");
} finally {
  await db.close();
}
