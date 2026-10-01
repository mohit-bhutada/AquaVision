import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeSearchTerm } from '../../src/lib/searchTerm.js';

test('removes PostgREST filter-injection characters', () => {
  const out = escapeSearchTerm('x%,role.eq.admin,email.ilike.(a)');
  assert.ok(!/[,()]/.test(out), out);
});

test('escapes LIKE wildcards and caps length', () => {
  assert.equal(escapeSearchTerm('50%_off'), '50\\%\\_off');
  assert.equal(escapeSearchTerm('a'.repeat(500)).length, 100);
});

test('trims whitespace', () => {
  assert.equal(escapeSearchTerm('  bob  '), 'bob');
});
