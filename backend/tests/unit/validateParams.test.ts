import test from 'node:test';
import assert from 'node:assert/strict';
import { isUuid, isShareToken } from '../../src/middleware/validateParams.js';

test('isUuid accepts v4 UUIDs and rejects injection attempts', () => {
  assert.equal(isUuid('3f2b8c1e-9d4a-4e6b-8a1c-5d7e9f0a1b2c'), true);
  for (const bad of ['', 'abc', "1' OR '1'='1", '../../etc/passwd', '3f2b8c1e-9d4a-4e6b-8a1c-5d7e9f0a1b2c,role.eq.admin', 123 as any, null as any]) {
    assert.equal(isUuid(bad), false, String(bad));
  }
});

test('isShareToken requires exactly 48 hex chars', () => {
  assert.equal(isShareToken('a'.repeat(48)), true);
  assert.equal(isShareToken('a'.repeat(47)), false);
  assert.equal(isShareToken('g'.repeat(48)), false);
  assert.equal(isShareToken('../' + 'a'.repeat(45)), false);
});
