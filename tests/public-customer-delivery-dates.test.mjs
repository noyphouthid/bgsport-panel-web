import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as deliveryApi from '../lib/public-customer-delivery-dates.ts';
const {customerDeliveryDate,fetchCustomerDeliveryDatesWithClient}=deliveryApi;

const id='00000000-0000-4000-8000-000000000001',otherId='00000000-0000-4000-8000-000000000002';
const bill='26-000001';
let calls=0,rows=[],error=null;
const client={from(table){
  calls++;assert.equal(table,'factory_deposit_orders');
  const query={
    select(fields){assert.equal(fields,'order_id,factory_bill_code,delivery_date');return query;},
    in(column,statuses){assert.equal(column,'status');assert.deepEqual(statuses,['submitted','approved','converted']);return query;},
    or(filters){assert.match(filters,/order_id\.in\.|factory_bill_code\.in\./);return query;},
    order(column,options){assert.equal(column,'updated_at');assert.deepEqual(options,{ascending:false});return query;},
    async limit(n){assert.equal(n,100);return {data:rows,error};},
  };return query;
}};

test('only customer delivery_date is projected, never payment or factory deadlines',async()=>{
  rows=[{order_id:id,factory_bill_code:bill,delivery_date:'2026-11-05',payment_due_date:'2026-11-01',urgent_due_date:'2026-11-02',factory_production_due_date:'2026-11-03',customer_phone:'PRIVATE',net_total:999}];
  assert.deepEqual(await fetchCustomerDeliveryDatesWithClient(client,[id],[]),[{orderId:id,factoryBillCode:bill,deliveryDate:'2026-11-05'}]);
  rows=[{order_id:null,factory_bill_code:bill,delivery_date:'2026-11-06'}];
  assert.equal((await fetchCustomerDeliveryDatesWithClient(client,[],[bill]))[0].deliveryDate,'2026-11-06');
});
test('missing or cleared delivery dates remain null and unrelated records are excluded',async()=>{
  rows=[{order_id:id,delivery_date:null},{order_id:otherId,factory_bill_code:'26-000002',delivery_date:'2026-12-01'}];
  assert.deepEqual(await fetchCustomerDeliveryDatesWithClient(client,[id],[]),[{orderId:id,factoryBillCode:null,deliveryDate:null}]);
  for(const value of [null,'','2026-02-30','2026-13-01','tomorrow'])assert.equal(customerDeliveryDate(value),null);
  assert.equal(customerDeliveryDate('2028-02-29'),'2028-02-29');
});
test('empty, excessive and injected lookups cannot read the database',async()=>{
  calls=0;assert.deepEqual(await fetchCustomerDeliveryDatesWithClient(client,[],[]),[]);
  for(const [ids,bills]of [[['bad-id'],[]],[[],['26-000001),status.eq.draft']],[Array(21).fill(id),[]]]){
    await assert.rejects(fetchCustomerDeliveryDatesWithClient(client,ids,bills),/invalid_delivery_lookup/);
  }
  assert.equal(calls,0);
});
test('lookup failure does not expose database details',async()=>{
  error={message:'PRIVATE'};
  await assert.rejects(fetchCustomerDeliveryDatesWithClient(client,[id],[]),{message:'delivery_dates_unavailable'});
  error=null;
});
test('public endpoint validates selectors and always disables caching',async()=>{
  let configuredClient=client;
  const {outputText}=ts.transpileModule(readFileSync(new URL('../app/api/public/order-tracking/delivery-dates/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}});
  const compiled={exports:{}};
  const dependencies={
    'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
    '@/lib/supabase-admin':{getSupabaseAdmin:()=>configuredClient},
    '@/lib/public-customer-delivery-dates':deliveryApi,
  };
  new Function('require','module','exports',outputText)(name=>dependencies[name],compiled,compiled.exports);
  const get=params=>compiled.exports.GET({nextUrl:new URL(`https://erp.example/api/public/order-tracking/delivery-dates${params}`)});
  for(const params of ['','?orders=','?bills=bad','?orders=bad-id',`?orders=${Array(21).fill(id).join(',')}`]){
    const response=await get(params);assert.equal(response.status,400);assert.match(response.headers.get('cache-control'),/no-store/);
  }
  rows=[{order_id:id,factory_bill_code:bill,delivery_date:'2026-11-05',notes:'PRIVATE'}];
  let response=await get(`?orders=${id}`);
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);
  assert.deepEqual(await response.json(),{ok:true,deliveryDates:[{orderId:id,factoryBillCode:bill,deliveryDate:'2026-11-05'}]});
  configuredClient=null;response=await get(`?bills=${bill}`);assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'delivery_dates_unavailable'});
});
