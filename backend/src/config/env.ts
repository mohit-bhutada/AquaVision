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
  corsOrigin: string;
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

export function validateEnv(): EnvironmentConfig {
  const env = (process.env.NODE_ENV as EnvironmentConfig['env']) || 'development';
  const port = parseInt(process.env.PORT || '4000', 10);
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';

  const smtpHost = process.env.SMTP_HOST || '';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';
  const smtpFromEmail = process.env.SMTP_FROM_EMAIL || 'noreply@aquavision.ai';
  const smtpFromName = process.env.SMTP_FROM_NAME || 'AquaVision';

  // Dev-only fallback. Production refuses to start without a real secret (see check below).
  const DEV_OTP_PEPPER = 'dev-only-insecure-otp-pepper-do-not-use-in-production';
  const otpPepper = process.env.OTP_PEPPER || DEV_OTP_PEPPER;
  const mlServiceTimeoutMs = Math.max(1000, parseInt(process.env.ML_SERVICE_TIMEOUT_MS || '180000', 10) || 180000);
  const otpExpirySeconds = parseInt(process.env.OTP_EXPIRY_SECONDS || '600', 10);
  const otpMaxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);
  const otpResendCooldownSeconds = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10);
  const otpLockoutSeconds = parseInt(process.env.OTP_LOCKOUT_SECONDS || '3600', 10);
  const forgotPasswordDailyLimit = parseInt(process.env.FORGOT_PASSWORD_DAILY_LIMIT || '1', 10);

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
  }

  return {
    env,
    port,
    corsOrigin,
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

export const config: EnvironmentConfig = new Proxy({} as EnvironmentConfig, {
  get(_target, prop: keyof EnvironmentConfig) {
    const current = validateEnv();
    return current[prop];
  },
});