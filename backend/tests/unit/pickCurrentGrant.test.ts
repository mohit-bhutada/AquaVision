import test from 'node:test';
import assert from 'node:assert/strict';
import { pickCurrentGrant, type GrantForPlanLookup } from '../../src/services/subscriptionService.js';

const plan = (code: string) => ({ id: code, code, name: code, daily_base_credits: 10, monthly_bonus_credits: 0, price_inr: 0 }) as any;
const grant = (code: string, purchased: string, expires: string, status = 'ACTIVE'): GrantForPlanLookup => ({
  status, plan: plan(code), purchased_at: purchased, period_start: purchased, expires_at: expires,
});
const now = new Date('2026-10-05T00:00:00Z').getTime();

test('two active grants: the newest purchase is shown', () => {
  const r = pickCurrentGrant([
    grant('PRO', '2026-09-26T00:00:00Z', '2026-10-26T00:00:00Z'),
    grant('PREMIUM', '2026-09-30T00:00:00Z', '2026-10-30T00:00:00Z'),
  ], now);
  assert.equal(r?.grant.plan?.code, 'PREMIUM');
  assert.equal(r?.status, 'ACTIVE');
});

test('newest grant expired but older one still active: the active one is shown', () => {
  const r = pickCurrentGrant([
    grant('PRO', '2026-09-26T00:00:00Z', '2026-10-26T00:00:00Z'),
    grant('PREMIUM', '2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z', 'EXPIRED'),
  ], now);
  assert.equal(r?.grant.plan?.code, 'PRO');
});

test('everything expired: latest purchase shown as EXPIRED, judged by date even if stored status is stale', () => {
  const r = pickCurrentGrant([grant('PRO', '2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z', 'ACTIVE')], now);
  assert.equal(r?.status, 'EXPIRED');
});

test('exhausted-but-unexpired grant still counts as the current plan', () => {
  const r = pickCurrentGrant([grant('PRO', '2026-09-26T00:00:00Z', '2026-10-26T00:00:00Z', 'EXHAUSTED')], now);
  assert.equal(r?.status, 'ACTIVE');
});

test('no grants: null (caller falls back to the free plan)', () => {
  assert.equal(pickCurrentGrant([], now), null);
});
