import type { Request } from 'express';

const IP_RE = /^[0-9a-fA-F:.]{3,45}$/;

function firstValue(header: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(header) ? header[0] : header;
  const first = raw?.split(',')[0]?.trim();
  return first && IP_RE.test(first) ? first : undefined;
}

/**
 * The visitor's IP as seen by this server, used for rate limiting.
 *
 * `app.set('trust proxy', true)` made Express believe any client-supplied X-Forwarded-For, so a single
 * script could send a different fake address with every request and never be throttled. This resolves
 * the address explicitly instead:
 *   - Behind the Vercel proxy (browser -> Vercel -> Worker) the real visitor IP is in the headers Vercel adds.
 *   - Otherwise Cloudflare's own `cf-connecting-ip` (set by Cloudflare, cannot be forged by the client).
 *   - Local development falls back to the socket address.
 * Residual risk: someone calling the Worker directly could fake the Vercel headers, so per-IP limits are one
 * layer only; account lockouts, OTP attempt limits and per-email cooldowns do not depend on the IP.
 */
export function getClientIp(req: Pick<Request, 'headers' | 'socket'>): string {
  const h = req.headers;
  const viaVercel = Boolean(h['x-vercel-id'] || h['x-vercel-forwarded-for']);
  if (viaVercel) {
    const v = firstValue(h['x-vercel-forwarded-for']) ?? firstValue(h['x-forwarded-for']);
    if (v) return v;
  }
  return firstValue(h['cf-connecting-ip']) ?? req.socket?.remoteAddress ?? 'unknown';
}

/** The connection-level address (Cloudflare's view). Cannot be spoofed with headers on Workers. */
export function getEdgeIp(req: Pick<Request, 'headers' | 'socket'>): string {
  return firstValue(req.headers['cf-connecting-ip']) ?? req.socket?.remoteAddress ?? 'unknown';
}
