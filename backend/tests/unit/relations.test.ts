import test from 'node:test';
import assert from 'node:assert/strict';
import { firstRow } from '../../src/lib/relations.js';

test('one-to-one embed (object) is returned as-is: this is the shape that showed every user as Free', () => {
  const sub = { status: 'ACTIVE', plans: { code: 'PRO', name: 'Pro Plan' } };
  assert.equal(firstRow<any>(sub)?.plans.code, 'PRO');
  assert.equal(firstRow<any>(firstRow<any>(sub)?.plans)?.code, 'PRO');
});

test('one-to-many embed (array) still works', () => {
  assert.equal(firstRow<any>([{ status: 'ACTIVE' }, { status: 'X' }])?.status, 'ACTIVE');
});

test('missing relation gives undefined', () => {
  assert.equal(firstRow(null), undefined);
  assert.equal(firstRow(undefined), undefined);
  assert.equal(firstRow([]), undefined);
});
