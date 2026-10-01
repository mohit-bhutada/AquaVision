import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import {
  getPlans,
  getUserSubscriptionDetails,
  createSubscriptionUpgradeRequest,
  formatSubscriptionState,
} from '../services/subscriptionService.js';
import { getUserCreditState, formatCreditsResponse } from '../services/creditService.js';
import { formatUserResponse } from './auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// Helper to query user profile for /me/profile
async function fetchProfile(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, email, display_name, avatar_url, role, is_suspended, created_at')
    .eq('id', userId)
    .single();

  return profile || { id: userId, email: '', display_name: null, avatar_url: null, role: 'user', is_suspended: false, created_at: new Date().toISOString() };
}

export async function getFullUserProfile(userId: string) {
  const [profile, creditState, subDetails] = await Promise.all([
    fetchProfile(userId),
    getUserCreditState(userId),
    getUserSubscriptionDetails(userId),
  ]);

  return {
    user: formatUserResponse(profile),
    credits: formatCreditsResponse(creditState),
    subscription: formatSubscriptionState(subDetails),
  };
}

// GET /plans (public)
router.get('/plans', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const plansData = await getPlans();
    const formattedPlans = plansData.map((p) => ({
      id: p.code as 'FREE' | 'PRO' | 'PREMIUM',
      name: p.name,
      priceInr: p.price_inr,
      dailyTokens: p.daily_base_credits,
      monthlyTokens: p.monthly_bonus_credits,
      durationDays: 30,
    }));
    res.json(formattedPlans);
  } catch (err) {
    next(err);
  }
});

// GET /subscriptions/me 🔒
router.get('/subscriptions/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const details = await getUserSubscriptionDetails(req.user!.id);
    res.json(formatSubscriptionState(details));
  } catch (err) {
    next(err);
  }
});

// POST /subscriptions/requests 🔒
router.post('/subscriptions/requests', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const planTarget = req.body?.plan || req.body?.planCode;
    if (!planTarget) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Missing plan parameter.' } });
      return;
    }

    const requestRecord = await createSubscriptionUpgradeRequest(req.user!.id, planTarget);
    res.status(201).json({
      id: requestRecord.id,
      plan: (requestRecord.planCode || planTarget).toUpperCase() as 'PRO' | 'PREMIUM',
      status: 'PENDING',
      createdAt: requestRecord.requested_at,
      decidedAt: null,
      reason: null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /me/profile 🔒 (Combined endpoint)
router.get('/me/profile', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const fullProfile = await getFullUserProfile(req.user!.id);
    res.json(fullProfile);
  } catch (err) {
    next(err);
  }
});

// GET /credits 🔒
router.get('/credits', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const creditState = await getUserCreditState(req.user!.id);
    res.json(formatCreditsResponse(creditState));
  } catch (err) {
    next(err);
  }
});

// GET /credits/ledger 🔒
router.get('/credits/ledger', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;

    const { data: ledger } = await supabaseAdmin
      .from('credit_ledger')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    const items = (ledger || []).map((row: any) => ({
      id: row.id,
      createdAt: row.created_at,
      type: row.transaction_type === 'DEDUCTION' ? 'ENHANCEMENT' : row.transaction_type,
      pool: row.pool_type === 'DAILY_BASE' ? 'DAILY' : 'MONTHLY',
      amount: row.amount,
      reason: row.description || null,
      projectId: row.project_id || null,
      balanceAfter: null,
    }));

    res.json({
      items,
      nextCursor: null,
    });
  } catch (err) {
    next(err);
  }
});

// Backwards compatibility endpoint
router.get('/credits/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const creditState = await getUserCreditState(req.user!.id);
    res.json({
      status: 'success',
      credits: formatCreditsResponse(creditState),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
