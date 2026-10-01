import app from '../../src/app.js';
import { supabaseAdmin } from '../../src/lib/supabase.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`✓ PASS: ${description}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${description}`);
    failed++;
  }
}

async function runUnverifiedLoginTests() {
  console.log('=== STARTING UNVERIFIED LOGIN & OTP ROUTING SECURITY TESTS ===\n');

  const http = await import('http');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  const unverifiedEmail = `unverified_${Date.now()}@example.com`;
  const password = 'TestPassword123!';

  // Cleanup helper
  const cleanUser = async (email: string) => {
    const { data: prof } = await supabaseAdmin.from('profiles').select('id').eq('email', email).single();
    if (prof?.id) {
      await supabaseAdmin.auth.admin.deleteUser(prof.id);
    }
    await supabaseAdmin.from('auth_otp_verifications').delete().eq('email', email);
  };

  try {
    await cleanUser(unverifiedEmail);

    // 1. Create an unverified user in Supabase Auth
    const { data: userRes, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: unverifiedEmail,
      password,
      email_confirm: false,
      user_metadata: { full_name: 'Unverified Tester' },
    });

    assert(!createErr && !!userRes.user?.id && !userRes.user.email_confirmed_at, '1. Unverified user created in Supabase Auth');

    // 2. Unverified user attempts login with correct credentials
    const resLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: unverifiedEmail, password }),
      redirect: 'manual',
    });

    const loginData = await resLogin.json();
    const loginCookies = resLogin.headers.get('set-cookie') || '';

    assert(resLogin.status === 403, '2. Unverified login returns HTTP 403 EMAIL_NOT_VERIFIED');
    assert(
      loginData.requiresVerification === true && !!loginData.verificationToken,
      '3. Response contains requiresVerification: true and verificationToken'
    );
    assert(
      !loginCookies.includes('sb_access_token') && !loginCookies.includes('sb_refresh_token'),
      '4. Unverified login does NOT receive HTTP-only session cookies'
    );

    const verificationToken = loginData.verificationToken;

    // 3. Invalid OTP attempt on /auth/verify-otp
    const resBadOtp = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verificationToken, otp: '000000' }),
    });
    assert(resBadOtp.status === 400, '5. Invalid OTP attempt is rejected with HTTP 400');

    // 4. Retrieve generated OTP hash directly from database to test valid verification
    const { data: txRecord } = await supabaseAdmin
      .from('auth_otp_verifications')
      .select('*')
      .eq('email', unverifiedEmail)
      .eq('status', 'PENDING')
      .single();

    assert(!!txRecord, '6. Active signup verification transaction exists in auth_otp_verifications');

    // Test verifyToken info route
    const resInfo = await fetch(`${baseUrl}/auth/verify-token/${verificationToken}`);
    const infoData = await resInfo.json();
    assert(infoData.valid === true && infoData.purpose === 'SIGNUP', '7. /verify-token/:token validates active session');

    // 5. Simulate valid OTP verification by setting user email_confirm and completing verify-otp
    // First confirm via Supabase Admin magiclink exchange inside verifyOtp
    // Let's call verify-otp using a valid OTP: we will fetch the salt/hash from db and verify with a test OTP
    const testOtp = '123456';
    const { hashOtp } = await import('../../src/lib/otp.js');
    const newHash = hashOtp(testOtp, txRecord.otp_salt);

    await supabaseAdmin
      .from('auth_otp_verifications')
      .update({ otp_hash: newHash })
      .eq('id', txRecord.id);

    const resVerify = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verificationToken, otp: testOtp }),
    });

    const verifyData = await resVerify.json();
    const verifyCookies = resVerify.headers.get('set-cookie') || '';

    assert(resVerify.status === 200 && verifyData.status === 'ok', '8. Valid OTP verification returns HTTP 200 OK');
    assert(
      verifyCookies.includes('sb_access_token') && verifyCookies.includes('HttpOnly'),
      '9. Successful OTP verification sets HTTP-only sb_access_token session cookie'
    );

    // 6. Verify account is now confirmed in Supabase Auth
    const { data: { user: verifiedUser } } = await supabaseAdmin.auth.admin.getUserById(userRes.user!.id);
    assert(!!verifiedUser?.email_confirmed_at, '10. User email is confirmed in Supabase Auth after verification');

    // 7. Verified user logins normally
    const resVerifiedLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: unverifiedEmail, password }),
    });

    const verifiedLoginData = await resVerifiedLogin.json();
    const verifiedLoginCookies = resVerifiedLogin.headers.get('set-cookie') || '';

    assert(resVerifiedLogin.status === 200, '11. Verified user login returns HTTP 200 OK');
    assert(!!verifiedLoginData.id && verifiedLoginData.email === unverifiedEmail, '12. Verified login returns user profile JSON');
    assert(
      verifiedLoginCookies.includes('sb_access_token') && verifiedLoginCookies.includes('HttpOnly'),
      '13. Verified user login receives HTTP-only session cookies'
    );

    // Clean up
    await cleanUser(unverifiedEmail);
  } finally {
    server.close();
  }

  console.log('\n=== TEST SUMMARY ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runUnverifiedLoginTests().catch((err) => {
  console.error('Fatal unverified login test error:', err);
  process.exit(1);
});
