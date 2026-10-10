import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://sb.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const { default: app } = await import('../../src/app.js');
const { supabaseAdmin } = await import('../../src/lib/supabase.js');

const realFetch = globalThis.fetch;
const restAuthHeaders: string[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if (!url.startsWith('http://sb.test')) return realFetch(input, init);
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/auth/v1/token?grant_type=password')) {
    return json({
      access_token: 'USER-JWT', refresh_token: 'user-refresh', token_type: 'bearer', expires_in: 3600,
      user: { id: 'u1', email: 'user@x.com', aud: 'authenticated', email_confirmed_at: '2026-01-01T00:00:00Z' },
    });
  }
  if (url.includes('/rest/v1/')) {
    restAuthHeaders.push(new Headers(init?.headers).get('authorization') || '');
    return json({ id: 'u1', email: 'user@x.com', display_name: 'U', role: 'user', is_suspended: false, created_at: '2026-01-01T00:00:00Z' });
  }
  return json({}, 404);
}) as typeof fetch;

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
test.after(() => { server.close(); globalThis.fetch = realFetch; });

test('after a user logs in, database calls still run as the SERVICE ROLE (not as that user)', async () => {
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@x.com', password: 'Passw0rd!x' }),
  });
  assert.equal(login.status, 200);

  restAuthHeaders.length = 0;
  await supabaseAdmin.from('subscription_requests').update({ status: 'APPROVED' }).eq('id', 'r1');
  assert.ok(restAuthHeaders.length > 0, 'a database request should have been made');
  for (const h of restAuthHeaders) {
    assert.equal(h, 'Bearer service-key', `database call ran with the wrong identity: ${h}`);
  }
});
