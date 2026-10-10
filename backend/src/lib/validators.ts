import { AppError } from '../middleware/errorHandler.js';

// Request bodies are untrusted JSON: a field can be a number, an array or an object. Calling .trim() on one
// of those used to throw a TypeError and surface as a 500. These helpers turn every bad input into a clean 400.

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"']+@[^\s@<>()[\]\\,;:"']+\.[^\s@<>()[\]\\,;:"']{2,}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const MAX_PASSWORD = 72; // bcrypt (used by Supabase Auth) ignores everything past 72 bytes

const bad = (message: string) => new AppError(message, 400, 'VALIDATION_ERROR');

/** A trimmed, lower-cased, well-formed e-mail address. */
export function requireEmail(value: unknown): string {
  if (typeof value !== 'string') throw bad('A valid email address is required');
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) throw bad('Please enter a valid email address');
  return email;
}

/** Password for signing in: only shape-checked, so existing accounts are never locked out by a new rule. */
export function requireLoginPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw bad('Email and password are required');
  if (value.length > 128) throw bad('Invalid email or password.');
  return value;
}

/** Password for a NEW account or a reset: same policy as before, plus a sane maximum. */
export function requireNewPassword(value: unknown): string {
  if (typeof value !== 'string') throw bad('A valid password is required');
  if (value.length < 8 || !/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    throw bad('Password must be at least 8 characters long and contain both letters and numbers');
  }
  if (value.length > MAX_PASSWORD) throw bad(`Password must be at most ${MAX_PASSWORD} characters long`);
  return value;
}

/** Opaque verification token handed out by the backend (hex string). */
export function requireToken(value: unknown): string {
  if (typeof value !== 'string') throw bad('A valid verification token is required');
  const token = value.trim();
  if (token.length < 16 || token.length > 256 || !/^[A-Za-z0-9._-]+$/.test(token)) throw bad('A valid verification token is required');
  return token;
}

/** The 6-digit one-time code. */
export function requireOtp(value: unknown): string {
  const otp = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!/^\d{6}$/.test(otp)) throw bad('Enter the 6-digit verification code');
  return otp;
}

/** Optional display name: plain text only, no control characters, at most 100 characters. */
export function cleanDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return name || undefined;
}
