import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/env.js';
import { getCookieOptions } from '../lib/cookies.js';
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

interface RefreshedSession {
  accessToken: string;
  refreshToken: string;
}

// Supabase rotates refresh tokens. Parallel requests carrying the same expired access token
// must not each trigger a refresh, so in-flight and just-completed refreshes are shared briefly.
const REFRESH_SHARE_MS = 10_000;
const refreshCache = new Map<string, { promise: Promise<RefreshedSession | null>; at: number }>();

async function refreshSupabaseSession(refreshToken: string): Promise<RefreshedSession | null> {
  const now = Date.now();
  for (const [key, entry] of refreshCache) {
    if (now - entry.at > REFRESH_SHARE_MS) refreshCache.delete(key);
  }
  const existing = refreshCache.get(refreshToken);
  if (existing) return existing.promise;

  const promise = (async (): Promise<RefreshedSession | null> => {
    try {
      const res = await fetch(`${config.supabase.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          apikey: config.supabase.serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { access_token?: string; refresh_token?: string };
      if (!data.access_token || !data.refresh_token) return null;
      return { accessToken: data.access_token, refreshToken: data.refresh_token };
    } catch {
      return null;
    }
  })();

  refreshCache.set(refreshToken, { promise, at: now });
  return promise;
}

/**
 * Best-effort server-side logout. Revokes the Supabase session so the refresh token can no longer
 * mint new access tokens (otherwise the silent refresh above could quietly sign the user back in).
 * If the access token has already expired, a fresh one is minted from the refresh token first,
 * purely so that the session can be revoked. Never throws.
 */
export async function revokeSession(accessToken?: string, refreshToken?: string): Promise<void> {
  const work = (async () => {
    let tokenToRevoke = accessToken;
    if (tokenToRevoke) {
      const { error } = await supabaseAdmin.auth.admin.signOut(tokenToRevoke, 'local');
      if (!error) tokenToRevoke = undefined;
    }
    if (tokenToRevoke || (!accessToken && refreshToken)) {
      if (refreshToken) {
        const session = await refreshSupabaseSession(refreshToken);
        if (session) {
          await supabaseAdmin.auth.admin.signOut(session.accessToken, 'local');
          refreshCache.delete(session.refreshToken);
        }
      }
    }
    if (refreshToken) refreshCache.delete(refreshToken);
  })().catch((err) => {
    logger.warn(`Session revoke failed: ${(err as Error).message}`, undefined, 'AuthMiddleware');
  });
  // Never let a slow upstream hold the logout response.
  await Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, 5000))]);
  if (refreshToken) refreshCache.delete(refreshToken);
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined = req.cookies?.sb_access_token || req.headers.authorization?.replace('Bearer ', '');
    const refreshToken: string | undefined = req.cookies?.sb_refresh_token;

    let user = null;
    let lastError: string | undefined;

    if (token) {
      const result = await supabaseAdmin.auth.getUser(token);
      user = result.data?.user ?? null;
      lastError = result.error?.message;
    }

    // Access token missing or expired: transparently renew it from the refresh cookie so the
    // session lasts as long as the cookie (7 days, sliding) instead of the ~1h access-token lifetime.
    if (!user && refreshToken) {
      const session = await refreshSupabaseSession(refreshToken);
      if (session) {
        const retry = await supabaseAdmin.auth.getUser(session.accessToken);
        if (retry.data?.user) {
          user = retry.data.user;
          token = session.accessToken;
          const options = getCookieOptions();
          res.cookie('sb_access_token', session.accessToken, options);
          res.cookie('sb_refresh_token', session.refreshToken, options);
          logger.info(`Session refreshed for user ${user.id}`, req.id, 'AuthMiddleware');
        }
      }
    }

    if (!token && !user) {
      logger.warn('Authentication attempt missing session token', req.id, 'AuthMiddleware');
      throw new AppError('Authentication session missing or expired', 401, 'UNAUTHENTICATED');
    }

    if (!user) {
      logger.warn(`Invalid auth token verification attempt: ${lastError || 'User not found'}`, req.id, 'AuthMiddleware');
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