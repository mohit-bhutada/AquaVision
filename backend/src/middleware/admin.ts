import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { AppError } from './errorHandler.js';

export interface AdminRequest extends AuthenticatedRequest {
  adminProfile?: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
  };
}

/**
 * Middleware ensuring the authenticated user possesses explicit administrative authorization.
 * Re-queries trusted database state (public.profiles.role) on every execution.
 */
export async function requireAdmin(req: AdminRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || !req.user.id) {
      logger.warn('Admin route invoked without valid user authentication context', req.id, 'AdminMiddleware');
      throw new AppError('Authentication session missing or expired', 401);
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, display_name, role, is_suspended')
      .eq('id', req.user.id)
      .single();

    if (error || !profile) {
      logger.warn(`Admin authorization check failed: Profile not found for user ${req.user.id}`, req.id, 'AdminMiddleware');
      throw new AppError('Access denied: User profile verification failed', 403);
    }

    if (profile.is_suspended) {
      logger.warn(`Suspended user ${req.user.id} attempted admin operation`, req.id, 'AdminMiddleware');
      throw new AppError('Access denied: Account is suspended', 403);
    }

    if (profile.role !== 'admin') {
      logger.warn(`Unauthorized non-admin user ${req.user.id} (${profile.email}) attempted admin endpoint access`, req.id, 'AdminMiddleware');
      throw new AppError('Access denied: Administrative privileges required', 403);
    }

    req.adminProfile = {
      id: profile.id,
      email: profile.email,
      displayName: profile.display_name,
      role: profile.role,
    };

    next();
  } catch (err) {
    next(err);
  }
}
