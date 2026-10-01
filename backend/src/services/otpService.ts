import { supabaseAdmin } from '../lib/supabase.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../lib/logger.js';
import {
  generateVerificationToken,
  hashVerificationToken,
  generateOtp,
  generateSalt,
  hashOtp,
  verifyOtpHash,
} from '../lib/otp.js';
import { sendSignupOtp, sendPasswordResetOtp } from '../lib/email.js';

export interface OtpTransaction {
  id: string;
  user_id: string | null;
  email: string;
  purpose: 'SIGNUP' | 'PASSWORD_RESET';
  verification_token_hash: string;
  otp_hash: string;
  otp_salt: string;
  otp_attempts: number;
  max_otp_attempts: number;
  last_sent_at: string;
  expires_at: string;
  locked_until: string | null;
  requested_ist_date: string;
  status: 'PENDING' | 'OTP_VERIFIED' | 'CONSUMED' | 'EXPIRED' | 'LOCKED';
  verified_at: string | null;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function getTodayIstDateString(dateObj = new Date()): string {
  return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

async function checkActiveOtpLockout(email: string) {
  const normalized = email.trim().toLowerCase();
  const nowIso = new Date().toISOString();
  const { data: locked } = await supabaseAdmin
    .from('auth_otp_verifications')
    .select('id, locked_until')
    .eq('email', normalized)
    .eq('status', 'LOCKED')
    .gt('locked_until', nowIso)
    .limit(1)
    .single();

  if (locked) {
    throw new AppError('Too many failed verification attempts. Please try again later.', 423, 'OTP_LOCKED');
  }
}

export async function createSignupTransaction(email: string, userId?: string) {
  const normalizedEmail = email.trim().toLowerCase();

  await checkActiveOtpLockout(normalizedEmail);

  const rawToken = generateVerificationToken();
  const tokenHash = hashVerificationToken(rawToken);
  const otp = generateOtp();
  const salt = generateSalt();
  const otpHash = hashOtp(otp, salt);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.otp.expirySeconds * 1000).toISOString();
  const todayIst = getTodayIstDateString(now);

  const { error } = await supabaseAdmin.from('auth_otp_verifications').insert({
    user_id: userId || null,
    email: normalizedEmail,
    purpose: 'SIGNUP',
    verification_token_hash: tokenHash,
    otp_hash: otpHash,
    otp_salt: salt,
    otp_attempts: 0,
    max_otp_attempts: config.otp.maxAttempts,
    last_sent_at: now.toISOString(),
    expires_at: expiresAt,
    requested_ist_date: todayIst,
    status: 'PENDING',
  });

  if (error) {
    logger.error(`Failed to insert signup OTP verification: ${error.message}`, undefined, 'OtpService');
    throw new AppError('Failed to create verification session.', 500, 'INTERNAL');
  }

  try {
    await sendSignupOtp(normalizedEmail, otp);
  } catch (sendErr) {
    await supabaseAdmin.from('auth_otp_verifications').delete().eq('verification_token_hash', tokenHash);
    throw sendErr;
  }

  return { rawToken, expiresAt };
}

export async function createPasswordResetTransaction(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  await checkActiveOtpLockout(normalizedEmail);

  // Query user profile by email to verify account existence
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, email')
    .eq('email', normalizedEmail)
    .single();

  if (!profile) {
    // Return dummy rawToken so caller gets uniform response format without revealing email non-existence
    return { rawToken: generateVerificationToken(), exists: false };
  }

  const todayIst = getTodayIstDateString();

  // Enforce FORGOT_PASSWORD_DAILY_LIMIT (1 request per IST day)
  const { data: existingDaily } = await supabaseAdmin
    .from('auth_otp_verifications')
    .select('id, verification_token_hash, status, expires_at')
    .eq('email', normalizedEmail)
    .eq('purpose', 'PASSWORD_RESET')
    .eq('requested_ist_date', todayIst)
    .single();

  if (existingDaily) {
    // User has already used their 1 Forgot Password request for today
    return { rawToken: generateVerificationToken(), exists: true, limitReached: true };
  }

  const rawToken = generateVerificationToken();
  const tokenHash = hashVerificationToken(rawToken);
  const otp = generateOtp();
  const salt = generateSalt();
  const otpHash = hashOtp(otp, salt);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.otp.expirySeconds * 1000).toISOString();

  const { error } = await supabaseAdmin.from('auth_otp_verifications').insert({
    user_id: profile.id,
    email: normalizedEmail,
    purpose: 'PASSWORD_RESET',
    verification_token_hash: tokenHash,
    otp_hash: otpHash,
    otp_salt: salt,
    otp_attempts: 0,
    max_otp_attempts: config.otp.maxAttempts,
    last_sent_at: now.toISOString(),
    expires_at: expiresAt,
    requested_ist_date: todayIst,
    status: 'PENDING',
  });

  if (error) {
    if (error.message?.includes('unique') || error.code === '23505') {
      return { rawToken: generateVerificationToken(), exists: true, limitReached: true };
    }
    logger.error(`Failed to insert password reset OTP verification: ${error.message}`, undefined, 'OtpService');
    throw new AppError('Failed to create password reset session.', 500, 'INTERNAL');
  }

  try {
    await sendPasswordResetOtp(normalizedEmail, otp);
  } catch (sendErr) {
    await supabaseAdmin.from('auth_otp_verifications').delete().eq('verification_token_hash', tokenHash);
    throw sendErr;
  }

  return { rawToken, exists: true, expiresAt };
}

export async function getTransactionByRawToken(rawToken: string): Promise<{
  valid: boolean;
  isLocked?: boolean;
  lockedUntil?: string | null;
  transaction?: OtpTransaction;
}> {
  if (!rawToken || typeof rawToken !== 'string') {
    return { valid: false };
  }

  const tokenHash = hashVerificationToken(rawToken);
  const { data: tx, error } = await supabaseAdmin
    .from('auth_otp_verifications')
    .select('*')
    .eq('verification_token_hash', tokenHash)
    .single();

  if (error || !tx) {
    return { valid: false };
  }

  const now = new Date();

  // Check OTP 1-hour Lockout
  if (tx.status === 'LOCKED' || (tx.locked_until && new Date(tx.locked_until) > now)) {
    if (tx.locked_until && now >= new Date(tx.locked_until)) {
      // Lock duration expired -> transition to EXPIRED so old token cannot be reused
      await supabaseAdmin
        .from('auth_otp_verifications')
        .update({ status: 'EXPIRED', updated_at: now.toISOString() })
        .eq('id', tx.id);
      return { valid: false };
    }
    return { valid: false, isLocked: true, lockedUntil: tx.locked_until, transaction: tx as OtpTransaction };
  }

  const expiresAt = new Date(tx.expires_at);

  if (tx.consumed_at || tx.status === 'CONSUMED' || tx.status === 'EXPIRED') {
    return { valid: false };
  }

  if (now >= expiresAt) {
    await supabaseAdmin
      .from('auth_otp_verifications')
      .update({ status: 'EXPIRED', updated_at: now.toISOString() })
      .eq('id', tx.id);
    return { valid: false };
  }

  return { valid: true, transaction: tx as OtpTransaction };
}

export async function verifyOtpCode(rawToken: string, userOtp: string) {
  const { valid, isLocked, transaction: tx } = await getTransactionByRawToken(rawToken);

  if (isLocked) {
    throw new AppError('Too many failed verification attempts. Your session is locked for 1 hour.', 423, 'OTP_LOCKED');
  }

  if (!valid || !tx) {
    throw new AppError("You're on the wrong page. Please go to Home.", 404, 'NOT_FOUND');
  }

  if (tx.status !== 'PENDING') {
    throw new AppError('Invalid or expired verification session.', 400, 'OTP_INVALID');
  }

  const now = new Date();
  const isMatch = verifyOtpHash(userOtp, tx.otp_salt, tx.otp_hash);

  if (!isMatch) {
    const newAttempts = tx.otp_attempts + 1;
    const isNowLocked = newAttempts >= tx.max_otp_attempts;

    if (isNowLocked) {
      // 5th failed OTP attempt -> ATOMIC LOCKOUT (1 HOUR)
      const lockoutUntil = new Date(now.getTime() + config.otp.lockoutSeconds * 1000).toISOString();
      const { data: lockedRecord } = await supabaseAdmin
        .from('auth_otp_verifications')
        .update({
          otp_attempts: newAttempts,
          status: 'LOCKED',
          locked_until: lockoutUntil,
          updated_at: now.toISOString(),
        })
        .eq('id', tx.id)
        .eq('status', 'PENDING')
        .select()
        .single();

      throw new AppError('Too many failed verification attempts. Your session is locked for 1 hour.', 423, 'OTP_LOCKED');
    }

    await supabaseAdmin
      .from('auth_otp_verifications')
      .update({
        otp_attempts: newAttempts,
        status: 'PENDING',
        updated_at: now.toISOString(),
      })
      .eq('id', tx.id);

    throw new AppError('Invalid verification code.', 400, 'OTP_INVALID');
  }

  // ATOMIC DATABASE LEVEL TRANSITION TO PREVENT CONCURRENCY RACES & TOKEN REPLAY
  const nextStatus = tx.purpose === 'SIGNUP' ? 'CONSUMED' : 'OTP_VERIFIED';
  const { data: transitionRecord, error: transitionErr } = await supabaseAdmin
    .from('auth_otp_verifications')
    .update({
      status: nextStatus,
      verified_at: now.toISOString(),
      consumed_at: tx.purpose === 'SIGNUP' ? now.toISOString() : null,
      updated_at: now.toISOString(),
    })
    .eq('id', tx.id)
    .eq('status', 'PENDING')
    .gt('expires_at', now.toISOString())
    .select()
    .single();

  if (transitionErr || !transitionRecord) {
    throw new AppError('Verification session has already been used or expired.', 400, 'OTP_INVALID');
  }

  if (tx.purpose === 'SIGNUP') {
    if (tx.user_id) {
      await supabaseAdmin.auth.admin.updateUserById(tx.user_id, {
        email_confirm: true,
      });
    }
    return { purpose: 'SIGNUP' as const, userId: tx.user_id, email: tx.email, status: 'CONSUMED' as const };
  }

  return { purpose: 'PASSWORD_RESET' as const, userId: tx.user_id, email: tx.email, status: 'OTP_VERIFIED' as const };
}

export async function resendOtp(rawToken: string) {
  const { valid, isLocked, transaction: tx } = await getTransactionByRawToken(rawToken);

  if (isLocked) {
    throw new AppError('Too many failed verification attempts. Please try again later.', 423, 'OTP_LOCKED');
  }

  if (!valid || !tx) {
    throw new AppError("You're on the wrong page. Please go to Home.", 404, 'NOT_FOUND');
  }

  if (tx.status !== 'PENDING') {
    throw new AppError('Verification code resend is no longer available for this session.', 400, 'INVALID_STATE');
  }

  const now = new Date();
  const lastSent = new Date(tx.last_sent_at);
  const elapsedSec = Math.floor((now.getTime() - lastSent.getTime()) / 1000);

  if (elapsedSec < config.otp.resendCooldownSeconds) {
    const remainingSec = config.otp.resendCooldownSeconds - elapsedSec;
    throw new AppError(`Please wait ${remainingSec} seconds before requesting a new code.`, 429, 'RATE_LIMITED');
  }

  const newOtp = generateOtp();
  const newSalt = generateSalt();
  const newOtpHash = hashOtp(newOtp, newSalt);
  const newExpiresAt = new Date(now.getTime() + config.otp.expirySeconds * 1000).toISOString();

  const { data: resendRecord, error } = await supabaseAdmin
    .from('auth_otp_verifications')
    .update({
      otp_hash: newOtpHash,
      otp_salt: newSalt,
      otp_attempts: 0,
      last_sent_at: now.toISOString(),
      expires_at: newExpiresAt,
      updated_at: now.toISOString(),
    })
    .eq('id', tx.id)
    .eq('status', 'PENDING')
    .gt('expires_at', now.toISOString())
    .select()
    .single();

  if (error || !resendRecord) {
    throw new AppError('Failed to resend verification code.', 500, 'INTERNAL');
  }

  if (tx.purpose === 'SIGNUP') {
    await sendSignupOtp(tx.email, newOtp);
  } else {
    await sendPasswordResetOtp(tx.email, newOtp);
  }

  return { ok: true, expiresAt: newExpiresAt };
}

export async function resetPasswordWithToken(rawToken: string, newPassword: string) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new AppError("You're on the wrong page. Please go to Home.", 404, 'NOT_FOUND');
  }

  if (!newPassword || newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    throw new AppError('Password must be at least 8 characters long and contain both letters and numbers', 400, 'VALIDATION_ERROR');
  }

  const tokenHash = hashVerificationToken(rawToken);
  const { data: tx, error } = await supabaseAdmin
    .from('auth_otp_verifications')
    .select('*')
    .eq('verification_token_hash', tokenHash)
    .single();

  if (error || !tx) {
    throw new AppError("You're on the wrong page. Please go to Home.", 404, 'NOT_FOUND');
  }

  const now = new Date();

  if (tx.status === 'LOCKED' || (tx.locked_until && new Date(tx.locked_until) > now)) {
    throw new AppError('Too many failed verification attempts. Please try again later.', 423, 'OTP_LOCKED');
  }

  const expiresAt = new Date(tx.expires_at);

  if (tx.consumed_at || tx.status === 'CONSUMED' || tx.status !== 'OTP_VERIFIED' || now >= expiresAt || tx.purpose !== 'PASSWORD_RESET') {
    throw new AppError("You're on the wrong page. Please go to Home.", 404, 'NOT_FOUND');
  }

  if (!tx.user_id) {
    throw new AppError('User account record missing for this reset request.', 404, 'NOT_FOUND');
  }

  // ATOMIC DATABASE TRANSITION FROM OTP_VERIFIED TO CONSUMED (PREVENTS REPLAY & CONCURRENCY)
  const { data: consumedRecord, error: consumeErr } = await supabaseAdmin
    .from('auth_otp_verifications')
    .update({
      status: 'CONSUMED',
      consumed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', tx.id)
    .eq('status', 'OTP_VERIFIED')
    .gt('expires_at', now.toISOString())
    .select()
    .single();

  if (consumeErr || !consumedRecord) {
    throw new AppError('Password reset link has already been used or expired.', 400, 'INVALID_STATE');
  }

  // Update user's password in Supabase Auth
  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(tx.user_id, {
    password: newPassword,
  });

  if (updateErr) {
    logger.error(`Failed to update password for user ${tx.user_id}: ${updateErr.message}`, undefined, 'OtpService');
    throw new AppError('Failed to update password.', 500, 'INTERNAL');
  }

  return { ok: true };
}
