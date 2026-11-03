import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProfitChannelMap, getProfitChannel, PROFIT_CHANNELS } from '../lib/profit-channels.ts';
import { recognizedProfit } from '../lib/profit-recognition.ts';

const request = (id, order_id, delivery_method, extra = {}) => ({
  id, order_id, delivery_method, status: 'delivered',
  delivered_at: '2026-11-02T03:00:00Z', approved_at: null,
  created_at: '2026-11-01T03:00:00Z', ...extra,
});

test('COD takes precedence; regular transport and passenger deliveries share a channel', () => {
  const channels = buildProfitChannelMap([
    request('r1', 'cod', 'transport'),
    request('r2', 'courier', 'transport'),
    request('r3', 'bus', 'transport', { transport_providers: ['ລົດໂດຍສານ'] }),
    request('r4', 'store', 'pickup'),
  ], []);
  assert.equal(getProfitChannel({ id: 'cod', has_transport_cod: true }, channels), 'cod');
  assert.equal(getProfitChannel({ id: 'courier' }, channels), 'transport');
  assert.equal(getProfitChannel({ id: 'bus' }, channels), 'transport');
  assert.equal(getProfitChannel({ id: 'store' }, channels), 'pickup');
  assert.equal(getProfitChannel({ id: 'legacy' }, channels), 'unknown');
});

test('latest completed delivery wins regardless of input order; unfinished requests cannot replace it', () => {
  const requests = [
    request('r1', 'split', 'transport'),
    request('r2', 'split', 'pickup', { delivered_at: '2026-11-03T03:00:00Z' }),
    ...['draft', 'submitted', 'cancelled', 'rejected'].map((status, index) =>
      request(`ignored-${index}`, 'split', 'transport', { status, delivered_at: '2026-11-04T03:00:00Z' })),
  ];
  assert.equal(getProfitChannel({ id: 'split' }, buildProfitChannelMap(requests, [])), 'pickup');
  assert.equal(getProfitChannel({ id: 'split' }, buildProfitChannelMap(requests.reverse(), [])), 'pickup');
});

test('only deposited standalone notes establish transport; linked notes use approved requests', () => {
  const note = (id, order_id, extra = {}) => ({ id, order_id, delivery_request_id: null, transport_deposited_at: '2026-11-02T03:00:00Z', ...extra });
  const channels = buildProfitChannelMap([], [
    note('n1', 'standalone'), note('n2', 'unsent', { transport_deposited_at: null }),
    note('n3', 'linked', { delivery_request_id: 'draft-request' }), note('n4', null),
  ]);
  assert.equal(getProfitChannel({ id: 'standalone' }, channels), 'transport');
  assert.equal(getProfitChannel({ id: 'unsent' }, channels), 'unknown');
  assert.equal(getProfitChannel({ id: 'linked' }, channels), 'unknown');
});

test('channel totals reconcile to recognized profit without duplicating split orders or pending COD', () => {
  const channels = buildProfitChannelMap([
    request('r1', 'split', 'transport'), request('r2', 'split', 'transport'),
    request('r3', 'loss', 'pickup'),
  ], []);
  const order = (id, extra = {}) => ({ id, net_total: 1000, factory_cost: 600, profit_recognized_at: '2026-11-03T03:00:00Z', ...extra });
  const orders = [order('cod', { has_transport_cod: true }), order('pending', { has_transport_cod: true, profit_recognized_at: null }),
    order('split'), order('loss', { factory_cost: 1100 }), order('legacy'),
    order('old-cod', { has_transport_cod: true, profit_recognized_at: '2026-10-03T03:00:00Z' })];
  const totals = Object.fromEntries(PROFIT_CHANNELS.map(channel => [channel, 0]));
  for (const row of orders) totals[getProfitChannel(row, channels)] += recognizedProfit(row, 2026, 11);
  assert.deepEqual(totals, { cod: 400, transport: 400, pickup: -100, unknown: 400 });
  assert.equal(Object.values(totals).reduce((sum, profit) => sum + profit, 0), orders.reduce((sum, row) => sum + recognizedProfit(row, 2026, 11), 0));
});
