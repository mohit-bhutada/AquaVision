import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.RESEND_API_KEY = 're_test_key';
process.env.SMTP_FROM_EMAIL = 'noreply@example.com';
process.env.SMTP_FROM_NAME = 'AquaVision';

const { sendOtpEmail } = await import('../../src/lib/email.js');

test('sends OTP over HTTPS via Resend when RESEND_API_KEY is set', async () => {
  const realFetch = globalThis.fetch;
  let captured: { url: string; init: RequestInit } | undefined;
  globalThis.fetch = (async (url: any, init: any) => {
    captured = { url: String(url), init };
    return new Response('{"id":"1"}', { status: 200 });
  }) as typeof fetch;
  try {
    await sendOtpEmail({ to: 'a@b.com', otp: '123456', purpose: 'SIGNUP' });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(captured?.url, 'https://api.resend.com/emails');
  const body = JSON.parse(String(captured?.init.body));
  assert.deepEqual(body.to, ['a@b.com']);
  assert.ok(body.html.includes('123456'));
  assert.equal((captured?.init.headers as any).Authorization, 'Bearer re_test_key');
});

test('maps provider rejection to a generic client error', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('domain not verified', { status: 403 })) as typeof fetch;
  try {
    await assert.rejects(sendOtpEmail({ to: 'a@b.com', otp: '1', purpose: 'SIGNUP' }), (e: any) => e.code === 'EMAIL_SEND_FAILED');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('sends via Gmail API (token refresh, then RFC 822 message) when Gmail credentials are set', async () => {
  delete process.env.RESEND_API_KEY;
  process.env.GMAIL_CLIENT_ID = 'cid';
  process.env.GMAIL_CLIENT_SECRET = 'csecret';
  process.env.GMAIL_REFRESH_TOKEN = 'rtoken';
  const realFetch = globalThis.fetch;
  const calls: { url: string; init: any }[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }), { status: 200 });
    }
    return new Response('{"id":"m1"}', { status: 200 });
  }) as typeof fetch;
  try {
    await sendOtpEmail({ to: 'user@example.com', otp: '654321', purpose: 'PASSWORD_RESET' });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.length, 2);
  assert.ok(String(calls[0].init.body).includes('refresh_token=rtoken'));
  assert.equal(calls[1].url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer at');
  const raw = Buffer.from(JSON.parse(calls[1].init.body).raw, 'base64url').toString('utf8');
  assert.match(raw, /^From: "AquaVision" <noreply@example\.com>/m);
  assert.match(raw, /^To: user@example\.com/m);
  assert.match(raw, /^Content-Type: multipart\/alternative; boundary=/m);
  const decodePart = (type: string) => {
    const idx = raw.indexOf(`Content-Type: ${type}`);
    assert.ok(idx > -1, `missing ${type} part`);
    const body = raw.slice(idx).split('\r\n\r\n')[1].split('\r\n--')[0];
    return Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8');
  };
  assert.ok(decodePart('text/plain').includes('654321'));
  assert.ok(decodePart('text/html').includes('654321'));
});

test('header injection via recipient is neutralised', async () => {
  const realFetch = globalThis.fetch;
  let raw = '';
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'at2', expires_in: 1 }), { status: 200 });
    raw = Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8');
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  try {
    await sendOtpEmail({ to: 'a@b.com\r\nBcc: evil@x.com', otp: '1', purpose: 'SIGNUP' });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.ok(!/^Bcc:/m.test(raw));
});
