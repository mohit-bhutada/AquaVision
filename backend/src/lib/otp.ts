import crypto from 'crypto';
import { config } from '../config/env.js';

/**
 * Generate a 256-bit cryptographically secure random token (URL-safe string).
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Compute SHA-256 hash of raw verification token.
 */
export function hashVerificationToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

/**
 * Generate a 6-digit numeric OTP using cryptographically secure random numbers.
 */
export function generateOtp(): string {
  const num = crypto.randomInt(100000, 1000000);
  return num.toString();
}

/**
 * Generate a 16-byte random salt for OTP hashing.
 */
export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Compute HMAC-SHA256 of OTP using per-record salt and server OTP_PEPPER.
 */
export function hashOtp(otp: string, salt: string): string {
  const secretKey = salt + config.otp.pepper;
  return crypto.createHmac('sha256', secretKey).update(otp.trim()).digest('hex');
}

/**
 * Perform constant-time verification of raw OTP against stored hash.
 */
export function verifyOtpHash(otp: string, salt: string, expectedHash: string): boolean {
  const computedHash = hashOtp(otp, salt);
  const bufA = Buffer.from(computedHash, 'hex');
  const bufB = Buffer.from(expectedHash, 'hex');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
