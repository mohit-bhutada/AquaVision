import app from '../../src/app.js';
import { safeNextPath } from '../../src/routes/auth.js';

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

async function runGoogleOAuthTests() {
  console.log('=== STARTING PKCE GOOGLE OAUTH SECURITY TESTS ===\n');

  // Test 1-5: Safe Next Path Sanitization
  assert(safeNextPath('/workspace') === '/workspace', '1. safeNextPath accepts valid relative path /workspace');
  assert(safeNextPath('/projects') === '/projects', '2. safeNextPath accepts valid relative path /projects');
  assert(safeNextPath('https://evil.example.com') === '/workspace', '3. safeNextPath rejects external URL https://evil.example.com');
  assert(safeNextPath('//evil.example.com') === '/workspace', '4. safeNextPath rejects protocol-relative URL //evil.example.com');
  assert(safeNextPath('javascript:alert(1)') === '/workspace', '5. safeNextPath rejects javascript: pseudo-protocol');

  const http = await import('http');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  try {
    // Test 6: GET /api/v1/auth/google sets HTTP-only PKCE verifier cookie and returns PKCE challenge in URL
    const resGoogle = await fetch(`${baseUrl}/auth/google?next=/workspace`, { redirect: 'manual' });
    const location = resGoogle.headers.get('location') || '';
    const cookieHeader = resGoogle.headers.get('set-cookie') || '';

    assert(
      resGoogle.status === 302 && location.includes('code_challenge=') && location.includes('code_challenge_method=S256'),
      '6. GET /api/v1/auth/google returns HTTP 302 with PKCE S256 code_challenge parameters'
    );
    assert(
      cookieHeader.includes('sb_code_verifier=') && cookieHeader.includes('HttpOnly'),
      '7. GET /api/v1/auth/google sets HTTP-only sb_code_verifier cookie'
    );

    // Test 7: Production worker host enforces HTTPS protocol for Supabase redirectTo parameter
    const resProdGoogle = await fetch(`${baseUrl}/auth/google?next=/workspace`, {
      headers: {
        'x-forwarded-host': 'aquavision-backend-worker.aquavisionai01.workers.dev',
        'x-forwarded-proto': 'https',
      },
      redirect: 'manual',
    });
    const prodLocation = decodeURIComponent(resProdGoogle.headers.get('location') || '');

    assert(
      prodLocation.includes('redirect_to=https://aquavision-backend-worker.aquavisionai01.workers.dev/api/v1/auth/callback'),
      '8. Production Worker request constructs HTTPS backend callback URL (prevents Supabase fallback to Site URL /?code=...)'
    );

    // Test 8: Callback handles OAuth denial by redirecting to /login?error= without tokens in URL
    const resErr = await fetch(`${baseUrl}/auth/callback?error=access_denied&next=/workspace`, { redirect: 'manual' });
    const errLocation = resErr.headers.get('location') || '';

    assert(
      resErr.status === 302 &&
      errLocation.includes('/login?error=') &&
      !errLocation.includes('/auth/callback') &&
      !errLocation.includes('access_token') &&
      !errLocation.includes('refresh_token'),
      '9. OAuth denial callback redirects directly to /login?error= with ZERO tokens and no /auth/callback intermediate'
    );

    // Test 9: Callback without PKCE verifier cookie fails cleanly to /login?error=
    const resNoVerifier = await fetch(`${baseUrl}/auth/callback?code=mock_code&next=/workspace`, { redirect: 'manual' });
    const noVerifierLoc = resNoVerifier.headers.get('location') || '';

    assert(
      resNoVerifier.status === 302 &&
      noVerifierLoc.includes('/login?error=Missing%20PKCE%20code%20verifier'),
      '10. Callback without PKCE code verifier cookie redirects directly to /login?error='
    );

    // Test 10: Callback with invalid PKCE code/verifier rejects cleanly to /login?error=
    const resInvalidPKCE = await fetch(`${baseUrl}/auth/callback?code=invalid_code&next=/workspace`, {
      headers: { cookie: 'sb_code_verifier=invalid_verifier_test' },
      redirect: 'manual',
    });
    const invalidLoc = resInvalidPKCE.headers.get('location') || '';

    assert(
      resInvalidPKCE.status === 302 &&
      invalidLoc.includes('/login?error=Authentication%20failed') &&
      !invalidLoc.includes('access_token'),
      '11. Invalid PKCE code exchange rejects cleanly to /login?error= without leaking access_token or refresh_token'
    );
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

runGoogleOAuthTests().catch((err) => {
  console.error('Fatal Google OAuth test error:', err);
  process.exit(1);
});
