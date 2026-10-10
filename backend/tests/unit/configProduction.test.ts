import test from 'node:test';
import assert from 'node:assert/strict';

// Own process => safe to behave like production.
process.env.NODE_ENV = 'production';
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.OTP_PEPPER = 'p'.repeat(40);
delete process.env.CORS_ORIGIN;

const { config } = await import('../../src/config/env.js');

test('production refuses to run without CORS_ORIGIN instead of silently allowing only localhost', () => {
  assert.throws(() => config.corsOrigin, /CORS_ORIGIN/);
});

test('production requires https origins; multiple origins and trailing slashes are accepted', () => {
  process.env.CORS_ORIGIN = 'http://app.example.com';
  assert.throws(() => config.corsOrigin, /https/);
  process.env.CORS_ORIGIN = 'https://app.example.com/, https://www.example.com';
  assert.deepEqual([...config.corsOrigins], ['https://app.example.com', 'https://www.example.com']);
  assert.equal(config.corsOrigin, 'https://app.example.com');
});

test('garbage numbers fall back to safe defaults instead of becoming NaN', () => {
  process.env.CORS_ORIGIN = 'https://app.example.com';
  process.env.OTP_MAX_ATTEMPTS = 'abc';
  process.env.OTP_EXPIRY_SECONDS = '1';
  process.env.OTP_LOCKOUT_SECONDS = '-5';
  assert.equal(config.otp.maxAttempts, 5);
  assert.equal(config.otp.expirySeconds, 60); // clamped to the minimum
  assert.equal(config.otp.lockoutSeconds, 60);
});

test('an odd NODE_ENV value is treated as development, never silently as production-without-checks', () => {
  process.env.NODE_ENV = 'staging';
  assert.equal(config.env, 'development');
});
