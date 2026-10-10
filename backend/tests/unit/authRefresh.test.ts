import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://sb.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const { requireAuth } = await import('../../src/middleware/auth.js');

const realFetch = globalThis.fetch;
let refreshCalls = 0;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if (!url.startsWith('http://sb.test')) return realFetch(input, init);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (url.includes('/auth/v1/user')) {
    const auth = new Headers(init?.headers).get('authorization') || '';
    if (auth === 'Bearer new-access') return json({ id: 'u1', email: 'u@x.com', aud: 'authenticated' });
    return json({ msg: 'JWT expired', code: 401 }, 401);
  }
  if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
    refreshCalls++;
    const body = JSON.parse(init.body);
    if (String(body.refresh_token).startsWith('good-refresh')) return json({ access_token: 'new-access', refresh_token: 'new-refresh' });
    return json({ error: 'invalid_grant' }, 400);
  }
  if (url.includes('/rest/v1/profiles')) return json({ role: 'user', is_suspended: false });
  return json({}, 404);
}) as typeof fetch;

const app = express();
app.use(cookieParser());
app.get('/t', requireAuth as any, (req: any, res) => res.json(req.user));
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || 500).json({ code: err.code }));
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
test.after(() => { server.close(); globalThis.fetch = realFetch; });

test('expired access token + valid refresh cookie => request succeeds and cookies are re-issued', async () => {
  const res = await fetch(`${base}/t`, { headers: { Cookie: 'sb_access_token=old; sb_refresh_token=good-refresh' } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, 'u1');
  const setCookie = res.headers.getSetCookie().join(' | ');
  assert.match(setCookie, /sb_access_token=new-access/);
  assert.match(setCookie, /sb_refresh_token=new-refresh/);
  assert.match(setCookie, /HttpOnly/i);
});

test('parallel requests share one refresh (refresh tokens rotate)', async () => {
  refreshCalls = 0;
  const hdr = { Cookie: 'sb_access_token=old; sb_refresh_token=good-refresh-parallel' };
  const results = await Promise.all([1, 2, 3].map(() => fetch(`${base}/t`, { headers: hdr })));
  assert.deepEqual(results.map((r) => r.status), [200, 200, 200]);
  assert.equal(refreshCalls, 1);
});

test('expired access token + bad refresh token => 401', async () => {
  const res = await fetch(`${base}/t`, { headers: { Cookie: 'sb_access_token=old; sb_refresh_token=revoked' } });
  assert.equal(res.status, 401);
});

test('no cookies => 401 and no refresh attempted', async () => {
  refreshCalls = 0;
  const res = await fetch(`${base}/t`);
  assert.equal(res.status, 401);
  assert.equal(refreshCalls, 0);
});
