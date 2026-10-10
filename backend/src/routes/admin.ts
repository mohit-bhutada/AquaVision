import { Router, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin, AdminRequest } from '../middleware/admin.js';
import { AdminService } from '../services/adminService.js';
import { getUserCreditState, formatCreditsResponse } from '../services/creditService.js';
import { getUserSubscriptionDetails, formatSubscriptionState } from '../services/subscriptionService.js';
import { formatUserResponse } from './auth.js';
import { uuidParam, isUuid } from '../middleware/validateParams.js';
import { escapeSearchTerm } from '../lib/searchTerm.js';
import { firstRow } from '../lib/relations.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();
router.param('id', uuidParam);

// Strict rate limiter for sensitive administrative APIs
const adminRateLimiter = createRateLimiter('admin-endpoints', {
  windowMs: 15 * 60 * 1000,
  maxRequests: 100,
  message: 'Excessive admin requests. Please slow down.',
});

// All routes in this router MUST pass both authentication AND database-authoritative admin checks!
router.use(requireAuth, requireAdmin, adminRateLimiter);

// 1. GET /admin/me — Return User directly
router.get('/me', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', req.user!.id).single();
    res.json(formatUserResponse(profile || req.adminProfile));
  } catch (err) {
    next(err);
  }
});

// 2. GET /admin/overview — Aggregate statistics
router.get('/overview', async (_req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await AdminService.getOverviewStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// 3. GET /admin/users — Paginated/filtered user list
router.get('/users', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.q || req.query.search) as string | undefined;
    const status = req.query.status as string | undefined;

    let query = supabaseAdmin
      .from('profiles')
      .select(`
        *,
        subscriptions(
          status,
          plans(code)
        )
      `);

    if (search && search.trim()) {
      const term = escapeSearchTerm(search);
      query = query.or(`email.ilike.%${term}%,display_name.ilike.%${term}%`);
    }
    if (status === 'ACTIVE') {
      query = query.eq('is_suspended', false);
    } else if (status === 'SUSPENDED') {
      query = query.eq('is_suspended', true);
    }

    query = query.order('created_at', { ascending: false });
    query = query.limit(500);

    const { data, error } = await query;
    if (error) throw new AppError(error.message, 500, 'INTERNAL');

    const items = (data || []).map((p: any) => {
      const u = formatUserResponse(p);
      const planCode = firstRow<any>(firstRow<any>(p.subscriptions)?.plans)?.code || 'FREE';
      return {
        ...u,
        plan: planCode as any,
      };
    });

    res.json({ items, nextCursor: null });
  } catch (err) {
    next(err);
  }
});

// 4. GET /admin/users/:id — Exhaustive user detail
router.get('/users/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.id as string;
    const { data: profile, error } = await supabaseAdmin.from('profiles').select('*').eq('id', userId).single();
    if (error || !profile) throw new AppError('User not found', 404, 'NOT_FOUND');

    const user = formatUserResponse(profile);
    const credits = await getUserCreditState(userId);
    const subscription = await getUserSubscriptionDetails(userId);

    const { count: projectsCount } = await supabaseAdmin.from('projects').select('*', { count: 'exact', head: true }).eq('user_id', userId);

    res.json({
      user,
      credits: formatCreditsResponse(credits),
      subscription: formatSubscriptionState(subscription),
      projectsCount: projectsCount || 0,
    });
  } catch (err) {
    next(err);
  }
});

// 5. PATCH/POST /admin/users/:id/status — Suspend/Reactivate user
const handleStatusChange = async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.id as string;
    if (req.user!.id === userId) {
      throw new AppError('An admin cannot change their own account status.', 409, 'CANNOT_CHANGE_SELF');
    }

    let isSuspended: boolean;
    if (typeof req.body.isSuspended === 'boolean') {
      isSuspended = req.body.isSuspended;
    } else if (req.body.status === 'SUSPENDED') {
      isSuspended = true;
    } else if (req.body.status === 'ACTIVE') {
      isSuspended = false;
    } else {
      throw new AppError('Status must be ACTIVE or SUSPENDED.', 400, 'VALIDATION_ERROR');
    }

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update({ is_suspended: isSuspended, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('*')
      .single();

    if (error || !updated) throw new AppError('Failed to update user status.', 500, 'INTERNAL');

    const reqMeta = { ip: req.ip, userAgent: req.headers['user-agent'] };
    await AdminService.logAdminAction({
      userId: req.user!.id,
      eventType: isSuspended ? 'ADMIN_USER_SUSPEND' : 'ADMIN_USER_REACTIVATE',
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      payload: { targetUserId: userId, isSuspended, reason: req.body.reason || 'Admin status change' },
    });

    res.json(formatUserResponse(updated));
  } catch (err) {
    next(err);
  }
};

router.patch('/users/:id/status', handleStatusChange);
router.post('/users/:id/status', handleStatusChange);

// 6. PATCH/POST /admin/users/:id/role — Change user role
const handleRoleChange = async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.id as string;
    const roleInput = (req.body.role || '').toLowerCase();

    if (roleInput !== 'user' && roleInput !== 'admin') {
      throw new AppError('Role must be USER or ADMIN.', 400, 'VALIDATION_ERROR');
    }

    if (req.user!.id === userId && roleInput !== 'admin') {
      throw new AppError('An admin cannot revoke their own admin status.', 409, 'CANNOT_CHANGE_SELF');
    }

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update({ role: roleInput, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('*')
      .single();

    if (error || !updated) throw new AppError('Failed to update user role.', 500, 'INTERNAL');

    const reqMeta = { ip: req.ip, userAgent: req.headers['user-agent'] };
    await AdminService.logAdminAction({
      userId: req.user!.id,
      eventType: 'ADMIN_ROLE_CHANGE',
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      payload: { targetUserId: userId, newRole: roleInput },
    });

    res.json(formatUserResponse(updated));
  } catch (err) {
    next(err);
  }
};

router.patch('/users/:id/role', handleRoleChange);
router.post('/users/:id/role', handleRoleChange);

// 7. GET /admin/subscription-requests — List upgrade requests
router.get('/subscription-requests', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;

    let query = supabaseAdmin
      .from('subscription_requests')
      .select('*, profiles!subscription_requests_user_id_fkey(id, email, display_name), plans:requested_plan_id(code)');

    if (status) {
      query = query.eq('status', status.toUpperCase());
    }

    query = query.order('requested_at', { ascending: false });
    query = query.limit(500);

    const { data, error } = await query;
    if (error) throw new AppError(error.message, 500, 'INTERNAL');

    const items = (data || []).map((r: any) => ({
      id: r.id,
      plan: (r.plans?.code || 'PRO') as any,
      status: r.status,
      createdAt: r.requested_at || r.created_at,
      decidedAt: r.reviewed_at || null,
      reason: r.rejection_reason || null,
      user: {
        id: r.profiles?.id || r.user_id,
        email: r.profiles?.email || '',
        name: r.profiles?.display_name || null,
      },
    }));

    res.json(items);
  } catch (err) {
    next(err);
  }
});

// 8. POST /admin/subscription-requests/:id/approve
router.post('/subscription-requests/:id/approve', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const requestId = req.params.id as string;
    const reqMeta = { ip: req.ip, userAgent: req.headers['user-agent'] };

    const { data: reqData } = await supabaseAdmin.from('subscription_requests').select('*, plans:requested_plan_id(code), profiles!subscription_requests_user_id_fkey(id, email, display_name)').eq('id', requestId).single();
    if (!reqData) throw new AppError('Subscription request not found.', 404, 'NOT_FOUND');
    if (reqData.status !== 'PENDING') {
      throw new AppError(`Subscription request has already been ${reqData.status.toLowerCase()}.`, 409, 'REQUEST_ALREADY_DECIDED');
    }

    await AdminService.reviewSubscriptionRequest(req.user!.id, requestId, 'APPROVE', reqMeta);

    res.json({
      id: reqData.id,
      plan: reqData.plans?.code || 'PRO',
      status: 'APPROVED',
      createdAt: reqData.requested_at || reqData.created_at,
      decidedAt: new Date().toISOString(),
      reason: null,
    });
  } catch (err) {
    next(err);
  }
});

// 9. POST /admin/subscription-requests/:id/reject
router.post('/subscription-requests/:id/reject', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const requestId = req.params.id as string;
    const { reason } = req.body;
    const reqMeta = { ip: req.ip, userAgent: req.headers['user-agent'] };

    const { data: reqData } = await supabaseAdmin.from('subscription_requests').select('*, plans:requested_plan_id(code)').eq('id', requestId).single();
    if (!reqData) throw new AppError('Subscription request not found.', 404, 'NOT_FOUND');
    if (reqData.status !== 'PENDING') {
      throw new AppError(`Subscription request has already been ${reqData.status.toLowerCase()}.`, 409, 'REQUEST_ALREADY_DECIDED');
    }

    await AdminService.reviewSubscriptionRequest(req.user!.id, requestId, 'REJECT', reqMeta);
    if (reason) {
      await supabaseAdmin.from('subscription_requests').update({ rejection_reason: reason }).eq('id', requestId);
    }

    res.json({
      id: reqData.id,
      plan: reqData.plans?.code || 'PRO',
      status: 'REJECTED',
      createdAt: reqData.requested_at || reqData.created_at,
      decidedAt: new Date().toISOString(),
      reason: reason || null,
    });
  } catch (err) {
    next(err);
  }
});

// 10. POST /admin/credits/adjust — Manual credit adjustment
router.post('/credits/adjust', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { userId, pool, poolType, amount, reason } = req.body;
    const targetPool = pool === 'DAILY' ? 'DAILY_BASE' : pool === 'MONTHLY' ? 'MONTHLY_BONUS' : poolType;

    if (!userId || typeof amount !== 'number' || !targetPool || !reason) {
      throw new AppError('userId, amount, pool (DAILY or MONTHLY), and reason are required.', 400, 'VALIDATION_ERROR');
    }
    if (!isUuid(userId)) {
      throw new AppError('Invalid user identifier.', 400, 'VALIDATION_ERROR');
    }
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1000) {
      throw new AppError('amount must be a non-zero integer between -1000 and 1000.', 400, 'VALIDATION_ERROR');
    }
    if (targetPool !== 'DAILY_BASE' && targetPool !== 'MONTHLY_BONUS') {
      throw new AppError('pool must be DAILY or MONTHLY.', 400, 'VALIDATION_ERROR');
    }
    if (typeof reason !== 'string' || reason.length > 500) {
      throw new AppError('reason must be a string of at most 500 characters.', 400, 'VALIDATION_ERROR');
    }

    const reqMeta = { ip: req.ip, userAgent: req.headers['user-agent'] };

    const currentBal = await getUserCreditState(userId);
    if (pool === 'DAILY' && currentBal.dailyBalance + amount < 0) {
      throw new AppError('Daily credit balance cannot be negative.', 409, 'BALANCE_NEGATIVE');
    }
    if (pool === 'MONTHLY' && currentBal.monthlyBalance + amount < 0) {
      throw new AppError('Monthly credit balance cannot be negative.', 409, 'BALANCE_NEGATIVE');
    }

    await AdminService.adjustUserCredits(req.user!.id, userId, amount, targetPool, reason, reqMeta);
    const updatedCredits = await getUserCreditState(userId);

    res.json({ credits: formatCreditsResponse(updatedCredits) });
  } catch (err) {
    next(err);
  }
});

// 11. GET /admin/projects — List projects metadata
router.get('/projects', async (_req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { data: projects, error } = await supabaseAdmin
      .from('projects')
      .select('*, profiles(id, email)')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw new AppError(error.message, 500, 'INTERNAL');

    const items = (projects || []).map((p: any) => ({
      id: p.id,
      name: p.title || 'Untitled Project',
      status: p.status === 'COMPLETED' ? 'COMPLETED' : p.status === 'FAILED' ? 'FAILED' : 'PROCESSING',
      originalUrl: `/api/v1/projects/${p.id}/file/original`,
      enhancedUrl: p.enhanced_file_path ? `/api/v1/projects/${p.id}/file/enhanced` : null,
      shareToken: p.share_token || null,
      width: p.width || null,
      height: p.height || null,
      createdAt: p.created_at,
      owner: {
        id: p.profiles?.id || p.user_id,
        email: p.profiles?.email || '',
      },
    }));

    res.json({ items, nextCursor: null });
  } catch (err) {
    next(err);
  }
});

// 12. GET /admin/audit-logs — Audit log list
router.get('/audit-logs', async (_req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { data: logs, error } = await supabaseAdmin
      .from('audit_logs')
      .select('*, profiles(id, email)')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw new AppError(error.message, 500, 'INTERNAL');

    const items = (logs || []).map((l: any) => ({
      id: l.id,
      createdAt: l.created_at,
      actor: l.user_id ? { id: l.user_id, email: l.profiles?.email || '' } : null,
      action: l.event_type,
      target: l.payload?.targetUserId || l.payload?.requestId || null,
      metadata: l.payload || null,
    }));

    res.json({ items, nextCursor: null });
  } catch (err) {
    next(err);
  }
});

// 13. GET /admin/health — Operational health checks
const handleHealthCheck = async (_req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const health = await AdminService.getSystemHealth();
    const isOk = health.database.status === 'healthy' && health.mlService.status === 'healthy';
    res.json({
      status: isOk ? 'ok' : 'degraded',
      ...health,
    });
  } catch (err) {
    next(err);
  }
};

router.get('/health', handleHealthCheck);
router.get('/system/health', handleHealthCheck);

export default router;