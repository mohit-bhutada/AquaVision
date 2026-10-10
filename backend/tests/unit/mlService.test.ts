import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.ML_SERVICE_URL = 'http://ml.test';

const { enhanceImageWithMLService } = await import('../../src/services/mlService.js');

const realFetch = globalThis.fetch;
const IMG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const noSleep = async () => {};
const clearEnv = () => { for (const k of ['AQUAVISION_ML_API_KEY', 'AQUAVISION_API_KEY', 'ML_SERVICE_API_KEY', 'AQUAVISION_ML_BASE_URL', 'AQUAVISION_ML_TIMEOUT_SECONDS']) delete process.env[k]; };
test.afterEach(() => { globalThis.fetch = realFetch; clearEnv(); });

type Call = { url: string; init: any };
function mockFetch(responses: Array<() => Response | Promise<Response>>): Call[] {
  const calls: Call[] = [];
  let i = 0;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const next = responses[Math.min(i++, responses.length - 1)];
    return next();
  }) as typeof fetch;
  return calls;
}
const ok = (type = 'image/png', extra: Record<string, string> = {}) => () =>
  new Response(Buffer.from([1, 2, 3]), { status: 200, headers: { 'content-type': type, 'X-Request-ID': 'ml-1', 'X-Model-Version': 'unet-v2', 'X-Inference-Ms': '420', ...extra } });
const fail = (status: number, body: unknown, headers: Record<string, string> = {}) => () =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': typeof body === 'string' ? 'text/html' : 'application/json', ...headers } });
const run = () => enhanceImageWithMLService(IMG, 'a.png', 'image/png', 'req-1', { sleep: noSleep });

test('calls POST /v1/enhance with X-API-Key, SHA-256 of the sent bytes, and exactly one `file` field', async () => {
  process.env.AQUAVISION_ML_API_KEY = 'secret-key';
  const calls = mockFetch([ok()]);
  const r = await run();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://ml.test/v1/enhance');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'manual'); // Workers does not support 'error'
  const h = new Headers(calls[0].init.headers);
  assert.equal(h.get('x-api-key'), 'secret-key');
  assert.equal(h.get('authorization'), null);
  assert.equal(h.get('x-model-input-sha256'), (await import('node:crypto')).createHash('sha256').update(IMG).digest('hex'));
  assert.equal(h.get('content-type'), null); // fetch must generate the multipart boundary itself
  const form = calls[0].init.body as FormData;
  assert.deepEqual([...form.keys()], ['file']);
  assert.equal((form.get('file') as File).name, 'a.png');
  assert.equal(r.contentType, 'image/png');
  assert.equal(r.requestId, 'ml-1');
  assert.equal(r.modelVersion, 'unet-v2');
  assert.equal(r.inferenceMs, '420');
});

test('accepts the older ML_SERVICE_API_KEY name too, and the base URL alias', async () => {
  process.env.ML_SERVICE_API_KEY = 'old-name';
  process.env.AQUAVISION_ML_BASE_URL = 'http://alias.test/';
  const calls = mockFetch([ok('image/jpeg')]);
  const r = await run();
  assert.equal(calls[0].url, 'http://alias.test/v1/enhance');
  assert.equal(new Headers(calls[0].init.headers).get('x-api-key'), 'old-name');
  assert.equal(r.contentType, 'image/jpeg');
});

test('the key is also read from AQUAVISION_API_KEY (same name the ML service uses)', async () => {
  process.env.AQUAVISION_API_KEY = 'shared-name';
  const calls = mockFetch([ok()]);
  await run();
  assert.equal(new Headers(calls[0].init.headers).get('x-api-key'), 'shared-name');
});

test('AQUAVISION_ML_API_KEY wins if both are set', async () => {
  process.env.AQUAVISION_ML_API_KEY = 'preferred';
  process.env.AQUAVISION_API_KEY = 'other';
  const calls = mockFetch([ok()]);
  await run();
  assert.equal(new Headers(calls[0].init.headers).get('x-api-key'), 'preferred');
});

test('a redirect is never followed and is reported as a configuration problem', async () => {
  process.env.AQUAVISION_ML_API_KEY = 'secret-key';
  const calls = mockFetch([() => new Response(null, { status: 301, headers: { location: 'https://elsewhere.example/v1/enhance' } })]);
  await assert.rejects(run(), (e: any) => e.statusCode === 502 && e.code === 'ML_FAILED' && !e.message.includes('elsewhere'));
  assert.equal(calls.length, 1);
});

test('user-image problems map to 422/413 with clear messages', async () => {
  const cases: Array<[number, string, number, string]> = [
    [400, 'invalid_image', 422, 'ML_REJECTED_INPUT'],
    [400, 'empty_file', 422, 'ML_REJECTED_INPUT'],
    [400, 'unsupported_format', 422, 'ML_REJECTED_INPUT'],
    [413, 'file_too_large', 413, 'FILE_TOO_LARGE'],
    [413, 'image_too_large', 413, 'IMAGE_TOO_LARGE'],
  ];
  for (const [status, error, wantStatus, wantCode] of cases) {
    mockFetch([fail(status, { error, message: 'x', request_id: 'r' })]);
    await assert.rejects(run(), (e: any) => e.statusCode === wantStatus && e.code === wantCode, `${status} ${error}`);
  }
});

test('config/integration failures are 502 and never blamed on the user', async () => {
  const cases: Array<[number, string]> = [[401, 'unauthorized'], [503, 'service_unconfigured'], [400, 'checksum_mismatch'], [400, 'missing_file'], [400, 'invalid_request'], [500, 'inference_failed']];
  for (const [status, error] of cases) {
    mockFetch([fail(status, { error, message: 'x', request_id: 'r' })]);
    await assert.rejects(run(), (e: any) => e.statusCode === 502 && e.code === 'ML_FAILED' && !/secret|key/i.test(e.message), `${status} ${error}`);
  }
});

test('model_unavailable / compute_unavailable are 503 and are NOT auto-retried', async () => {
  for (const error of ['model_unavailable', 'compute_unavailable']) {
    const calls = mockFetch([fail(503, { error, message: 'x', request_id: 'r' }, { 'Retry-After': '5' })]);
    await assert.rejects(run(), (e: any) => e.statusCode === 503 && e.code === 'ML_UNAVAILABLE');
    assert.equal(calls.length, 1, error);
  }
});

test('service_busy is retried up to twice (respecting Retry-After), then succeeds', async () => {
  const busy = fail(503, { error: 'service_busy', message: 'x', request_id: 'r' }, { 'Retry-After': '5' });
  const delays: number[] = [];
  const calls = mockFetch([busy, busy, ok()]);
  const r = await enhanceImageWithMLService(IMG, 'a.png', 'image/png', 'req', { sleep: async (ms) => { delays.push(ms); } });
  assert.equal(calls.length, 3);
  assert.equal(r.requestId, 'ml-1');
  assert.equal(delays.length, 2);
  assert.ok(delays[0] >= 5000 && delays[0] < 6100, String(delays[0]));
  assert.ok(delays[1] >= 10000 && delays[1] < 11100, String(delays[1])); // backs off on the second retry
});

test('service_busy that never clears fails after 2 retries with 503 ML_BUSY', async () => {
  const calls = mockFetch([fail(503, { error: 'service_busy', message: 'x', request_id: 'r' }, { 'Retry-After': '5' })]);
  await assert.rejects(run(), (e: any) => e.statusCode === 503 && e.code === 'ML_BUSY');
  assert.equal(calls.length, 3);
});

test('non-JSON gateway errors (Render/proxy) are handled safely', async () => {
  mockFetch([fail(502, '<html>Bad gateway</html>')]);
  await assert.rejects(run(), (e: any) => e.statusCode === 502 && e.code === 'ML_FAILED');
  mockFetch([fail(504, '')]);
  await assert.rejects(run(), (e: any) => e.statusCode === 504 && e.code === 'ML_TIMEOUT');
});

test('HTTP 200 with a non-image Content-Type or empty body is an invalid response, never a success', async () => {
  mockFetch([() => new Response('<html>oops</html>', { status: 200, headers: { 'content-type': 'text/html' } })]);
  await assert.rejects(run(), (e: any) => e.statusCode === 502 && e.code === 'ML_INVALID_RESPONSE');
  mockFetch([() => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })]);
  await assert.rejects(run(), (e: any) => e.code === 'ML_INVALID_RESPONSE');
  mockFetch([() => new Response(Buffer.alloc(0), { status: 200, headers: { 'content-type': 'image/png' } })]);
  await assert.rejects(run(), (e: any) => e.code === 'ML_INVALID_RESPONSE');
  mockFetch([ok('image/webp')]);
  await assert.rejects(run(), (e: any) => e.code === 'ML_INVALID_RESPONSE');
});

test('timeouts map to 504 and connection failures to 503', async () => {
  globalThis.fetch = (async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); }) as typeof fetch;
  await assert.rejects(run(), (e: any) => e.statusCode === 504 && e.code === 'ML_TIMEOUT');
  globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  await assert.rejects(run(), (e: any) => e.statusCode === 503 && e.code === 'ML_UNAVAILABLE');
});

test('the API key never appears in error messages shown to users', async () => {
  process.env.AQUAVISION_ML_API_KEY = 'super-secret-key-123';
  mockFetch([fail(401, { error: 'unauthorized', message: 'bad key super-secret-key-123', request_id: 'r' })]);
  await assert.rejects(run(), (e: any) => !e.message.includes('super-secret-key-123'));
});
