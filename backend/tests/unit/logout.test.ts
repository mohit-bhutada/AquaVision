import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://sb.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const { default: app } = await import('../../src/app.js');

const realFetch = globalThis.fetch;
const sbCalls: string[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if (!url.startsWith('http://sb.test')) return realFetch(input, init);
  sbCalls.push(`${init?.method || 'GET'} ${url.replace('http://sb.test', '')} auth=${new Headers(init?.headers).get('authorization') || ''}`);
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/auth/v1/logout')) {
    const auth = new Headers(init?.headers).get('authorization') || '';
    return auth === 'Bearer valid-access' || auth === 'Bearer fresh-access' ? new Response(null, { status: 204 }) : json({ msg: 'invalid JWT' }, 401);
  }
  if (url.includes('grant_type=refresh_token')) return json({ access_token: 'fresh-access', refresh_token: 'fresh-refresh' });
  return json({}, 404);
}) as typeof fetch;

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
test.after(() => { server.close(); globalThis.fetch = realFetch; });

test('logout clears both cookies and revokes the session (valid access token)', async () => {
  sbCalls.length = 0;
  const res = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Cookie: 'sb_access_token=valid-access; sb_refresh_token=r1' } });
  assert.equal(res.status, 204);
  const cookies = res.headers.getSetCookie().join(' | ');
  assert.match(cookies, /sb_access_token=;/);
  assert.match(cookies, /sb_refresh_token=;/);
  assert.match(cookies, /Expires=Thu, 01 Jan 1970/);
  assert.ok(sbCalls.some((c) => c.includes('/auth/v1/logout?scope=local') && c.endsWith('Bearer valid-access')), sbCalls.join('\n'));
});

test('logout with an EXPIRED access token still revokes the session via the refresh token', async () => {
  sbCalls.length = 0;
  const res = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Cookie: 'sb_access_token=expired; sb_refresh_token=r2' } });
  assert.equal(res.status, 204);
  assert.ok(sbCalls.some((c) => c.includes('grant_type=refresh_token')), 'should mint a token to revoke');
  assert.ok(sbCalls.some((c) => c.includes('/auth/v1/logout') && c.endsWith('Bearer fresh-access')), sbCalls.join('\n'));
});

test('logout without any cookies still succeeds in one call', async () => {
  const res = await fetch(`${base}/auth/logout`, { method: 'POST' });
  assert.equal(res.status, 204);
});
