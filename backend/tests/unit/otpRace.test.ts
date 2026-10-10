import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://sb.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.OTP_PEPPER = 'p'.repeat(40);

const { hashVerificationToken, hashOtp, generateSalt } = await import('../../src/lib/otp.js');
const { verifyOtpCode } = await import('../../src/services/otpService.js');

// ---- A tiny in-memory PostgREST that applies filters atomically, like the real database does ----
const RAW_TOKEN = 'a'.repeat(48);
const CORRECT_OTP = '424242';
const salt = generateSalt();
const row: Record<string, any> = {
  id: 'tx1', user_id: 'u1', email: 'victim@example.com', purpose: 'SIGNUP',
  verification_token_hash: hashVerificationToken(RAW_TOKEN), otp_hash: hashOtp(CORRECT_OTP, salt), otp_salt: salt,
  otp_attempts: 0, max_otp_attempts: 5, status: 'PENDING', locked_until: null,
  last_sent_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600_000).toISOString(),
};
const matches = (q: URLSearchParams) => {
  for (const [k, v] of q) {
    if (['select', 'limit', 'order'].includes(k)) continue;
    const m = /^(eq|gt)\.(.*)$/.exec(v); if (!m) continue;
    const cell = String(row[k] ?? '');
    if (m[1] === 'eq' && cell !== m[2]) return false;
    if (m[1] === 'gt' && !(new Date(cell).getTime() > new Date(m[2]).getTime())) return false;
  }
  return true;
};
let successfulIncrements = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = new URL(String(input));
  if (url.host !== 'sb.test') return realFetch(input, init);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  const wantsObject = new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object');
  if (url.pathname.endsWith('/auth_otp_verifications')) {
    // Each request is evaluated synchronously against the shared row => compare-and-swap semantics.
    if ((init?.method || 'GET') === 'GET') {
      if (!matches(url.searchParams)) return wantsObject ? json({ message: 'no rows', code: 'PGRST116' }, 406) : json([]);
      return wantsObject ? json({ ...row }) : json([{ ...row }]);
    }
    if (init.method === 'PATCH') {
      await new Promise((r) => setTimeout(r, Math.random() * 3)); // network jitter so requests truly interleave
      if (!matches(url.searchParams)) return wantsObject ? json({ message: 'no rows', code: 'PGRST116' }, 406) : json([]);
      const patch = JSON.parse(init.body);
      if ('otp_attempts' in patch && patch.otp_attempts === row.otp_attempts + 1) successfulIncrements++;
      Object.assign(row, patch);
      return wantsObject ? json({ ...row }) : json([{ ...row }]);
    }
  }
  if (url.pathname.includes('/auth/v1/admin/users')) return json({ id: 'u1' });
  return json({}, 404);
}) as typeof fetch;
test.after(() => { globalThis.fetch = realFetch; });

test('a burst of 100 PARALLEL guesses can only evaluate max_otp_attempts (5) of them, then the session locks', async () => {
  const guesses = Array.from({ length: 100 }, (_, i) => String(100000 + i * 7)); // all wrong
  guesses[99] = CORRECT_OTP; // the real code is hidden in the burst
  const outcomes = await Promise.allSettled(guesses.map((g) => verifyOtpCode(RAW_TOKEN, g)));

  const codes = outcomes.map((o) => (o.status === 'rejected' ? (o.reason as any).code : 'OK'));
  const evaluatedWrong = codes.filter((c) => c === 'OTP_INVALID').length; // reached the comparison and were wrong
  const accepted = codes.filter((c) => c === 'OK').length;

  assert.ok(row.otp_attempts <= 5, `counter must never exceed the limit, was ${row.otp_attempts}`);
  assert.equal(row.status === 'LOCKED' || accepted === 1, true, 'session is locked (or the code genuinely won one of the 5 slots)');
  assert.ok(evaluatedWrong + accepted + codes.filter((c) => c === 'OTP_LOCKED').length >= 5);
  assert.ok(evaluatedWrong <= 4, `at most 4 wrong guesses may be evaluated before the 5th slot locks; got ${evaluatedWrong}`);
  assert.ok(successfulIncrements <= 5, `slots handed out: ${successfulIncrements}`);
  // the burst must not have let 100 guesses through
  assert.ok(accepted <= 1);
});

test('after the lock, even the correct code is refused', async () => {
  if (row.status !== 'LOCKED') { row.status = 'LOCKED'; row.locked_until = new Date(Date.now() + 3600_000).toISOString(); }
  await assert.rejects(verifyOtpCode(RAW_TOKEN, CORRECT_OTP), (e: any) => e.code === 'OTP_LOCKED' || e.code === 'OTP_INVALID');
});
