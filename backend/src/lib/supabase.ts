import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { logger } from './logger.js';

let cachedClient: SupabaseClient<any> | null = null;
let cachedUrl = '';
let cachedKey = '';

export function getSupabaseAdmin(): SupabaseClient<any> {
  const currentUrl = config.supabase.url;
  const currentKey = config.supabase.serviceRoleKey || 'fallback-dev-key';

  if (!cachedClient || cachedUrl !== currentUrl || cachedKey !== currentKey) {
    if (!currentKey || currentKey === 'fallback-dev-key') {
      logger.warn('SUPABASE_SERVICE_ROLE_KEY is missing. Database administrative features will be unavailable.', undefined, 'SupabaseClient');
    }
    cachedUrl = currentUrl;
    cachedKey = currentKey;
    cachedClient = createClient(currentUrl, currentKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return cachedClient;
}

/**
 * A throwaway client for calls that CREATE a user session (signInWithPassword, verifyOtp,
 * signInWithOAuth). supabase-js keeps the resulting session in memory even with
 * persistSession: false, and from then on sends THAT USER'S token on every database request.
 * If that happened on the shared admin client, later admin queries (and other users' requests)
 * would run as the last user who logged in instead of as the service role. Use a fresh client per
 * call so the shared admin client never changes identity.
 */
export function createAuthClient(): SupabaseClient<any> {
  return createClient(config.supabase.url, config.supabase.serviceRoleKey || 'fallback-dev-key', {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Single authoritative server-side Supabase admin client (NEVER EXPOSE TO FRONTEND)
export const supabaseAdmin: SupabaseClient<any> = new Proxy({} as SupabaseClient<any>, {
  get(_target, prop: keyof SupabaseClient<any>) {
    const client = getSupabaseAdmin();
    const val = (client as any)[prop];
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});