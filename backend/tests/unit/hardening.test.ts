import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://sb.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.CORS_ORIGIN = 'https://a.example.com, https://b.example.com/';

const { default: app } = await import('../../src/app.js');
const { requireEmail, requireNewPassword, requireLoginPassword, requireToken, requireOtp, cleanDisplayName } = await import('../../src/lib/validators.js');
const { getClientIp } = await import('../../src/lib/clientIp.js');

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
test.after(() => server.close());
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('validators turn wrong types and bad values into clean 400s (they used to be 500s)', () => {
  for (const bad of [123, null, {}, [], 'no-at-sign', 'a@b', 'a b@c.com', 'a@b.com,c@d.com', '<x>@y.com', 'x'.repeat(260) + '@y.com']) {
    assert.throws(() => requireEmail(bad), (e: any) => e.statusCode === 400, String(bad).slice(0, 30));
  }
  assert.equal(requireEmail('  User@Example.COM '), 'user@example.com');
  assert.throws(() => requireNewPassword('short1'), (e: any) => e.statusCode === 400);
  assert.throws(() => requireNewPassword('onlyletters'), (e: any) => e.statusCode === 400);
  assert.throws(() => requireNewPassword('a1' + 'x'.repeat(80)), (e: any) => /at most 72/.test(e.message));
  assert.throws(() => requireNewPassword(12345678), (e: any) => e.statusCode === 400);
  assert.equal(requireNewPassword('GoodPass123'), 'GoodPass123');
  assert.throws(() => requireLoginPassword(['x']), (e: any) => e.statusCode === 400);
  assert.throws(() => requireToken('../../etc'), (e: any) => e.statusCode === 400);
  assert.equal(requireToken('a'.repeat(48)), 'a'.repeat(48));
  assert.throws(() => requireOtp('12345'), (e: any) => e.statusCode === 400);
  assert.throws(() => requireOtp('12345a'), (e: any) => e.statusCode === 400);
  assert.equal(requireOtp(' 123456 '), '123456');
  assert.equal(cleanDisplayName('  Mohit\u0000\n  B  '), 'Mohit B');
  assert.equal(cleanDisplayName(42), undefined);
  assert.equal(cleanDisplayName('x'.repeat(500))!.length, 100);
});

test('auth routes answer wrong-typed input with 400, not a crash', async () => {
  for (const [path, body] of [['/auth/login', { email: 123, password: 'x' }], ['/auth/signup', { email: { a: 1 }, password: 'GoodPass123' }], ['/auth/forgot-password', { email: ['a@b.com'] }], ['/auth/verify-otp', { verificationToken: 5, otp: 6 }]] as const) {
    const res = await post(path, body);
    assert.equal(res.status, 400, path);
    assert.equal((await res.json()).error.code, 'VALIDATION_ERROR', path);
  }
});

test('malformed JSON is a 400 with a readable message, not a 500', async () => {
  const res = await post('/auth/login', '{"email": "a@b.com", ');
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'BAD_REQUEST');
  assert.match(body.error.message, /not valid JSON/);
});

test('/auth/session no longer stores arbitrary strings as login cookies', async () => {
  let res = await post('/auth/session', { accessToken: 'attacker-chosen-value', refreshToken: 'x' });
  assert.equal(res.status, 401);
  assert.ok(!res.headers.getSetCookie().join('').includes('sb_access_token='), 'no cookie may be set');
  res = await post('/auth/session', {});
  assert.equal(res.status, 401);
});

test('request IDs: a sane caller ID is kept, hostile ones are replaced', async () => {
  let res = await fetch(`${base}/projects/not-a-uuid`, { headers: { 'X-Request-ID': 'trace-1234-abcd' } });
  assert.equal(res.headers.get('x-request-id'), 'trace-1234-abcd');
  res = await fetch(`${base}/projects/not-a-uuid`, { headers: { 'X-Request-ID': 'x'.repeat(500) } });
  assert.notEqual(res.headers.get('x-request-id'), 'x'.repeat(500));
  assert.match(res.headers.get('x-request-id')!, /^[0-9a-f-]{36}$/);
  res = await fetch(`${base}/projects/not-a-uuid`, { headers: { 'X-Request-ID': 'bad id with spaces & <script>' } });
  assert.match(res.headers.get('x-request-id')!, /^[0-9a-f-]{36}$/);
});

test('API responses are never cached and carry a locked-down CSP', async () => {
  const res = await fetch(`${base}/projects/not-a-uuid`);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-security-policy')!, /default-src 'none'/);
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('CORS accepts every listed origin (and only those)', async () => {
  const pre = (origin: string) => fetch(`${base}/auth/login`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
  let res = await pre('https://a.example.com');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://a.example.com');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(res.headers.get('access-control-max-age'), '600');
  res = await pre('https://b.example.com');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://b.example.com');
  res = await pre('https://evil.example.com');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('foreign Origin on a state-changing request is rejected; a listed one is not', async () => {
  assert.equal((await post('/auth/logout', {}, { Origin: 'https://evil.example.com' })).status, 403);
  assert.equal((await post('/auth/logout', {}, { Origin: 'https://b.example.com' })).status, 204);
});

test('RATE LIMIT cannot be dodged by sending a different fake X-Forwarded-For with every request', async () => {
  const statuses: number[] = [];
  let limitedBody: any;
  for (let i = 0; i < 40; i++) {
    const res = await post('/auth/login', { email: 'nobody@example.com' }, { 'X-Forwarded-For': `10.0.${i}.${i}` });
    statuses.push(res.status);
    if (res.status === 429 && !limitedBody) {
      limitedBody = await res.json();
      assert.ok(res.headers.get('retry-after'));
    }
  }
  assert.ok(statuses.includes(429), `expected throttling, got only: ${[...new Set(statuses)]}`);
  assert.equal(limitedBody.error.code, 'RATE_LIMITED');
  assert.equal(typeof limitedBody.error.message, 'string'); // same envelope as every other error
});

test('client IP: Vercel-proxied visitors are told apart; direct callers use Cloudflare\'s address', () => {
  const sock = { remoteAddress: '203.0.113.9' } as any;
  assert.equal(getClientIp({ headers: { 'x-vercel-id': 'iad1::x', 'x-vercel-forwarded-for': '198.51.100.7' }, socket: sock } as any), '198.51.100.7');
  assert.equal(getClientIp({ headers: { 'cf-connecting-ip': '198.51.100.8', 'x-forwarded-for': '1.2.3.4' }, socket: sock } as any), '198.51.100.8');
  assert.equal(getClientIp({ headers: {}, socket: sock } as any), '203.0.113.9');
  assert.equal(getClientIp({ headers: { 'cf-connecting-ip': 'not an ip!!' }, socket: sock } as any), '203.0.113.9');
});
