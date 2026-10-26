// Isolated PostgreSQL validation; no production writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite');
const { outputText } = ts.transpileModule(await readFile(new URL('../lib/shipment-delivery-requests.ts',import.meta.url),'utf8'),{ compilerOptions:{ module:ts.ModuleKind.CommonJS } });
const compiled = { exports:{} };
new Function('module','exports',outputText)(compiled,compiled.exports);
const { getShipmentAttachments } = compiled.exports;
const db = new PGlite();
try {
  await db.exec(`create table public.shipment_delivery_requests (
    id text primary key, transfer_slip_path text, transfer_slip_url text,
    handoff_photo_path text, handoff_photo_url text, handoff_photo_file_name text);
    insert into public.shipment_delivery_requests values
      ('legacy','order/slip.png','https://example.test/slip.png','order/photo.png','https://example.test/photo.png','Product.png'),
      ('empty',null,null,null,null,null);`);
  const migration = await readFile(new URL('../supabase/migrations/20261031_add_shipment_attachment_galleries.sql',import.meta.url),'utf8');
  const before = (await db.query("select * from shipment_delivery_requests where id='legacy'")).rows[0];
  assert.equal(getShipmentAttachments(before,'transfer_slips')[0].url,before.transfer_slip_url,'Old schemas remain readable');
  await db.exec(migration);
  await db.exec(migration);
  let row = (await db.query("select * from shipment_delivery_requests where id='legacy'")).rows[0];
  assert.deepEqual(row.transfer_slips,[{path:'order/slip.png',url:before.transfer_slip_url,file_name:'slip.png'}]);
  assert.deepEqual(row.handoff_photos,[{path:'order/photo.png',url:before.handoff_photo_url,file_name:'Product.png'}]);
  const empty = (await db.query("select * from shipment_delivery_requests where id='empty'")).rows[0];
  assert.deepEqual(empty.transfer_slips,[]); assert.deepEqual(empty.handoff_photos,[]);
  const gallery = [...row.transfer_slips,{path:'order/slip2.pdf',url:'https://example.test/slip2.pdf',file_name:'Slip2.pdf'}];
  await db.query("update shipment_delivery_requests set transfer_slips=$1 where id='legacy'",[JSON.stringify(gallery)]);
  await db.exec(migration);
  row = (await db.query("select * from shipment_delivery_requests where id='legacy'")).rows[0];
  assert.deepEqual(getShipmentAttachments(row,'transfer_slips'),gallery,'Replay preserves multiple attachments');
  await db.exec("update shipment_delivery_requests set transfer_slips='[]',transfer_slip_path=null,transfer_slip_url=null where id='legacy'");
  await db.exec(migration);
  row = (await db.query("select * from shipment_delivery_requests where id='legacy'")).rows[0];
  assert.deepEqual(getShipmentAttachments(row,'transfer_slips'),[],'Replay cannot restore removed media');
  assert.deepEqual(getShipmentAttachments({...before,transfer_slips:[]},'transfer_slips'),[],'Explicitly empty gallery overrides the legacy pointer');
  await assert.rejects(db.exec("update shipment_delivery_requests set handoff_photos='{}'"),/check constraint/);
  console.log('PASS: legacy backfill, empty galleries, multi-file persistence, repeat migration, removed media and array constraints.');
} finally { await db.close(); }
