import { AppError } from './errorHandler.js';

export interface LockoutState {
  attempts: number;
  lockedUntil: number | null;
  lastAttemptAt: number;
}

const lockoutStore = new Map<string, LockoutState>();

export const LOCKOUT_CONFIG = {
  MAX_ATTEMPTS: 5,
  LOCK_DURATION_MS: 10 * 60 * 1000, // 10 minutes
};

let customClock: (() => number) | null = null;

export function getCurrentTime(): number {
  return customClock ? customClock() : Date.now();
}

export function setCustomClock(clockFn: (() => number) | null): void {
  customClock = clockFn;
}

export function resetLoginLocks(): void {
  lockoutStore.clear();
  customClock = null;
}

export function getLockoutState(email: string): LockoutState | undefined {
  const key = email.trim().toLowerCase();
  return lockoutStore.get(key);
}

// Clean up stale lockout records every 5 minutes in Node environment
try {
  const cleanupInterval = setInterval(() => {
    const now = getCurrentTime();
    for (const [key, state] of lockoutStore.entries()) {
      if (state.lockedUntil && now > state.lockedUntil) {
        lockoutStore.delete(key);
      } else if (!state.lockedUntil && now - state.lastAttemptAt > 60 * 60 * 1000) {
        lockoutStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  if (cleanupInterval && typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    (cleanupInterval as any).unref();
  }
} catch (_err) {
  // Global timers disallowed during Worker module initialization
}


const MAX_TRACKED_ACCOUNTS = 10_000;
let lastPrune = 0;

/** Remove stale records on traffic (timers are unavailable in Workers) and cap the map's size. */
function pruneLockouts(now: number): void {
  if (now - lastPrune < 60_000 && lockoutStore.size < MAX_TRACKED_ACCOUNTS) return;
  lastPrune = now;
  for (const [key, state] of lockoutStore) {
    if ((state.lockedUntil && now > state.lockedUntil) || (!state.lockedUntil && now - state.lastAttemptAt > 60 * 60 * 1000)) {
      lockoutStore.delete(key);
    }
  }
  if (lockoutStore.size >= MAX_TRACKED_ACCOUNTS) {
    let toDrop = lockoutStore.size - MAX_TRACKED_ACCOUNTS + 500;
    for (const key of lockoutStore.keys()) {
      if (toDrop-- <= 0) break;
      lockoutStore.delete(key);
    }
  }
}

export function checkLoginLock(email: string): void {
  if (!email || typeof email !== 'string') return;
  const key = email.trim().toLowerCase();
  const state = lockoutStore.get(key);

  if (!state || !state.lockedUntil) {
    return;
  }

  const now = getCurrentTime();
  const remainingMs = state.lockedUntil - now;

  if (remainingMs > 0) {
    const remainingSec = Math.ceil(remainingMs / 1000);
    const remainingMin = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
    throw new AppError(
      `Your account is temporarily locked. Try again in ${remainingMin} minute${remainingMin === 1 ? '' : 's'}.`,
      423,
      'ACCOUNT_LOCKED',
      { retryAfterSeconds: remainingSec, attemptsLeft: 0 }
    );
  } else {
    // Lock has expired
    lockoutStore.delete(key);
  }
}

export function recordFailedLogin(email: string): AppError {
  const key = email.trim().toLowerCase();
  const now = getCurrentTime();
  pruneLockouts(now);
  let state = lockoutStore.get(key);

  // If lock expired prior to this attempt, reset state
  if (state && state.lockedUntil && state.lockedUntil <= now) {
    state = undefined;
    lockoutStore.delete(key);
  }

  if (!state) {
    state = { attempts: 0, lockedUntil: null, lastAttemptAt: now };
  }

  state.attempts += 1;
  state.lastAttemptAt = now;

  if (state.attempts >= LOCKOUT_CONFIG.MAX_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_CONFIG.LOCK_DURATION_MS;
    lockoutStore.set(key, state);
    return new AppError(
      'Too many failed login attempts. Your account is locked for 10 minutes.',
      423,
      'ACCOUNT_LOCKED',
      { retryAfterSeconds: Math.ceil(LOCKOUT_CONFIG.LOCK_DURATION_MS / 1000), attemptsLeft: 0 }
    );
  }

  lockoutStore.set(key, state);
  const attemptsLeft = LOCKOUT_CONFIG.MAX_ATTEMPTS - state.attempts;

  if (state.attempts === 3) {
    return new AppError('You entered 3 wrong passwords. 2 attempts left.', 401, 'INVALID_CREDENTIALS', { attemptsLeft: 2 });
  }

  if (state.attempts === 4) {
    return new AppError('You entered 4 wrong passwords. 1 attempt left.', 401, 'INVALID_CREDENTIALS', { attemptsLeft: 1 });
  }

  return new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS', { attemptsLeft });
}

export function recordSuccessfulLogin(email: string): void {
  if (!email || typeof email !== 'string') return;
  const key = email.trim().toLowerCase();
  lockoutStore.delete(key);
}
