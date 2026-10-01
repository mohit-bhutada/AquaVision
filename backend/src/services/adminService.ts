import { escapeSearchTerm } from '../lib/searchTerm.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/env.js';

export interface AuditLogEntry {
  userId?: string;
  eventType: string;
  ipAddress?: string;
  userAgent?: string;
  payload?: Record<string, any>;
}

export class AdminService {
  /**
   * Helper to write structured admin action logs into public.audit_logs
   */
  static async logAdminAction(entry: AuditLogEntry): Promise<void> {
    try {
      await supabaseAdmin.from('audit_logs').insert({
        user_id: entry.userId || null,
        event_type: entry.eventType,
        ip_address: entry.ipAddress || null,
        user_agent: entry.userAgent || null,
        payload: entry.payload || {},
      });
    } catch (err: any) {
      logger.error(`Failed to record audit log (${entry.eventType}): ${err.message}`, undefined, 'AdminService');
    }
  }

  /**
   * Fetch aggregate platform metrics from real PostgreSQL tables
   */
  static async getOverviewStats() {
    // 1. Total users
    const { count: totalUsers } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // 2. Active subscriptions count
    const { count: activeSubscriptions } = await supabaseAdmin
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ACTIVE');

    // 3. Plan breakdown
    const { data: subscriptions } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_id, plans(code)');

    const planBreakdown = { FREE: 0, PRO: 0, PREMIUM: 0 };
    subscriptions?.forEach((sub: any) => {
      const code = sub.plans?.code as keyof typeof planBreakdown;
      if (code && planBreakdown[code] !== undefined) {
        planBreakdown[code]++;
      }
    });

    // 4. Total projects
    const { count: totalProjects } = await supabaseAdmin
      .from('projects')
      .select('*', { count: 'exact', head: true });

    // 5. Total completed enhancements
    const { count: totalEnhancements } = await supabaseAdmin
      .from('enhancement_operations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'COMPLETED');

    // 6. Pending upgrade requests
    const { count: pendingUpgradeRequests } = await supabaseAdmin
      .from('subscription_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'PENDING');

    // 7. Total credits consumed (negative entries in ledger)
    const { data: ledgerDeductions } = await supabaseAdmin
      .from('credit_ledger')
      .select('amount')
      .eq('transaction_type', 'DEDUCTION');

    const totalCreditsConsumed = (ledgerDeductions || []).reduce((acc, row) => acc + Math.abs(row.amount || 0), 0);

    return {
      totalUsers: totalUsers || 0,
      activeSubscriptions: activeSubscriptions || 0,
      planBreakdown,
      totalProjects: totalProjects || 0,
      totalEnhancements: totalEnhancements || 0,
      totalCreditsConsumed,
      pendingUpgradeRequests: pendingUpgradeRequests || 0,
    };
  }

  /**
   * Paginated user directory search
   */
  static async listUsers(page: number = 1, limit: number = 20, search?: string) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('profiles')
      .select(`
        id,
        email,
        display_name,
        role,
        is_suspended,
        created_at,
        subscriptions(
          status,
          plans(code, name)
        ),
        credit_balances(
          daily_base_balance,
          monthly_bonus_balance
        )
      `, { count: 'exact' });

    if (search && search.trim()) {
      const term = escapeSearchTerm(search);
      query = query.or(`email.ilike.%${term}%,display_name.ilike.%${term}%`);
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;
    if (error) {
      logger.error(`Failed to list users: ${error.message}`, undefined, 'AdminService');
      throw new Error(`Failed to query user profiles: ${error.message}`);
    }

    // Format output
    const users = (data || []).map((u: any) => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      role: u.role,
      isSuspended: !!u.is_suspended,
      createdAt: u.created_at,
      planCode: u.subscriptions?.[0]?.plans?.code || 'FREE',
      planName: u.subscriptions?.[0]?.plans?.name || 'Free Tier',
      subscriptionStatus: u.subscriptions?.[0]?.status || 'ACTIVE',
      dailyBalance: u.credit_balances?.[0]?.daily_base_balance ?? 10,
      monthlyBalance: u.credit_balances?.[0]?.monthly_bonus_balance ?? 0,
    }));

    return {
      users,
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get exhaustive user detail
   */
  static async getUserDetails(userId: string) {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select(`
        id, email, display_name, avatar_url, role, is_suspended, created_at, updated_at
      `)
      .eq('id', userId)
      .single();

    if (error || !profile) {
      throw new Error('User profile not found');
    }

    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('user_id', userId)
      .single();

    const { data: creditBalance } = await supabaseAdmin
      .from('credit_balances')
      .select('*')
      .eq('user_id', userId)
      .single();

    const { data: grants } = await supabaseAdmin
      .from('subscription_grants')
      .select('*, plans(code, name)')
      .eq('user_id', userId)
      .order('expires_at', { ascending: true });

    const { data: recentProjects } = await supabaseAdmin
      .from('projects')
      .select('id, title, processing_time_ms, credit_pool_used, is_archived, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: creditLedger } = await supabaseAdmin
      .from('credit_ledger')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    return {
      profile,
      subscription: subscription || null,
      creditBalance: creditBalance || { daily_base_balance: 10, monthly_bonus_balance: 0 },
      grants: grants || [],
      recentProjects: recentProjects || [],
      creditLedger: creditLedger || [],
    };
  }

  /**
   * Suspend or Reactivate a user account
   */
  static async updateUserStatus(
    adminId: string,
    userId: string,
    isSuspended: boolean,
    reason?: string,
    reqMeta?: { ip?: string; userAgent?: string }
  ) {
    if (adminId === userId) {
      throw new Error('An admin cannot suspend their own account.');
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ is_suspended: isSuspended, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to update user status: ${error.message}`);
    }

    const eventType = isSuspended ? 'ADMIN_USER_SUSPEND' : 'ADMIN_USER_REACTIVATE';
    await this.logAdminAction({
      userId: adminId,
      eventType,
      ipAddress: reqMeta?.ip,
      userAgent: reqMeta?.userAgent,
      payload: { targetUserId: userId, isSuspended, reason: reason || 'Admin action' },
    });

    return { success: true, userId, isSuspended };
  }

  /**
   * Update User Role (user <-> admin)
   */
  static async updateUserRole(
    adminId: string,
    userId: string,
    newRole: 'user' | 'admin',
    reqMeta?: { ip?: string; userAgent?: string }
  ) {
    if (adminId === userId && newRole !== 'admin') {
      throw new Error('An administrator cannot revoke their own admin status.');
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to update user role: ${error.message}`);
    }

    await this.logAdminAction({
      userId: adminId,
      eventType: 'ADMIN_ROLE_CHANGE',
      ipAddress: reqMeta?.ip,
      userAgent: reqMeta?.userAgent,
      payload: { targetUserId: userId, newRole },
    });

    return { success: true, userId, newRole };
  }

  /**
   * List subscriptions & pending upgrade requests
   */
  static async listSubscriptions(page: number = 1, limit: number = 20) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Active subscriptions query
    const { data: subscriptions, count: subCount } = await supabaseAdmin
      .from('subscriptions')
      .select('*, profiles(id, email, display_name), plans(code, name, price_inr)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    // Pending requests query
    const { data: pendingRequests } = await supabaseAdmin
      .from('subscription_requests')
      .select('*, profiles(id, email, display_name), plans:requested_plan_id(code, name)')
      .order('requested_at', { ascending: false });

    return {
      subscriptions: subscriptions || [],
      pendingRequests: pendingRequests || [],
      pagination: {
        total: subCount || 0,
        page,
        limit,
        totalPages: Math.ceil((subCount || 0) / limit),
      },
    };
  }

  /**
   * Approve or Reject a subscription upgrade request
   */
  static async reviewSubscriptionRequest(
    adminId: string,
    requestId: string,
    action: 'APPROVE' | 'REJECT',
    reqMeta?: { ip?: string; userAgent?: string }
  ) {
    // 1. Fetch request
    const { data: request, error: fetchErr } = await supabaseAdmin
      .from('subscription_requests')
      .select('*, plans:requested_plan_id(code)')
      .eq('id', requestId)
      .single();

    if (fetchErr || !request) {
      throw new Error('Subscription request not found.');
    }

    if (request.status !== 'PENDING') {
      throw new Error(`Request has already been ${request.status.toLowerCase()}.`);
    }

    const planCode = request.plans?.code;
    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    // 2. Atomically CLAIM the request (compare-and-set on status). Only one concurrent reviewer
    //    can win this update, which prevents duplicate activations / double credit grants.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('subscription_requests')
      .update({
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminId,
      })
      .eq('id', requestId)
      .eq('status', 'PENDING')
      .select('id')
      .maybeSingle();

    if (claimErr) {
      throw new Error(`Failed to update request state: ${claimErr.message}`);
    }
    if (!claimed) {
      throw new Error('Request has already been reviewed.');
    }

    // 3. If approved, activate the plan via the stored function. On failure, release the claim
    //    so the request can be retried instead of being stuck APPROVED without a grant.
    if (action === 'APPROVE') {
      const { error: rpcErr } = await supabaseAdmin.rpc('activate_user_subscription', {
        p_user_id: request.user_id,
        p_plan_code: planCode,
      });

      if (rpcErr) {
        await supabaseAdmin
          .from('subscription_requests')
          .update({ status: 'PENDING', reviewed_at: null, reviewed_by: null })
          .eq('id', requestId)
          .eq('status', newStatus);
        throw new Error(`Failed to activate subscription plan: ${rpcErr.message}`);
      }
    }

    const eventType = action === 'APPROVE' ? 'ADMIN_SUBSCRIPTION_APPROVE' : 'ADMIN_SUBSCRIPTION_REJECT';
    await this.logAdminAction({
      userId: adminId,
      eventType,
      ipAddress: reqMeta?.ip,
      userAgent: reqMeta?.userAgent,
      payload: { requestId, targetUserId: request.user_id, planCode, action },
    });

    return { success: true, requestId, status: newStatus };
  }

  /**
   * List credits & recent ledger activity
   */
  static async listCredits(page: number = 1, limit: number = 20) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: creditBalances, count } = await supabaseAdmin
      .from('credit_balances')
      .select('*, profiles(id, email, display_name)', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(from, to);

    const { data: recentLedger } = await supabaseAdmin
      .from('credit_ledger')
      .select('*, profiles(id, email)')
      .order('created_at', { ascending: false })
      .limit(30);

    return {
      creditBalances: creditBalances || [],
      recentLedger: recentLedger || [],
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Manual admin credit adjustment
   */
  static async adjustUserCredits(
    adminId: string,
    userId: string,
    amount: number,
    poolType: 'DAILY_BASE' | 'MONTHLY_BONUS',
    reason: string,
    reqMeta?: { ip?: string; userAgent?: string }
  ) {
    if (!amount || amount === 0) {
      throw new Error('Adjustment amount must be a non-zero integer.');
    }
    if (!reason || !reason.trim()) {
      throw new Error('An administrative justification reason is required.');
    }

    // Lock and get current balance
    const { data: currentBal, error: fetchErr } = await supabaseAdmin
      .from('credit_balances')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchErr || !currentBal) {
      throw new Error('Target user credit balance record not found.');
    }

    let newDaily = currentBal.daily_base_balance;
    let newMonthly = currentBal.monthly_bonus_balance;

    if (poolType === 'DAILY_BASE') {
      newDaily = Math.max(0, newDaily + amount);
    } else {
      newMonthly = Math.max(0, newMonthly + amount);
    }

    // Update balances
    const { error: updateErr } = await supabaseAdmin
      .from('credit_balances')
      .update({
        daily_base_balance: newDaily,
        monthly_bonus_balance: newMonthly,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateErr) {
      throw new Error(`Failed to adjust balance: ${updateErr.message}`);
    }

    // Insert ledger record
    await supabaseAdmin.from('credit_ledger').insert({
      user_id: userId,
      amount,
      pool_type: poolType,
      transaction_type: 'ADMIN_ADJUSTMENT',
      description: `Admin adjustment by ${adminId}: ${reason.trim()}`,
    });

    // Record audit log
    await this.logAdminAction({
      userId: adminId,
      eventType: 'ADMIN_CREDIT_ADJUSTMENT',
      ipAddress: reqMeta?.ip,
      userAgent: reqMeta?.userAgent,
      payload: { targetUserId: userId, amount, poolType, reason },
    });

    return { success: true, userId, newDaily, newMonthly };
  }

  /**
   * List projects metadata for management
   */
  static async listProjects(page: number = 1, limit: number = 20, search?: string) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('projects')
      .select('*, profiles(id, email, display_name)', { count: 'exact' });

    if (search && search.trim()) {
      query = query.ilike('title', `%${escapeSearchTerm(search)}%`);
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;
    if (error) {
      throw new Error(`Failed to query projects: ${error.message}`);
    }

    return {
      projects: data || [],
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Query Audit Logs
   */
  static async getAuditLogs(page: number = 1, limit: number = 20, eventType?: string) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('audit_logs')
      .select('*, profiles(id, email, display_name)', { count: 'exact' });

    if (eventType && eventType.trim()) {
      query = query.eq('event_type', eventType.trim());
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;
    if (error) {
      throw new Error(`Failed to query audit logs: ${error.message}`);
    }

    return {
      logs: data || [],
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Real System Operational Health Checks
   */
  static async getSystemHealth() {
    const healthStatus: Record<string, any> = {
      timestamp: new Date().toISOString(),
      backend: { status: 'healthy', port: config.port },
      database: { status: 'unknown' },
      storage: { status: 'unknown' },
      mlService: { status: 'unknown' },
    };

    // 1. PostgreSQL DB Health
    try {
      const { error } = await supabaseAdmin.from('plans').select('id').limit(1);
      healthStatus.database = {
        status: error ? 'unhealthy' : 'healthy',
        error: error ? error.message : null,
      };
    } catch (err: any) {
      healthStatus.database = { status: 'unhealthy', error: err.message };
    }

    // 2. Storage Health
    try {
      const { data, error } = await supabaseAdmin.storage.listBuckets();
      const hasEnhancedFiles = data?.some((b) => b.name === 'Enhanced Files');
      healthStatus.storage = {
        status: error ? 'unhealthy' : hasEnhancedFiles ? 'healthy' : 'degraded',
        bucketPresent: hasEnhancedFiles,
        error: error ? error.message : null,
      };
    } catch (err: any) {
      healthStatus.storage = { status: 'unhealthy', error: err.message };
    }

    // 3. ML Service Health
    try {
      const mlResponse = await fetch(`${config.mlServiceUrl}/health`, { method: 'GET' });
      if (mlResponse.ok) {
        const mlData = await mlResponse.json();
        healthStatus.mlService = {
          status: 'healthy',
          device: mlData.device || 'unknown',
          modelLoaded: mlData.model_loaded,
          epoch: mlData.epoch,
        };
      } else {
        healthStatus.mlService = {
          status: 'degraded',
          statusCode: mlResponse.status,
        };
      }
    } catch (err: any) {
      healthStatus.mlService = {
        status: 'unhealthy',
        error: 'ML service unreachable at ' + config.mlServiceUrl,
      };
    }

    return healthStatus;
  }
}
