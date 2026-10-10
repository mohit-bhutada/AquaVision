import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';
import { getClientIp, getEdgeIp } from '../lib/clientIp.js';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  /**
   * A second, looser limit on the connection-level (Cloudflare) address. It cannot be dodged by faking
   * headers. Behind the Vercel proxy many visitors share a few edge addresses, so it is deliberately generous.
   */
  edgeMultiplier?: number;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

const MAX_TRACKED_KEYS = 20_000;
const PRUNE_EVERY_MS = 60_000;
const stores = new Map<string, Map<string, ClientRecord>>();
let lastPrune = 0;

/**
 * Timers are not allowed while a Cloudflare Worker module initialises, and a Worker isolate can live a long
 * time, so expired entries are removed opportunistically on traffic instead. Without this, a flood of distinct
 * addresses would grow the map without bound.
 */
function prune(store: Map<string, ClientRecord>, now: number): void {
  if (now - lastPrune < PRUNE_EVERY_MS && store.size < MAX_TRACKED_KEYS) return;
  lastPrune = now;
  for (const [key, record] of store) {
    if (now > record.resetTime) store.delete(key);
  }
  if (store.size >= MAX_TRACKED_KEYS) {
    let toDrop = store.size - MAX_TRACKED_KEYS + 1000;
    for (const key of store.keys()) {
      if (toDrop-- <= 0) break;
      store.delete(key);
    }
  }
}

function hit(store: Map<string, ClientRecord>, key: string, windowMs: number, now: number): ClientRecord {
  let record = store.get(key);
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + windowMs };
    store.set(key, record);
  } else {
    record.count += 1;
  }
  return record;
}

export function createRateLimiter(name: string, options: RateLimitOptions) {
  if (!stores.has(name)) stores.set(name, new Map<string, ClientRecord>());
  if (!stores.has(`${name}:edge`)) stores.set(`${name}:edge`, new Map<string, ClientRecord>());
  const store = stores.get(name)!;
  const edgeStore = stores.get(`${name}:edge`)!;
  const edgeMax = Math.max(options.maxRequests * (options.edgeMultiplier ?? 20), 100);

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    prune(store, now);
    prune(edgeStore, now);

    const clientIp = getClientIp(req);
    const record = hit(store, clientIp, options.windowMs, now);
    const edgeRecord = hit(edgeStore, getEdgeIp(req), options.windowMs, now);

    const limited = record.count > options.maxRequests ? record : edgeRecord.count > edgeMax ? edgeRecord : null;
    const shown = limited ?? record;
    const remaining = Math.max(0, options.maxRequests - record.count);
    const resetSeconds = Math.max(1, Math.ceil((shown.resetTime - now) / 1000));

    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (limited) {
      const message = options.message || 'Rate limit exceeded. Please try again later.';
      res.setHeader('Retry-After', resetSeconds);
      logger.warn(`Rate limit exceeded for ${clientIp} on ${name}`, (req as unknown as { id?: string }).id, 'RateLimiter');
      // Same envelope as every other API error, so the frontend can show the message.
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message, details: { retryAfterSeconds: resetSeconds } },
        retryAfter: resetSeconds,
      });
      return;
    }

    next();
  };
}
