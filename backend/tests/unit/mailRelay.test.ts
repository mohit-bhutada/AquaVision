import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.INTERNAL_API_KEY = 'k'.repeat(40);
process.env.VERCEL_API_URL = 'https://aquavision.example.com/';
process.env.SMTP_FROM_EMAIL = 'noreply@example.com';

const { sendOtpEmail } = await import('../../src/lib/email.js');
const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; process.env.VERCEL_API_URL = 'https://aquavision.example.com/'; process.env.INTERNAL_API_KEY = 'k'.repeat(40); });

type Seen = { url: string; init: any };
const mock = (res: () => Response): Seen[] => { const seen: Seen[] = []; globalThis.fetch = (async (u: any, init: any) => { seen.push({ url: String(u), init }); return res(); }) as typeof fetch; return seen; };
const send = () => sendOtpEmail({ to: 'user@example.com', otp: '123456', purpose: 'SIGNUP' });
const relayOk = () => new Response('{"success":true}', { status: 200, headers: { 'x-aquavision-relay': '1', 'content-type': 'application/json' } });

test('sends the OTP to the Vercel mail function with the shared secret, never following redirects', async () => {
  const seen = mock(relayOk);
  await send();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://aquavision.example.com/api/send-email');
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.redirect, 'manual');
  assert.equal(new Headers(seen[0].init.headers).get('authorization'), `Bearer ${'k'.repeat(40)}`);
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.to, 'user@example.com');
  assert.ok(body.subject && body.text.includes('123456') && body.html.includes('123456'));
});

test('failures become a generic EMAIL_SEND_FAILED and never expose the relay or its key', async () => {
  const cases: Array<[string, () => Response]> = [
    ['relay rejects the key', () => new Response('{"error":"Unauthorized"}', { status: 401, headers: { 'x-aquavision-relay': '1' } })],
    ['relay says SMTP failed', () => new Response('{"error":"Email send failed"}', { status: 502, headers: { 'x-aquavision-relay': '1' } })],
    ['request hit the Worker proxy instead of the function', () => new Response('{"error":{"code":"NOT_FOUND"}}', { status: 404 })],
    ['redirect (e.g. vercel.app -> custom domain)', () => new Response(null, { status: 308, headers: { location: 'https://elsewhere.example/api/send-email' } })],
  ];
  for (const [name, res] of cases) {
    mock(res);
    await assert.rejects(send(), (e: any) => e.code === 'EMAIL_SEND_FAILED' && !/k{10}|aquavision\.example|elsewhere/.test(e.message), name);
  }
});

test('refuses to send the secret over plain http (except localhost) or with a weak key', async () => {
  const seen = mock(relayOk);
  process.env.VERCEL_API_URL = 'http://aquavision.example.com';
  await assert.rejects(send(), (e: any) => e.code === 'EMAIL_SEND_FAILED');
  process.env.VERCEL_API_URL = 'https://aquavision.example.com';
  process.env.INTERNAL_API_KEY = 'short';
  await assert.rejects(send(), (e: any) => e.code === 'EMAIL_SEND_FAILED');
  assert.equal(seen.length, 0, 'nothing may be sent in these cases');
});
