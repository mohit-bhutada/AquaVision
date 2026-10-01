import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/errorHandler.js';

export interface UserCreditState {
  dailyBalance: number;
  dailyMax: number;
  monthlyBalance: number;
  totalAvailable: number;
  planCode: 'FREE' | 'PRO' | 'PREMIUM';
  planName: string;
  subscriptionStatus: string;
  lastDailyReset: string | null;
}

export interface CreditReservationResult {
  success: boolean;
  poolUsed: 'DAILY_BASE' | 'MONTHLY_BONUS' | null;
  grantId: string | null;
  dailyBalance: number;
  monthlyBalance: number;
  errorCode?: string;
}

export async function getUserCreditState(userId: string): Promise<UserCreditState> {
  // 1. Trigger IST daily reset, expired grant cleanup & stale enhancement reconciliation
  try {
    await supabaseAdmin.rpc('check_and_reset_user_credits', { p_user_id: userId });
    await reconcileStaleEnhancements();
  } catch (err: any) {
    logger.warn(`RPC check_and_reset_user_credits / reconciliation fallback check: ${err.message}`, undefined, 'CreditService');
  }

  // 2. Query credit balance
  const { data: balance, error: balErr } = await supabaseAdmin
    .from('credit_balances')
    .select('daily_base_balance, monthly_bonus_balance, last_daily_reset')
    .eq('user_id', userId)
    .single();

  if (balErr && balErr.code !== 'PGRST116') {
    logger.error(`Error fetching credit balance for user ${userId}: ${balErr.message}`, undefined, 'CreditService');
  }

  const dailyBal = balance?.daily_base_balance ?? 10;
  const monthlyBal = balance?.monthly_bonus_balance ?? 0;

  // 3. Query user subscription & plan details
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('status, plan:plans(code, name)')
    .eq('user_id', userId)
    .single();

  const planData = (sub?.plan as any) || { code: 'FREE', name: 'Free Tier' };
  const subStatus = sub?.status || 'ACTIVE';

  return {
    dailyBalance: dailyBal,
    dailyMax: 10,
    monthlyBalance: monthlyBal,
    totalAvailable: dailyBal + monthlyBal,
    planCode: planData.code || 'FREE',
    planName: planData.name || 'Free Tier',
    subscriptionStatus: subStatus,
    lastDailyReset: balance?.last_daily_reset || null,
  };
}

export function formatCreditsResponse(state: UserCreditState) {
  const now = new Date();
  const nextIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  nextIST.setHours(24, 0, 0, 0);

  return {
    daily: {
      balance: state.dailyBalance,
      limit: state.dailyMax,
      resetsAt: nextIST.toISOString(),
    },
    monthly: {
      balance: state.monthlyBalance,
      limit: state.planCode === 'PRO' ? 100 : state.planCode === 'PREMIUM' ? 200 : 0,
    },
    total: state.totalAvailable,
  };
}

export async function reserveCredit(userId: string): Promise<CreditReservationResult> {
  // Reservation is performed ONLY by the atomic, row-locking Postgres function. There is no
  // JS read-modify-write fallback: it is not concurrency-safe and would allow double spending.
  const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc('reserve_enhancement_credit', {
    p_user_id: userId,
  });

  if (rpcErr || !rpcResult || rpcResult.length === 0) {
    logger.error(
      `reserve_enhancement_credit RPC failed for user ${userId}: ${rpcErr?.message || 'empty result'}`,
      undefined,
      'CreditService'
    );
    throw new AppError('Credit service is temporarily unavailable. Please try again.', 503, 'CREDITS_UNAVAILABLE');
  }

  const res = rpcResult[0];
  if (res.success) {
    logger.info(`Reserved 1 credit from pool [${res.pool_used}] for user ${userId}`, undefined, 'CreditService');
    return {
      success: true,
      poolUsed: res.pool_used as 'DAILY_BASE' | 'MONTHLY_BONUS',
      grantId: res.grant_id || null,
      dailyBalance: res.daily_balance,
      monthlyBalance: res.monthly_balance,
    };
  }

  logger.warn(`Credit reservation failed for user ${userId}: ${res.error_code}`, undefined, 'CreditService');
  return {
    success: false,
    poolUsed: null,
    grantId: null,
    dailyBalance: res.daily_balance || 0,
    monthlyBalance: res.monthly_balance || 0,
    errorCode: res.error_code || 'INSUFFICIENT_CREDITS',
  };
}

export async function refundCredit(
  userId: string,
  poolUsed: 'DAILY_BASE' | 'MONTHLY_BONUS',
  grantId?: string | null,
  reason: string = 'Enhancement or persistence failure refund'
): Promise<void> {
  // Atomic refund via Postgres function only (one retry on transient failure).
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await supabaseAdmin.rpc('refund_enhancement_credit', {
      p_user_id: userId,
      p_pool_used: poolUsed,
      p_grant_id: grantId || null,
      p_reason: reason,
    });
    if (!error) {
      logger.info(`Refunded 1 credit to pool [${poolUsed}] for user ${userId}`, undefined, 'CreditService');
      return;
    }
    logger.warn(`refund_enhancement_credit attempt ${attempt} failed: ${error.message}`, undefined, 'CreditService');
  }
  logger.error(
    `REFUND FAILED for user ${userId} (pool ${poolUsed}, grant ${grantId || 'none'}): manual reconciliation required`,
    undefined,
    'CreditService'
  );
}

export async function createPendingEnhancementOperation(
  userId: string,
  idempotencyKey: string,
  poolUsed: 'DAILY_BASE' | 'MONTHLY_BONUS',
  grantId?: string | null
): Promise<string> {
  const opId = globalThis.crypto.randomUUID();
  const metadata = JSON.stringify({ poolUsed, grantId: grantId || null });
  const { error } = await supabaseAdmin.from('enhancement_operations').insert({
    id: opId,
    user_id: userId,
    idempotency_key: idempotencyKey,
    status: 'PROCESSING',
    error_message: metadata,
  });

  if (error) {
    logger.warn(`Failed to log pending enhancement operation: ${error.message}`, undefined, 'CreditService');
  }
  return opId;
}

export async function markEnhancementOpCompleted(opId: string, projectId: string) {
  await supabaseAdmin
    .from('enhancement_operations')
    .update({
      status: 'COMPLETED',
      project_id: projectId,
      completed_at: new Date().toISOString(),
    })
    .eq('id', opId);
}

export async function markEnhancementOpFailed(opId: string, errorMsg: string) {
  await supabaseAdmin
    .from('enhancement_operations')
    .update({
      status: 'FAILED',
      error_message: errorMsg,
      completed_at: new Date().toISOString(),
    })
    .eq('id', opId);
}

export async function reconcileStaleEnhancements(staleThresholdMinutes = 5): Promise<number> {
  const cutoff = new Date(Date.now() - staleThresholdMinutes * 60 * 1000).toISOString();
  
  const { data: staleOps } = await supabaseAdmin
    .from('enhancement_operations')
    .select('*')
    .eq('status', 'PROCESSING')
    .lt('created_at', cutoff);

  if (!staleOps || staleOps.length === 0) return 0;

  let refundedCount = 0;
  for (const op of staleOps) {
    const nowIso = new Date().toISOString();
    const { data: updated } = await supabaseAdmin
      .from('enhancement_operations')
      .update({
        status: 'FAILED',
        error_message: 'Abandoned process timeout reconciliation refund',
        completed_at: nowIso,
      })
      .eq('id', op.id)
      .eq('status', 'PROCESSING')
      .select()
      .single();

    if (updated) {
      let poolUsed: 'DAILY_BASE' | 'MONTHLY_BONUS' = 'DAILY_BASE';
      let grantId: string | null = null;
      try {
        if (op.error_message && op.error_message.startsWith('{')) {
          const parsed = JSON.parse(op.error_message);
          poolUsed = parsed.poolUsed || 'DAILY_BASE';
          grantId = parsed.grantId || null;
        }
      } catch {
        /* fallback to DAILY_BASE */
      }
      await refundCredit(op.user_id, poolUsed, grantId, 'Abandoned process timeout reconciliation refund');
      refundedCount++;
    }
  }

  return refundedCount;
}
