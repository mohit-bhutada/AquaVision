import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

try {
  if (typeof import.meta !== 'undefined' && import.meta.url && typeof import.meta.url === 'string') {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const rootEnvPath = path.resolve(__dirname, '../../../.env');
    dotenv.config();
    dotenv.config({ path: rootEnvPath });
  }
} catch (_err) {
  // Ignore filesystem .env resolution in Cloudflare Worker environment
}


export interface EnvironmentConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  /** First allowed frontend origin (used to build links back to the site). */
  corsOrigin: string;
  /** Every allowed frontend origin (CORS_ORIGIN may be a comma-separated list). */
  corsOrigins: string[];
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
    fromEmail: string;
    fromName: string;
  };
  otp: {
    pepper: string;
    expirySeconds: number;
    maxAttempts: number;
    resendCooldownSeconds: number;
    lockoutSeconds: number;
    forgotPasswordDailyLimit: number;
  };
  mlServiceUrl: string;
  mlServiceTimeoutMs: number;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

/** Integer env var with a default and bounds; garbage such as "abc" can no longer turn into NaN. */
function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function validateEnv(): EnvironmentConfig {
  // Anything that is not exactly "production" or "test" is treated as development (e.g. "staging" would
  // otherwise silently skip every production check).
  const env: EnvironmentConfig['env'] = process.env.NODE_ENV === 'production' ? 'production' : process.env.NODE_ENV === 'test' ? 'test' : 'development';
  const port = intEnv('PORT', 4000, 1, 65535);
  const corsOrigins = parseOrigins(process.env.CORS_ORIGIN || '');
  if (corsOrigins.length === 0) {
    // Local development: the Vite dev server and the older default port.
    corsOrigins.push('http://localhost:5173', 'http://localhost:3000');
  }
  const corsOrigin = corsOrigins[0];
  const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';

  const smtpHost = process.env.SMTP_HOST || '';
  const smtpPort = intEnv('SMTP_PORT', 587, 1, 65535);
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';
  const smtpFromEmail = process.env.SMTP_FROM_EMAIL || 'noreply@aquavision.ai';
  const smtpFromName = process.env.SMTP_FROM_NAME || 'AquaVision';

  // Dev-only fallback. Production refuses to start without a real secret (see check below).
  const DEV_OTP_PEPPER = 'dev-only-insecure-otp-pepper-do-not-use-in-production';
  const otpPepper = process.env.OTP_PEPPER || DEV_OTP_PEPPER;
  const mlServiceTimeoutMs = intEnv('ML_SERVICE_TIMEOUT_MS', 180_000, 1000, 600_000);
  const otpExpirySeconds = intEnv('OTP_EXPIRY_SECONDS', 600, 60, 3600);
  const otpMaxAttempts = intEnv('OTP_MAX_ATTEMPTS', 5, 1, 10);
  const otpResendCooldownSeconds = intEnv('OTP_RESEND_COOLDOWN_SECONDS', 60, 10, 600);
  const otpLockoutSeconds = intEnv('OTP_LOCKOUT_SECONDS', 3600, 60, 86_400);
  const forgotPasswordDailyLimit = intEnv('FORGOT_PASSWORD_DAILY_LIMIT', 1, 1, 10);

  if (env === 'production') {
    if (!supabaseServiceRoleKey || supabaseServiceRoleKey === 'your-supabase-service-role-key-here') {
      throw new Error('[FATAL] SUPABASE_SERVICE_ROLE_KEY is required in production mode.');
    }
    if (!process.env.SUPABASE_URL) {
      throw new Error('[FATAL] SUPABASE_URL is required in production mode.');
    }
    if (!process.env.OTP_PEPPER || process.env.OTP_PEPPER.length < 32) {
      throw new Error('[FATAL] OTP_PEPPER (min 32 chars) is required in production mode.');
    }
    // Without this the API silently falls back to localhost origins and every browser request is blocked.
    if (!process.env.CORS_ORIGIN?.trim()) {
      throw new Error('[FATAL] CORS_ORIGIN (your frontend URL, e.g. https://app.example.com) is required in production mode.');
    }
    if (corsOrigins.some((o) => !o.startsWith('https://'))) {
      throw new Error('[FATAL] CORS_ORIGIN must use https:// in production mode.');
    }
  }

  return {
    env,
    port,
    corsOrigin,
    corsOrigins,
    supabase: {
      url: supabaseUrl,
      serviceRoleKey: supabaseServiceRoleKey,
    },
    smtp: {
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      pass: smtpPass,
      fromEmail: smtpFromEmail,
      fromName: smtpFromName,
    },
    otp: {
      pepper: otpPepper,
      expirySeconds: otpExpirySeconds,
      maxAttempts: otpMaxAttempts,
      resendCooldownSeconds: otpResendCooldownSeconds,
      lockoutSeconds: otpLockoutSeconds,
      forgotPasswordDailyLimit,
    },
    mlServiceUrl,
    mlServiceTimeoutMs,
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 100,
    },
  };
}

// Every variable validateEnv() reads. In a Cloudflare Worker, process.env is filled from the bindings on each
// request, so the configuration is re-validated only when one of these values actually changes.
const ENV_KEYS = [
  'NODE_ENV', 'PORT', 'CORS_ORIGIN', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ML_SERVICE_URL', 'ML_SERVICE_TIMEOUT_MS',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL', 'SMTP_FROM_NAME', 'OTP_PEPPER',
  'OTP_EXPIRY_SECONDS', 'OTP_MAX_ATTEMPTS', 'OTP_RESEND_COOLDOWN_SECONDS', 'OTP_LOCKOUT_SECONDS', 'FORGOT_PASSWORD_DAILY_LIMIT',
];
let cached: { fingerprint: string; value: EnvironmentConfig } | null = null;

function currentConfig(): EnvironmentConfig {
  const fingerprint = ENV_KEYS.map((k) => process.env[k] ?? '').join('\u0000');
  if (cached && cached.fingerprint === fingerprint) return cached.value;
  const value = validateEnv(); // throws on invalid production config, and is then retried on the next access
  cached = { fingerprint, value };
  return value;
}

export const config: EnvironmentConfig = new Proxy({} as EnvironmentConfig, {
  get(_target, prop: keyof EnvironmentConfig) {
    return currentConfig()[prop];
  },
});