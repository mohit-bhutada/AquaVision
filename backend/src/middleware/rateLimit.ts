import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

const stores = new Map<string, Map<string, ClientRecord>>();

export function createRateLimiter(name: string, options: RateLimitOptions) {
  if (!stores.has(name)) {
    stores.set(name, new Map<string, ClientRecord>());
  }
  const store = stores.get(name)!;

  // Periodic cleanup of expired records every 5 minutes in Node environment
  try {
    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [ip, record] of store.entries()) {
        if (now > record.resetTime) {
          store.delete(ip);
        }
      }
    }, 5 * 60 * 1000);
    if (cleanup && typeof cleanup === 'object' && 'unref' in cleanup) {
      (cleanup as any).unref();
    }
  } catch (_err) {
    // Global timers disallowed during Worker module initialization
  }


  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = req.ip || req.headers['x-forwarded-for']?.toString() || '127.0.0.1';
    const now = Date.now();

    let record = store.get(clientIp);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + options.windowMs,
      };
      store.set(clientIp, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, options.maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > options.maxRequests) {
      res.setHeader('Retry-After', resetSeconds);
      logger.warn(`Rate limit exceeded for IP: ${clientIp}`, (req as unknown as { id?: string }).id, 'RateLimiter');

      res.status(429).json({
        error: 'Too Many Requests',
        message: options.message || 'Rate limit exceeded. Please try again later.',
        retryAfter: resetSeconds,
      });
      return;
    }

    next();
  };
}
