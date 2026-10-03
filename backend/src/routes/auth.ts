import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest, revokeSession } from '../middleware/auth.js';
import { supabaseAdmin, createAuthClient } from '../lib/supabase.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';
import { config } from '../config/env.js';
import { getCookieOptions } from '../lib/cookies.js';
import { logger } from '../lib/logger.js';
import { checkLoginLock, recordFailedLogin, recordSuccessfulLogin } from '../middleware/loginLockout.js';
import {
  createSignupTransaction,
  createPasswordResetTransaction,
  getTransactionByRawToken,
  verifyOtpCode,
  resendOtp,
  resetPasswordWithToken,
} from '../services/otpService.js';

const router = Router();

const authRateLimiter = createRateLimiter('auth-endpoints', {
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
  message: 'Too many authentication attempts. Please try again later.',
});

router.use(authRateLimiter);



export function formatUserResponse(profile: any, authUser?: any) {
  return {
    id: profile.id,
    name: profile.display_name || (profile.email ? String(profile.email).split('@')[0] : null),
    email: profile.email,
    avatarUrl: profile.avatar_url || null,
    role: (profile.role || 'user').toUpperCase() as 'USER' | 'ADMIN',
    status: (profile.is_suspended ? 'SUSPENDED' : 'ACTIVE') as 'ACTIVE' | 'SUSPENDED',
    emailVerified: authUser ? !!authUser.email_confirmed_at : true,
    createdAt: profile.created_at || new Date().toISOString(),
  };
}

async function fetchProfile(userId: string) {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, display_name, avatar_url, role, is_suspended, created_at')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    throw new AppError('User profile not found', 404, 'NOT_FOUND');
  }

  return profile;
}

// POST /auth/signup
router.post('/signup', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, email, password } = req.body || {};
    if (!email || !password) {
      throw new AppError('Email and password are required', 400, 'VALIDATION_ERROR');
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      throw new AppError('Password must be at least 8 characters long and contain both letters and numbers', 400, 'VALIDATION_ERROR');
    }

    // Differentiate verified vs unverified duplicate account
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', normalizedEmail)
      .single();

    let userId: string | undefined;

    if (existingProfile) {
      const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(existingProfile.id);
      if (authUser?.email_confirmed_at) {
        throw new AppError('An account with this email address already exists.', 409, 'EMAIL_TAKEN');
      }
      // Unverified account re-registering: update password and metadata
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(existingProfile.id, {
        password,
        user_metadata: { full_name: name || undefined },
      });
      if (updateErr) {
        logger.error(`Failed to update unverified user ${existingProfile.id}: ${updateErr.message}`, req.id, 'AuthRoutes');
        throw new AppError('Failed to create account.', 500, 'INTERNAL');
      }
      userId = existingProfile.id;
    } else {
      // Create user server-side in Supabase Admin WITHOUT sending Supabase confirmation email
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: false,
        user_metadata: {
          full_name: name || undefined,
        },
      });

      if (error) {
        if (error.message.includes('already') || error.status === 422) {
          throw new AppError('An account with this email address already exists.', 409, 'EMAIL_TAKEN');
        }
        throw new AppError(error.message, 400, 'VALIDATION_ERROR');
      }
      userId = data.user?.id;
    }

    const { rawToken } = await createSignupTransaction(normalizedEmail, userId);

    logger.info(`User signup initiated for ${normalizedEmail}`, req.id, 'AuthRoutes');
    res.status(201).json({ ok: true, verificationToken: rawToken });
  } catch (err) {
    next(err);
  }
});

// GET /auth/verify-token/:token
router.get('/verify-token/:token', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.params.token as string;
    const result = await getTransactionByRawToken(token);
    if (!result.valid || !result.transaction) {
      res.json({ valid: false });
      return;
    }
    res.json({
      valid: true,
      purpose: result.transaction.purpose,
      status: result.transaction.status,
      email: result.transaction.email,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/verify-otp
router.post('/verify-otp', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { verificationToken, otp } = req.body || {};
    if (!verificationToken || !otp) {
      throw new AppError('Verification token and code are required', 400, 'VALIDATION_ERROR');
    }

    const result = await verifyOtpCode(verificationToken.trim(), otp.trim());

    if (result.purpose === 'SIGNUP') {
      let authUserObj: any = null;

      // Establish real authenticated backend session via Supabase Admin magiclink exchange (no plaintext password required)
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: result.email,
      });

      if (linkData?.properties?.hashed_token) {
        const { data: sessionData } = await createAuthClient().auth.verifyOtp({
          token_hash: linkData.properties.hashed_token,
          type: 'magiclink',
        });

        if (sessionData?.session) {
          res.cookie('sb_access_token', sessionData.session.access_token, getCookieOptions());
          if (sessionData.session.refresh_token) {
            res.cookie('sb_refresh_token', sessionData.session.refresh_token, getCookieOptions());
          }
          authUserObj = sessionData.user;
        }
      }

      if (result.userId) {
        const profile = await fetchProfile(result.userId);
        res.json({ status: 'ok', purpose: 'SIGNUP', user: formatUserResponse(profile, authUserObj) });
        return;
      }
      res.json({ status: 'ok', purpose: 'SIGNUP' });
      return;
    }

    res.json({ status: 'ok', purpose: 'PASSWORD_RESET', verificationStatus: 'OTP_VERIFIED' });
  } catch (err) {
    next(err);
  }
});

// POST /auth/resend-otp
router.post('/resend-otp', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { verificationToken } = req.body || {};
    if (!verificationToken) {
      throw new AppError('Verification token is required', 400, 'VALIDATION_ERROR');
    }

    const result = await resendOtp(verificationToken.trim());
    res.json({ ok: true, expiresAt: result.expiresAt });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post('/login', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      throw new AppError('Email and password are required', 400, 'VALIDATION_ERROR');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Enforce account lockout before password attempt
    checkLoginLock(normalizedEmail);

    const { data, error } = await createAuthClient().auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    // Handle case where Supabase returns an unconfirmed email error for valid credentials
    if (error && (error.message?.toLowerCase().includes('email not confirmed') || (error as any).code === 'email_not_confirmed')) {
      recordSuccessfulLogin(normalizedEmail);

      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .single();

      const userId = existingProfile?.id;
      const { rawToken } = await createSignupTransaction(normalizedEmail, userId);

      res.status(403).json({
        ok: false,
        requiresVerification: true,
        verificationToken: rawToken,
        error: {
          message: "Your account isn't verified yet. We've sent a verification code to your email. Verify your account to continue.",
          code: 'EMAIL_NOT_VERIFIED',
          verificationToken: rawToken,
          requiresVerification: true,
        },
      });
      return;
    }

    if (error || !data.user) {
      throw recordFailedLogin(normalizedEmail);
    }

    // Check if account email is verified
    if (!data.user.email_confirmed_at) {
      recordSuccessfulLogin(normalizedEmail);

      const { rawToken } = await createSignupTransaction(normalizedEmail, data.user.id);

      res.status(403).json({
        ok: false,
        requiresVerification: true,
        verificationToken: rawToken,
        error: {
          message: "Your account isn't verified yet. We've sent a verification code to your email. Verify your account to continue.",
          code: 'EMAIL_NOT_VERIFIED',
          verificationToken: rawToken,
          requiresVerification: true,
        },
      });
      return;
    }

    if (!data.session) {
      throw recordFailedLogin(normalizedEmail);
    }

    const profile = await fetchProfile(data.user.id);
    if (profile.is_suspended) {
      throw new AppError('Your account has been suspended by an administrator.', 403, 'ACCOUNT_SUSPENDED');
    }

    recordSuccessfulLogin(normalizedEmail);

    res.cookie('sb_access_token', data.session.access_token, getCookieOptions());
    if (data.session.refresh_token) {
      res.cookie('sb_refresh_token', data.session.refresh_token, getCookieOptions());
    }

    logger.info(`User logged in: ${normalizedEmail}`, req.id, 'AuthRoutes');
    res.json(formatUserResponse(profile, data.user));
  } catch (err) {
    next(err);
  }
});

// POST /auth/session - Backwards compatibility for posting session tokens
router.post('/session', (req: AuthenticatedRequest, res: Response) => {
  const { accessToken, refreshToken } = req.body || {};
  if (accessToken) {
    res.cookie('sb_access_token', accessToken, getCookieOptions());
  }
  if (refreshToken) {
    res.cookie('sb_refresh_token', refreshToken, getCookieOptions());
  }
  res.json({ status: 'ok', message: 'HTTP-only session established' });
});

// POST /auth/logout
router.post('/logout', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const accessToken: string | undefined = req.cookies?.sb_access_token;
    const refreshToken: string | undefined = req.cookies?.sb_refresh_token;

    // Delete the cookies with the SAME attributes they were set with. A cookie set with
    // SameSite=None; Secure is not reliably removed by a deletion that omits those attributes,
    // which made logout silently fail when the API is on a different site than the frontend.
    const { maxAge: _maxAge, ...clearOptions } = getCookieOptions();
    res.clearCookie('sb_access_token', clearOptions);
    res.clearCookie('sb_refresh_token', clearOptions);

    // Revoke the session server-side so a refresh token (or a request still in flight) cannot
    // sign the user straight back in.
    await revokeSession(accessToken, refreshToken);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /auth/me - Session Restoration
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const profile = await fetchProfile(req.user!.id);
    res.json(formatUserResponse(profile));
  } catch (err) {
    next(err);
  }
});

// POST /auth/forgot-password
router.post('/forgot-password', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body || {};
    if (!email || !email.trim()) {
      throw new AppError('Email is required', 400, 'VALIDATION_ERROR');
    }

    const result = await createPasswordResetTransaction(email.trim());
    res.json({
      ok: true,
      message: 'If an account exists for this email address, a verification code has been sent.',
      verificationToken: result.rawToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/reset-password
router.post('/reset-password', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { verificationToken, password } = req.body || {};
    if (!verificationToken || !password) {
      throw new AppError('Verification token and new password are required', 400, 'VALIDATION_ERROR');
    }

    await resetPasswordWithToken(verificationToken.trim(), password);
    res.json({ ok: true, message: 'Password updated successfully. Please log in with your new password.' });
  } catch (err) {
    next(err);
  }
});

import crypto from 'crypto';

export function safeNextPath(next?: string | null): string {
  if (!next || typeof next !== 'string') return '/workspace';
  const trimmed = next.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\') && !/^\/[a-zA-Z0-9_-]+:/.test(trimmed)) {
    return trimmed;
  }
  return '/workspace';
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// GET /auth/google - Initiate Google OAuth Flow with PKCE
router.get('/google', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const nextPath = safeNextPath(req.query.next as string);
    const hostHeader = (req.get('x-forwarded-host') || req.get('host') || 'localhost:4000').split(',')[0].trim();
    const isLocal = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1');
    const forwardedProto = req.get('x-forwarded-proto');
    const protocol = isLocal ? 'http' : (typeof forwardedProto === 'string' ? forwardedProto.split(',')[0].trim() : 'https');

    // 1. Generate PKCE verifier and challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // 2. Save PKCE verifier in HTTP-only cookie
    res.cookie('sb_code_verifier', codeVerifier, {
      httpOnly: true,
      secure: config.env === 'production' || !isLocal,
      sameSite: (config.env === 'production' || !isLocal ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
      maxAge: 10 * 60 * 1000, // 10 minutes
    });

    // 3. Construct backend callback URL that Supabase will redirect to after Google auth
    const callbackUrl = `${protocol}://${hostHeader}/api/v1/auth/callback?next=${encodeURIComponent(nextPath)}`;

    // 4. Initiate Supabase OAuth with PKCE code_challenge
    const { data, error } = await createAuthClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
        queryParams: {
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          // Always show Google's account chooser, so signing out of AquaVision and clicking
          // "Continue with Google" again does not silently reuse the last Google account.
          prompt: 'select_account',
        },
      },
    });

    if (error || !data.url) {
      logger.error(`Failed to initiate Google OAuth: ${error?.message}`, req.id, 'AuthRoutes');
      throw new AppError('Failed to initiate Google authentication', 500, 'INTERNAL');
    }

    res.redirect(data.url);
  } catch (err) {
    next(err);
  }
});

// GET /auth/callback - Handle PKCE OAuth Callback from Supabase/Google
router.get('/callback', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const nextPath = safeNextPath(req.query.next as string);
    const host = req.get('host') || 'localhost:4000';
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const frontendOrigin = isLocal ? (req.headers.origin || 'http://localhost:5173') : config.corsOrigin;

    // Extract PKCE verifier from cookie and clear cookie
    const codeVerifier = req.cookies?.sb_code_verifier as string | undefined;
    res.clearCookie('sb_code_verifier', { path: '/' });

    // Check for error parameters from OAuth provider or Supabase
    const oauthError = req.query.error || req.query.error_description;
    if (oauthError) {
      logger.warn(`Google OAuth error reported in callback: ${oauthError}`, req.id, 'AuthRoutes');
      const errorMsg = encodeURIComponent(String(oauthError));
      return res.redirect(`${frontendOrigin}/login?error=${errorMsg}`);
    }

    const code = req.query.code as string | undefined;

    if (!code || !codeVerifier) {
      const missingReason = !code ? 'Missing authorization code' : 'Missing PKCE code verifier';
      logger.warn(`Google OAuth callback failed: ${missingReason}`, req.id, 'AuthRoutes');
      return res.redirect(`${frontendOrigin}/login?error=${encodeURIComponent(missingReason)}`);
    }

    // Exchange PKCE authorization code + code verifier for Supabase session via REST token endpoint
    const tokenRes = await fetch(`${config.supabase.url}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        'apikey': config.supabase.serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_code: code,
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenRes.json() as any;

    if (!tokenRes.ok || !tokenData?.access_token || !tokenData?.user) {
      const errDetail = tokenData?.msg || tokenData?.error_description || 'Invalid PKCE authorization code or verifier';
      logger.error(`PKCE code exchange failed (${tokenRes.status}): ${errDetail}`, req.id, 'AuthRoutes');
      return res.redirect(`${frontendOrigin}/login?error=Authentication%20failed`);
    }

    const authUser = tokenData.user;

    // Check profile suspension
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, role, is_suspended, display_name')
      .eq('id', authUser.id)
      .single();

    const oauthName: string =
      authUser.user_metadata?.full_name ||
      authUser.user_metadata?.name ||
      (authUser.email ? String(authUser.email).split('@')[0] : '');

    if (profile?.is_suspended) {
      logger.warn(`Suspended user ${authUser.id} attempted Google OAuth login`, req.id, 'AuthRoutes');
      return res.redirect(`${frontendOrigin}/login?error=Account%20suspended`);
    }

    // Ensure user profile exists in database
    if (!profile) {
      const { error: insertErr } = await supabaseAdmin.from('profiles').insert({
        id: authUser.id,
        email: authUser.email,
        display_name: oauthName || null,
        avatar_url: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null,
        role: 'user',
        is_suspended: false,
      });

      if (insertErr) {
        logger.error(`Failed to create profile for OAuth user ${authUser.id}: ${insertErr.message}`, req.id, 'AuthRoutes');
      }
    }

    // Existing profile without a name (e.g. created before the name was known): fill it in.
    if (profile && !profile.display_name && oauthName) {
      await supabaseAdmin.from('profiles').update({ display_name: oauthName }).eq('id', authUser.id);
    }

    // Set HTTP-only, Secure session cookies
    res.cookie('sb_access_token', tokenData.access_token, getCookieOptions());
    if (tokenData.refresh_token) {
      res.cookie('sb_refresh_token', tokenData.refresh_token, getCookieOptions());
    }

    logger.info(`User authenticated via Google OAuth (PKCE): ${authUser.email}`, req.id, 'AuthRoutes');

    // Redirect browser DIRECTLY to authenticated target path (e.g., /workspace)
    res.redirect(`${frontendOrigin}${nextPath}`);
  } catch (err) {
    next(err);
  }
});

export default router;