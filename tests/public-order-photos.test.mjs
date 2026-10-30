import assert from 'node:assert/strict';
import test from 'node:test';
import {publicOrderPhotoUrl,fetchPublicOrderPhotosWithClient} from '../lib/public-order-photos.ts';
import {rankTrackingMatch} from '../lib/public-order-tracking.ts';
const origin='https://project.supabase.co',primary=`${origin}/storage/v1/object/public/order-media/order-image/QA-TEST/first.jpg`;
const mockup=`${origin}/storage/v1/object/public/factory-production-mockups/deposit/production.png`;
test('exact factory bills find their shop order and its photos',()=>{
  const row={order_code:'PK26-TEST',factory_bill_code:'26-000001'};
  assert.equal(rankTrackingMatch(row,'26-000001'),100);assert.equal(rankTrackingMatch(row,'26-000002'),0);
});
test('only order photos and production mockups from the same project are public',()=>{
  assert.equal(publicOrderPhotoUrl(primary,origin),primary);assert.equal(publicOrderPhotoUrl(mockup,origin),mockup);
  for(const url of [primary.replace('https:','http:'),primary.replace('project.supabase.co','evil.example'),primary.replace('order-image','order-transfer-slip'),mockup.replace('factory-production-mockups','factory-deposit-slips'),primary.replace('.jpg','.svg'),primary+'?secret=private',`${origin}/storage/v1/object/public/order-media/order-image/%2e%2e/secret.jpg`])assert.equal(publicOrderPhotoUrl(url,origin),null);
});
test('gallery merges saved photos and the newest mockups without duplicate or financial attachments',async()=>{
  const client={
    from(table){assert.equal(table,'factory_deposit_orders');const q={select(fields){assert.equal(fields,'order_id,production_items');return q;},in(){return q;},order(){return q;},async limit(){return {data:[{order_id:'one',production_items:[{mockup_url:mockup,transfer_slip_url:'PRIVATE'},{mockup_url:primary}]},{order_id:'one',production_items:[{mockup_url:'OLD'}]}],error:null};}};return q;},
    storage:{from(bucket){assert.equal(bucket,'order-media');return {async list(folder){assert.equal(folder,'order-image/QA-TEST');return {data:[{name:'first.jpg'},{name:'second.webp'},{name:'slip.pdf'}],error:null};},getPublicUrl(path){return {data:{publicUrl:`${origin}/storage/v1/object/public/order-media/${path}`}};}};}},
  };
  const photos=await fetchPublicOrderPhotosWithClient(client,[{id:'one',order_code:'QA-TEST',order_image_url:primary}],origin);
  assert.deepEqual(photos.get('one'),[primary,primary.replace('first.jpg','second.webp'),mockup]);
  client.storage.from=()=>({async list(){throw new Error('unavailable');}});
  assert.deepEqual((await fetchPublicOrderPhotosWithClient(client,[{id:'one',order_code:'QA-TEST',order_image_url:primary}],origin)).get('one'),[primary,mockup]);
});
