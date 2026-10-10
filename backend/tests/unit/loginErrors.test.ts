import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

// Own process: the rate limiter in hardening.test.ts is deliberately exhausted there.
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://sb.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const { default: app } = await import('../../src/app.js');
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
test.after(() => server.close());
const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('a Supabase outage is reported as "unavailable" and does NOT count as a wrong password', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    if (String(input).startsWith('http://sb.test')) return new Response('upstream exploded', { status: 502 });
    return realFetch(input, init);
  }) as typeof fetch;
  try {
    for (let i = 0; i < 3; i++) {
      const res = await post('/auth/login', { email: 'outage-user@example.com', password: 'Whatever123' });
      const body = await res.json();
      assert.equal(res.status, 503);
      assert.equal(body.error.code, 'AUTH_UNAVAILABLE');
      assert.equal(body.error.details, undefined, 'no "attempts left" counter may move during an outage');
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a genuine wrong password still counts and reports attempts left', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    if (String(input).startsWith('http://sb.test')) {
      return new Response(JSON.stringify({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  try {
    const res = await post('/auth/login', { email: 'real-user@example.com', password: 'WrongPass123' });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(typeof body.error.details.attemptsLeft, 'number');
  } finally {
    globalThis.fetch = realFetch;
  }
});
