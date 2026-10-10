import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://sb.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const { deleteProjects } = await import('../../src/services/projectService.js');

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const mine = Array.from({ length: 50 }, (_, i) => uuid(i + 1));        // 50 projects owned by the user
const notMine = uuid(900);                                              // belongs to someone else / doesn't exist
const requests: string[] = [];
let removedKeys: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = new URL(String(input));
  if (url.host !== 'sb.test') return realFetch(input, init);
  requests.push(`${init?.method || 'GET'} ${url.pathname}`);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  const ids = (url.searchParams.get('id') || '').replace(/^in\.\(|\)$/g, '').split(',').filter(Boolean);
  if (url.pathname.endsWith('/projects') && (init?.method || 'GET') === 'GET') {
    return json(ids.filter((id) => mine.includes(id)).map((id) => ({ id, original_file_key: `u/${id}/o.png`, enhanced_file_key: `u/${id}/e.png` })));
  }
  if (url.pathname.endsWith('/projects') && init?.method === 'DELETE') return json(ids.filter((id) => mine.includes(id)).map((id) => ({ id })));
  if (url.pathname.endsWith('/share_tokens')) return json([]);
  if (url.pathname.includes('/storage/v1/object/')) { removedKeys = JSON.parse(init.body).prefixes; return json(removedKeys.map((name) => ({ name }))); }
  return json({}, 404);
}) as typeof fetch;
test.after(() => { globalThis.fetch = realFetch; });

test('deleting 50 projects uses a fixed handful of requests (a Worker allows only a limited number per call)', async () => {
  const result = await deleteProjects('user-1', [...mine, notMine, mine[0]]); // includes a stranger's id and a duplicate
  assert.equal(result.deletedIds.length, 50);
  assert.deepEqual(result.failedIds, [notMine], 'ids that are not the caller\'s are reported as failed, never deleted');
  assert.ok(requests.length <= 5, `expected <= 5 requests, got ${requests.length}: ${requests.join(' | ')}`);
  assert.equal(removedKeys.length, 100, 'every original + enhanced file is removed in one storage call');
});
