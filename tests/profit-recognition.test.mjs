import assert from 'node:assert/strict';
import test from 'node:test';
import { profitDateKey,profitPeriodDates,isProfitInPeriod,profitTimestampRange,recognizedProfit,profitRecognitionError } from '../lib/profit-recognition.ts';

test('a shipped COD order without a receipt never falls back to its delivery or order date',()=>{
  const pending={net_total:1000000,factory_cost:600000,profit_recognized_at:null,shipment_completed_at:'2026-10-15',order_date:'2026-10-01'};
  assert.equal(recognizedProfit(pending),0);assert.equal(isProfitInPeriod(pending,2026,10),false);
});
test('COD received in November belongs only to November even when shipped in October',()=>{
  const received={net_total:1000000,factory_cost:600000,profit_recognized_at:'2026-11-03T03:00:00Z'};
  assert.equal(recognizedProfit(received,2026,10),0);assert.equal(recognizedProfit(received,2026,11),400000);
  assert.equal(recognizedProfit(received,2026,'ALL'),400000);
});
test('business month boundaries use Lao time, including year rollover',()=>{
  assert.equal(profitDateKey('2026-10-31T16:59:59.999Z'),'2026-10-31');
  assert.equal(profitDateKey('2026-10-31T17:00:00Z'),'2026-11-01');
  assert.equal(profitDateKey('2026-12-31T17:00:00Z'),'2027-01-01');
  assert.equal(isProfitInPeriod({profit_recognized_at:'2026-12-31T17:00:00Z'},2026,'ALL'),false);
  assert.deepEqual(profitPeriodDates(2026,12),{start:'2026-12-01',endExclusive:'2027-01-01'});
});
test('recognition keeps losses and supports end-exclusive dashboard queries',()=>{
  assert.equal(recognizedProfit({profit_recognized_at:'2026-11-01',net_total:50000,factory_cost:100000}),-50000);
  assert.deepEqual(profitTimestampRange('2026-10-01','2026-10-31'),{start:'2026-10-01T00:00:00+07:00',endExclusive:'2026-11-01T00:00:00+07:00'});
  assert.equal(profitDateKey('invalid'),'');
});
test('unmigrated reports show the required migration instead of recognizing unpaid COD',()=>{
  assert.match(profitRecognitionError({code:'42703',message:'column profit_recognized_at does not exist'}),/20261106_cod_profit_recognition.sql/);
});
