import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PRODUCTION_COLLARS, getProductionCollarLabel, normalizeProductionCollarCode, selectableProductionCollars } from '../lib/production-collars.ts';

test('all fourteen legacy construction collars keep their stored codes and labels', () => {
  assert.equal(DEFAULT_PRODUCTION_COLLARS.length,14);
  assert.equal(new Set(DEFAULT_PRODUCTION_COLLARS.map(row=>row.code)).size,14);
  for(const row of DEFAULT_PRODUCTION_COLLARS) assert.equal(getProductionCollarLabel(row.code),row.label);
});

test('saved custom collars retain their code and historical label after catalog changes', () => {
  assert.equal(normalizeProductionCollarCode('split_neck'),'split_neck');
  assert.equal(getProductionCollarLabel('split_neck','ຄໍແບບໃໝ່'),'ຄໍແບບໃໝ່');
  assert.equal(getProductionCollarLabel('split_neck'),'split_neck');
  for(const value of [null,undefined,'bad code','<script>',42]) assert.equal(normalizeProductionCollarCode(value),'crew');
});

test('disabled choices stay on saved designs and are absent from new selections', () => {
  const options=[...DEFAULT_PRODUCTION_COLLARS,{code:'split_neck',label:'Renamed',is_active:false,sort_order:150}];
  assert.equal(selectableProductionCollars(options,'crew').some(row=>row.code==='split_neck'),false);
  const selected=selectableProductionCollars(options,'split_neck','Original').find(row=>row.code==='split_neck');
  assert.equal(selected.label,'Original');assert.equal(selected.is_active,false);
  assert.equal(options.at(-1).label,'Renamed','Rendering never mutates catalog rows');
});

test('a saved design remains readable if its option is unavailable', () => {
  const options=selectableProductionCollars(DEFAULT_PRODUCTION_COLLARS,'split_neck','Saved collar');
  assert.equal(options.at(-1).code,'split_neck');assert.equal(options.at(-1).label,'Saved collar');
});
