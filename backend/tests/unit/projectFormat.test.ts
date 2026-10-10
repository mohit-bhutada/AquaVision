import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://sb.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const { formatProjectAsync } = await import('../../src/routes/projects.js');

const realFetch = globalThis.fetch;
let signingFails = false;
const signCalls: string[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if (!url.startsWith('http://sb.test')) return realFetch(input, init);
  if (url.includes('/storage/v1/object/sign/')) {
    signCalls.push(decodeURIComponent(url.split('/object/sign/')[1]));
    if (signingFails) return new Response(JSON.stringify({ error: 'boom' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    const path = url.split('/object/sign/')[1];
    return new Response(JSON.stringify({ signedURL: `/object/sign/${path}?token=abc123` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('{}', { status: 404 });
}) as typeof fetch;
test.after(() => { globalThis.fetch = realFetch; });

const project = {
  id: '3f2b8c1e-9d4a-4e6b-8a1c-5d7e9f0a1b2c', user_id: 'u1', title: 'pic.jpg',
  original_file_key: 'u1/p1/original.jpg', enhanced_file_key: 'u1/p1/enhanced.png',
  processing_time_ms: 100, is_archived: false, created_at: '2026-10-03T00:00:00Z', updated_at: '2026-10-03T00:00:00Z',
};

test('a freshly enhanced project gets SIGNED storage URLs (no cookie needed), not relative API paths', async () => {
  signingFails = false; signCalls.length = 0;
  const out = await formatProjectAsync(project);
  assert.match(out.originalUrl, /^http:\/\/sb\.test\/storage\/v1\/object\/sign\/.+\?token=abc123$/);
  assert.match(out.enhancedUrl, /^http:\/\/sb\.test\/storage\/v1\/object\/sign\/.+\?token=abc123$/);
  assert.ok(!out.enhancedUrl.startsWith('/api/'), out.enhancedUrl);
  assert.equal(out.id, project.id);
  assert.equal(out.name, 'pic.jpg');
  assert.equal(out.status, 'COMPLETED');
  assert.equal(signCalls.length, 2);
});

test('if signing fails, it falls back to the authenticated relative route instead of breaking', async () => {
  signingFails = true;
  const out = await formatProjectAsync(project);
  assert.equal(out.originalUrl, `/api/v1/projects/${project.id}/original`);
  assert.equal(out.enhancedUrl, `/api/v1/projects/${project.id}/enhanced`);
});

test('the enhance route uses this same formatter for its response', () => {
  const src = readFileSync(new URL('../../src/routes/enhance.ts', import.meta.url), 'utf8');
  assert.match(src, /formatProjectAsync\(project\)/);
  assert.ok(!src.includes('`/api/v1/projects/${project.id}/enhanced`'), 'enhance must not hand-build relative asset URLs');
});
