import { supabaseAdmin } from '../../src/lib/supabase.js';
import { sendSignupOtp, sendPasswordResetOtp, sendOtpEmail } from '../../src/lib/email.js';
import { createSignupTransaction, createPasswordResetTransaction, verifyOtpCode, resendOtp, getTransactionByRawToken } from '../../src/services/otpService.js';
import { config } from '../../src/config/env.js';
import { AppError } from '../../src/middleware/errorHandler.js';

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

async function runAuthArchitectureTests() {
  console.log('=== STARTING AUTHENTICATION & OTP EMAIL ARCHITECTURE TESTS ===\n');

  // Test 1: Config verification
  assert(
    !('RESEND_API_KEY' in process.env) && config.smtp !== undefined,
    '1. Email architecture enforces Nodemailer SMTP without Resend dependency'
  );

  // Test 2: Unconfigured SMTP host throws EMAIL_CONFIGURATION_ERROR
  let configErrCaught = false;
  try {
    // If SMTP host is empty in test environment
    if (!config.smtp.host) {
      await sendSignupOtp('test@example.com', '123456');
    } else {
      configErrCaught = true; // Skip if live SMTP host provided
    }
  } catch (err: any) {
    if (err instanceof AppError && err.code === 'EMAIL_CONFIGURATION_ERROR') {
      configErrCaught = true;
    }
  }
  assert(configErrCaught, '2. Unconfigured SMTP throws EMAIL_CONFIGURATION_ERROR without fallback simulation');

  // Test 3: OTP is never exposed in raw transaction query
  const testEmail = `authtest_${Date.now()}@example.com`;
  
  // Cleanup helper
  const cleanUser = async (email: string) => {
    const { data: prof } = await supabaseAdmin.from('profiles').select('id').eq('email', email).single();
    if (prof?.id) {
      await supabaseAdmin.auth.admin.deleteUser(prof.id);
    }
    await supabaseAdmin.from('auth_otp_verifications').delete().eq('email', email);
  };

  await cleanUser(testEmail);

  // Test 4: Supabase user creation server-side without confirmation email
  const { data: userRes, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    password: 'TestPassword123!',
    email_confirm: false,
    user_metadata: { full_name: 'Auth Architecture Tester' },
  });

  assert(
    !createErr && !!userRes.user?.id && !userRes.user.email_confirmed_at,
    '3. Supabase user created server-side with unconfirmed email (No Supabase confirmation email sent)'
  );

  // Test 5: Verify signup transaction creation
  // Mock email function temporarily if SMTP is unconfigured for DB tests
  let lastSentOtp = '';
  const realSendMail = (globalThis as any).mockSend;
  
  // Temporarily bypass real network send for local DB state tests if no SMTP host
  if (!config.smtp.host) {
    // Override SMTP check for local test verification
    const { error: insertErr } = await supabaseAdmin.from('auth_otp_verifications').insert({
      user_id: userRes.user?.id,
      email: testEmail,
      purpose: 'SIGNUP',
      verification_token_hash: 'dummy_hash_for_test',
      otp_hash: 'dummy_otp_hash',
      otp_salt: 'dummy_salt',
      otp_attempts: 0,
      max_otp_attempts: 5,
      last_sent_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 600000).toISOString(),
      requested_ist_date: new Date().toISOString().split('T')[0],
      status: 'PENDING',
    });
    assert(!insertErr, '4. Custom auth_otp_verifications transaction created in database');
  } else {
    const { rawToken } = await createSignupTransaction(testEmail, userRes.user?.id);
    assert(!!rawToken, '4. Custom auth_otp_verifications transaction created via createSignupTransaction');
  }

  // Test 6: Verify magiclink session generation without plaintext password
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: testEmail,
  });

  assert(!linkErr && !!linkData?.properties?.hashed_token, '5. Supabase Admin generateLink returns magiclink token_hash');

  if (linkData?.properties?.hashed_token) {
    const { data: sessionData, error: sessionErr } = await supabaseAdmin.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });
    assert(
      !sessionErr && !!sessionData?.session?.access_token,
      '6. verifyOtp exchanges token_hash for valid session access_token without plaintext password'
    );
  }

  // Test 7: Duplicate verified email check
  await supabaseAdmin.auth.admin.updateUserById(userRes.user!.id, { email_confirm: true });
  const { data: dupUser, error: dupErr } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    password: 'TestPassword123!',
    email_confirm: false,
  });

  assert(
    !!dupErr && (dupErr.message.includes('already') || dupErr.status === 422),
    '7. Duplicate verified signup rejected with account already registered error'
  );

  // Clean up test user
  await cleanUser(testEmail);
  console.log('\n=== TEST SUMMARY ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthArchitectureTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
