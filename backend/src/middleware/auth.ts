import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { AppError } from './errorHandler.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
    isSuspended?: boolean;
  };
  id?: string;
}

export async function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.sb_access_token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      logger.warn('Authentication attempt missing session token', req.id, 'AuthMiddleware');
      throw new AppError('Authentication session missing or expired', 401, 'UNAUTHENTICATED');
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      logger.warn(`Invalid auth token verification attempt: ${error?.message || 'User not found'}`, req.id, 'AuthMiddleware');
      throw new AppError('Invalid or expired auth session', 401, 'UNAUTHENTICATED');
    }

    // Check profile suspension
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, is_suspended')
      .eq('id', user.id)
      .single();

    if (profile?.is_suspended) {
      logger.warn(`Suspended user ${user.id} attempted request to ${req.path}`, req.id, 'AuthMiddleware');
      throw new AppError('Your account has been suspended by an administrator.', 403, 'ACCOUNT_SUSPENDED');
    }

    req.user = {
      id: user.id,
      email: user.email || '',
      role: profile?.role || 'user',
      isSuspended: !!profile?.is_suspended,
    };

    next();
  } catch (err) {
    next(err);
  }
}
