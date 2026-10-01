import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';
import { AppError } from './errorHandler.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense for cookie-authenticated, state-changing requests.
 * Session cookies are SameSite=None in production (frontend and API are on different origins), so
 * browsers attach them to cross-site requests. A multipart POST is a CORS "simple request" and
 * would otherwise reach the handler. Browsers always send Origin on such requests; we require it to
 * match the configured frontend origin. Requests with no Origin header (curl, server-to-server)
 * are not browser-driven CSRF and are allowed through (they still need valid credentials).
 */
export function originCheckMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const allowed = String(config.corsOrigin).split(',').map((o) => o.trim().replace(/\/$/, ''));
  if (allowed.includes(origin.replace(/\/$/, ''))) return next();
  next(new AppError('Cross-origin request rejected.', 403, 'FORBIDDEN_ORIGIN'));
}
