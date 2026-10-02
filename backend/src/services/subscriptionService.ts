import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { getUserCreditState, UserCreditState } from './creditService.js';

export interface PlanRecord {
  id: string;
  code: 'FREE' | 'PRO' | 'PREMIUM';
  name: string;
  daily_base_credits: number;
  monthly_bonus_credits: number;
  price_inr: number;
}

export interface SubscriptionRequestRecord {
  id: string;
  user_id: string;
  requested_plan_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requested_date: string;
  requested_at: string;
  planCode?: string;
}

export interface UserSubscriptionDetails {
  currentPlan: PlanRecord;
  subscriptionStatus: string;
  period: { startsAt: string; endsAt: string } | null;
  credits: UserCreditState;
  pendingRequest: SubscriptionRequestRecord | null;
}

export async function getPlans(): Promise<PlanRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('plans')
    .select('*')
    .order('price_inr', { ascending: true });

  if (error || !data || data.length === 0) {
    logger.warn('Plans table query returned empty/error. Returning canonical plan defaults.', undefined, 'SubscriptionService');
    return [
      { id: 'free-plan-id', code: 'FREE', name: 'Free Tier', daily_base_credits: 10, monthly_bonus_credits: 0, price_inr: 0 },
      { id: 'pro-plan-id', code: 'PRO', name: 'Pro Plan', daily_base_credits: 10, monthly_bonus_credits: 100, price_inr: 299 },
      { id: 'premium-plan-id', code: 'PREMIUM', name: 'Premium Plan', daily_base_credits: 10, monthly_bonus_credits: 200, price_inr: 499 },
    ];
  }

  return data as PlanRecord[];
}

export interface GrantForPlanLookup {
  status: string;
  period_start: string;
  expires_at: string;
  purchased_at: string;
  plan: PlanRecord | null;
}

/**
 * Decides which paid plan the user is "on". Newest purchase wins when several grants are active
 * (e.g. PRO bought first, PREMIUM bought later => PREMIUM). If nothing is active any more, the most
 * recent purchase is returned as EXPIRED so the UI can say so. Dates are compared directly, because a
 * grant's stored status is only refreshed when credits are read.
 */
export function pickCurrentGrant(
  grants: GrantForPlanLookup[],
  now: number = Date.now()
): { grant: GrantForPlanLookup; status: 'ACTIVE' | 'EXPIRED' } | null {
  const newestFirst = [...grants]
    .filter((g) => g.plan)
    .sort((a, b) => new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime());
  const active = newestFirst.find(
    (g) => (g.status === 'ACTIVE' || g.status === 'EXHAUSTED') && new Date(g.expires_at).getTime() > now
  );
  if (active) return { grant: active, status: 'ACTIVE' };
  if (newestFirst.length > 0) return { grant: newestFirst[0], status: 'EXPIRED' };
  return null;
}

export async function getUserSubscriptionDetails(userId: string): Promise<UserSubscriptionDetails> {
  const plans = await getPlans();
  const creditState = await getUserCreditState(userId);

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('status, plan:plans(*)')
    .eq('user_id', userId)
    .single();

  const { data: grantRows } = await supabaseAdmin
    .from('subscription_grants')
    .select('status, period_start, expires_at, purchased_at, plan:plans(*)')
    .eq('user_id', userId)
    .order('purchased_at', { ascending: false })
    .limit(10);

  const picked = pickCurrentGrant((grantRows || []) as unknown as GrantForPlanLookup[]);
  const freePlan = plans.find((p) => p.code === 'FREE') || plans[0];

  const currentPlan = picked
    ? (picked.grant.plan as PlanRecord)
    : (sub?.plan as unknown as PlanRecord) || freePlan;
  const subscriptionStatus = picked ? picked.status : sub?.status || 'ACTIVE';
  const period = picked ? { startsAt: picked.grant.period_start, endsAt: picked.grant.expires_at } : null;

  // Check pending subscription request for today or latest pending
  const { data: pendingReq } = await supabaseAdmin
    .from('subscription_requests')
    .select('id, user_id, requested_plan_id, status, requested_date, requested_at, plan:plans(code)')
    .eq('user_id', userId)
    .eq('status', 'PENDING')
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let formattedPending: SubscriptionRequestRecord | null = null;
  if (pendingReq) {
    formattedPending = {
      id: pendingReq.id,
      user_id: pendingReq.user_id,
      requested_plan_id: pendingReq.requested_plan_id,
      status: pendingReq.status as 'PENDING',
      requested_date: pendingReq.requested_date,
      requested_at: pendingReq.requested_at,
      planCode: (pendingReq.plan as any)?.code,
    };
  }

  return {
    currentPlan,
    subscriptionStatus,
    period,
    credits: creditState,
    pendingRequest: formattedPending,
  };
}

export function formatSubscriptionState(subDetails: UserSubscriptionDetails) {
  const nextIST = new Date();
  const nextISTDate = new Date(nextIST.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  nextISTDate.setHours(24, 0, 0, 0);

  const pending = subDetails.pendingRequest
    ? {
        id: subDetails.pendingRequest.id,
        plan: (subDetails.pendingRequest.planCode || 'PRO') as 'PRO' | 'PREMIUM',
        status: 'PENDING' as const,
        createdAt: subDetails.pendingRequest.requested_at,
        decidedAt: null,
        reason: null,
      }
    : null;

  return {
    current: {
      plan: (subDetails.currentPlan.code || 'FREE') as 'FREE' | 'PRO' | 'PREMIUM',
      status: (subDetails.subscriptionStatus || 'ACTIVE') as 'ACTIVE' | 'EXPIRED' | 'NONE',
      startsAt: subDetails.period?.startsAt ?? null,
      endsAt: subDetails.period?.endsAt ?? null,
    },
    pendingRequest: pending,
    lastDecision: null,
    requestedToday: !!pending,
    canRequest: !pending,
    nextEligibleAt: pending ? nextISTDate.toISOString() : null,
    reason: pending ? "You've already used today's subscription request." : null,
  };
}

export async function createSubscriptionUpgradeRequest(
  userId: string,
  planCode: string
): Promise<SubscriptionRequestRecord> {
  const upperCode = planCode.toUpperCase();
  if (!['PRO', 'PREMIUM'].includes(upperCode)) {
    throw new AppError('Invalid subscription upgrade target. Choose PRO or PREMIUM.', 400);
  }

  const { data: targetPlan, error: planErr } = await supabaseAdmin
    .from('plans')
    .select('id, code')
    .eq('code', upperCode)
    .maybeSingle();
  if (planErr || !targetPlan) {
    logger.error(
      `Plan '${upperCode}' could not be loaded from the plans table: ${planErr?.message || 'no row found'}. Run the plan seed SQL.`,
      undefined,
      'SubscriptionService'
    );
    throw new AppError('Subscription plans are not set up yet. Please contact support.', 503);
  }

  const todayIso = new Date().toISOString().split('T')[0];

  // Check for existing request today
  const { data: existingToday } = await supabaseAdmin
    .from('subscription_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('requested_date', todayIso)
    .maybeSingle();

  if (existingToday) {
    throw new AppError(
      'You have already submitted a subscription upgrade request today. You may submit 1 request per calendar day.',
      409
    );
  }

  const { data: created, error } = await supabaseAdmin
    .from('subscription_requests')
    .insert({
      user_id: userId,
      requested_plan_id: targetPlan.id,
      status: 'PENDING',
      requested_date: todayIso,
    })
    .select()
    .single();

  if (error || !created) {
    if (error?.code === '23505') {
      throw new AppError(
        'You have already submitted a subscription upgrade request today. You may submit 1 request per calendar day.',
        409
      );
    }
    logger.error(`Failed to create subscription request for user ${userId}: [${error?.code}] ${error?.message}`, undefined, 'SubscriptionService');
    throw new AppError('Failed to record subscription upgrade request.', 500);
  }

  return {
    id: created.id,
    user_id: created.user_id,
    requested_plan_id: created.requested_plan_id,
    status: created.status,
    requested_date: created.requested_date,
    requested_at: created.requested_at,
    planCode: upperCode,
  };
}