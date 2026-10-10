import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent framing to mitigate clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // This is a JSON API: nothing it returns should ever be rendered or framed.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Responses contain personal data (profile, credits, projects). Keep them out of browser/proxy caches.
  // Routes that serve images set their own Cache-Control afterwards, which overrides this default.
  res.setHeader('Cache-Control', 'no-store');

  // Strict-Transport-Security in production
  if (config.env === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}
