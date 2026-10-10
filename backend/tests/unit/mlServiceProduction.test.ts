import test from 'node:test';
import assert from 'node:assert/strict';

// This file runs in its own process, so it can safely behave like production.
process.env.NODE_ENV = 'production';
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.OTP_PEPPER = 'p'.repeat(40);
process.env.CORS_ORIGIN = 'https://app.example.com';

const { enhanceImageWithMLService } = await import('../../src/services/mlService.js');
const realFetch = globalThis.fetch;
const IMG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]);
const call = () => enhanceImageWithMLService(IMG, 'a.png', 'image/png', 'r', { sleep: async () => {} });
const reset = () => { for (const k of ['ML_SERVICE_URL', 'AQUAVISION_ML_BASE_URL', 'AQUAVISION_ML_API_KEY', 'ML_SERVICE_API_KEY']) delete process.env[k]; globalThis.fetch = realFetch; };
test.afterEach(reset);

function spyFetch() {
  const calls: string[] = [];
  globalThis.fetch = (async (u: any) => { calls.push(String(u)); return new Response(Buffer.from([1]), { status: 200, headers: { 'content-type': 'image/png' } }); }) as typeof fetch;
  return calls;
}

test('production refuses to call the ML service without an API key (never sends an unauthenticated request)', async () => {
  process.env.AQUAVISION_ML_BASE_URL = 'https://ml.example.com';
  const calls = spyFetch();
  await assert.rejects(call(), (e: any) => e.statusCode === 503 && e.code === 'ML_UNAVAILABLE');
  assert.equal(calls.length, 0);
});

test('production refuses http:// and localhost URLs', async () => {
  process.env.AQUAVISION_ML_API_KEY = 'k';
  for (const url of ['http://ml.example.com', 'https://localhost:8000', 'http://127.0.0.1:8000']) {
    process.env.AQUAVISION_ML_BASE_URL = url;
    const calls = spyFetch();
    await assert.rejects(call(), (e: any) => e.code === 'ML_UNAVAILABLE', url);
    assert.equal(calls.length, 0, url);
  }
});

test('production works with an https URL and a key; trailing slashes are tolerated', async () => {
  process.env.AQUAVISION_ML_API_KEY = 'k';
  process.env.AQUAVISION_ML_BASE_URL = 'https://aquavision-ml-service-cxf5.onrender.com/';
  const calls = spyFetch();
  await call();
  assert.deepEqual(calls, ['https://aquavision-ml-service-cxf5.onrender.com/v1/enhance']);
});
