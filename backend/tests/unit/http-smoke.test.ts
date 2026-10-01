import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://127.0.0.1:9'; // unreachable on purpose: these tests must never need the DB
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { default: app } = await import('../../src/app.js');
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
test.after(() => server.close());

test('enhancement requires authentication (no credit reserved, no ML call)', async () => {
  const fd = new FormData();
  fd.append('image', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])], { type: 'image/png' }), 'a.png');
  const res = await fetch(`${base}/projects/enhance`, { method: 'POST', body: fd });
  assert.equal(res.status, 401);
});

test('admin API rejects unauthenticated access', async () => {
  for (const path of ['/admin/users', '/admin/credits', '/admin/projects']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 401, path);
  }
});

test('malformed project id is rejected before any DB access', async () => {
  const res = await fetch(`${base}/projects/not-a-uuid`);
  assert.equal(res.status, 400);
});

test('malformed share token returns 404 without DB access', async () => {
  const res = await fetch(`${base}/share/${encodeURIComponent("x' or 1=1 --")}`);
  assert.equal(res.status, 404);
});

test('security headers are present', async () => {
  const res = await fetch(`${base}/plans`).catch(() => null);
  // /plans hits the DB fallback path; only the headers matter here
  const r = res ?? (await fetch(`${base}/projects/not-a-uuid`));
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

test('state-changing request from a foreign Origin is rejected (CSRF)', async () => {
  const res = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
});

test('state-changing request from the configured Origin is not blocked by the origin check', async () => {
  const res = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Origin: 'http://localhost:3000' } });
  assert.equal(res.status, 204);
});
