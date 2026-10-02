import { config } from '../config/env.js';

/** Session lifetime for the login cookies (sliding: re-issued whenever the access token is refreshed). */
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Evaluated per call (not at module load) so the Cloudflare Worker's environment variables are
 * always visible when the options are built.
 */
export function getCookieOptions() {
  const isProd = config.env === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}