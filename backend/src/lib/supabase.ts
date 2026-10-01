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


