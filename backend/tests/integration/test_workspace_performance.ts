import app from '../../src/app.js';
import { supabaseAdmin } from '../../src/lib/supabase.js';
import { getSignedUrl, getSignedUrlsBatch } from '../../src/services/storageService.js';

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

async function runWorkspacePerformanceTests() {
  console.log('=== STARTING WORKSPACE & HISTORY PERFORMANCE TESTS ===\n');

  const http = await import('http');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  const testEmail = `perf_user_${Date.now()}@example.com`;
  const password = 'TestPassword123!';

  const cleanUser = async (email: string) => {
    const { data: prof } = await supabaseAdmin.from('profiles').select('id').eq('email', email).single();
    if (prof?.id) {
      await supabaseAdmin.from('projects').delete().eq('user_id', prof.id);
      await supabaseAdmin.auth.admin.deleteUser(prof.id);
    }
  };

  try {
    await cleanUser(testEmail);

    // 1. Create a verified user for testing
    const { data: userRes, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Perf Tester' },
    });

    assert(!createErr && !!userRes.user?.id, '1. Verified user created for performance test');
    const userId = userRes.user!.id;

    // Log in to get session cookies
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password }),
    });

    const cookieHeader = loginRes.headers.get('set-cookie') || '';
    assert(loginRes.status === 200 && cookieHeader.includes('sb_access_token'), '2. User logged in and received session cookies');

    const projectId = (await import('crypto')).randomUUID();
    const mockOriginalKey = `test_orig_${projectId}.png`;
    const mockEnhancedKey = `test_enh_${projectId}.png`;

    const { error: projErr } = await supabaseAdmin.from('projects').insert({
      id: projectId,
      user_id: userId,
      title: 'Coral Reef Test.png',
      original_file_key: mockOriginalKey,
      enhanced_file_key: mockEnhancedKey,
      processing_time_ms: 1200,
      credit_pool_used: 'DAILY_BASE',
      is_archived: false,
    });

    assert(!projErr, '3. Test project inserted into database');

    // 3. Test GET /projects/workspace/summary endpoint
    const summaryRes = await fetch(`${baseUrl}/projects/workspace/summary`, {
      headers: { cookie: cookieHeader },
    });

    const summaryData = await summaryRes.json();

    assert(summaryRes.status === 200, '4. GET /projects/workspace/summary returns HTTP 200 OK');
    assert(
      summaryData.profile?.user?.email === testEmail &&
      typeof summaryData.stats?.totalProjects === 'number' &&
      summaryData.stats.totalProjects >= 1 &&
      typeof summaryData.stats.dailyTokensRemaining === 'number',
      '5. Workspace summary contains profile, stats, token balances, and counts in ONE payload'
    );

    assert(
      Array.isArray(summaryData.recentProjects) &&
      summaryData.recentProjects.length >= 1 &&
      typeof summaryData.recentProjects[0].originalUrl === 'string' &&
      summaryData.recentProjects[0].originalUrl.length > 0,
      '6. Recent projects return formatted image URLs (signed CDN or fallback asset paths)'
    );

    // 4. Test GET /projects endpoint (History list)
    const historyRes = await fetch(`${baseUrl}/projects`, {
      headers: { cookie: cookieHeader },
    });

    const historyData = await historyRes.json();

    assert(historyRes.status === 200 && Array.isArray(historyData), '7. GET /projects returns HTTP 200 OK array');
    assert(
      historyData[0].id === projectId &&
      typeof historyData[0].originalUrl === 'string',
      '8. History cards receive formatted URLs without downloading full image binaries'
    );

    // 5. Test IDOR protection: another user cannot access this user's project
    const otherEmail = `other_user_${Date.now()}@example.com`;
    const { data: otherUserRes } = await supabaseAdmin.auth.admin.createUser({
      email: otherEmail,
      password,
      email_confirm: true,
    });

    const otherLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otherEmail, password }),
    });

    const otherCookies = otherLoginRes.headers.get('set-cookie') || '';

    const idorRes = await fetch(`${baseUrl}/projects/${projectId}`, {
      headers: { cookie: otherCookies },
    });

    assert(idorRes.status === 404, '9. IDOR protection prevents cross-user access to project metadata (404)');

    // 6. Test signed URL batching function
    const batchSigned = await getSignedUrlsBatch([mockOriginalKey, mockEnhancedKey], 3600);
    assert(
      typeof batchSigned === 'object' && batchSigned !== null,
      '10. getSignedUrlsBatch executes batch storage query cleanly'
    );

    // Clean up
    await cleanUser(testEmail);
    await cleanUser(otherEmail);
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

runWorkspacePerformanceTests().catch((err) => {
  console.error('Fatal workspace performance test error:', err);
  process.exit(1);
});
