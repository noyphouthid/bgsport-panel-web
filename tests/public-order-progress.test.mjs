import assert from 'node:assert/strict';
import test from 'node:test';
import {mapOrderToPublicTracking} from '../lib/public-order-tracking.ts';

const base={id:'test',order_code:'QA-TEST',order_date:'2026-10-31',status:'in_progress',shipment_status:'pending',factory_bill_code:'26-000001',factory_production_status:'Completed',factory_production_status_index:7,factory_production_shipping_status:'shipped',factory_production_payload:{statuses:['Pattern','QC']}};
test('factory QC completion and factory dispatch do not confirm receipt at the shop',()=>{
  const row=mapOrderToPublicTracking(base);
  assert.equal(row.shopReceived,false);assert.equal(row.shopShipped,false);
});
test('shop receipt and production completion supply the shop milestone',()=>{
  for(const change of [{shop_received_at:'2026-10-31T03:00:00Z'},{production_completed_at:'2026-10-31T03:00:00Z'}]){
    const row=mapOrderToPublicTracking({...base,...change});assert.equal(row.shopReceived,true);assert.equal(row.shopShipped,false);
  }
});
test('customer delivery and closed orders retain receipt and delivery milestones',()=>{
  for(const change of [{shipment_status:'shipped'},{shipment_completed_at:'2026-10-31T04:00:00Z'},{status:'completed'},{closed_at:'2026-10-31T04:00:00Z'}]){
    const row=mapOrderToPublicTracking({...base,...change});assert.equal(row.shopReceived,true);assert.equal(row.shopShipped,true);
  }
});
