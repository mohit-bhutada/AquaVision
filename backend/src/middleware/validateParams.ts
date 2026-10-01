import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHARE_TOKEN_RE = /^[0-9a-f]{48}$/i;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
export const isShareToken = (v: unknown): v is string => typeof v === 'string' && SHARE_TOKEN_RE.test(v);

/** router.param('id', uuidParam): rejects malformed identifiers before they reach the database. */
export function uuidParam(_req: Request, _res: Response, next: NextFunction, value: string): void {
  if (!isUuid(value)) {
    next(new AppError('Invalid identifier.', 400, 'VALIDATION_ERROR'));
    return;
  }
  next();
}

/** router.param('token', shareTokenParam) */
export function shareTokenParam(_req: Request, _res: Response, next: NextFunction, value: string): void {
  if (!isShareToken(value)) {
    next(new AppError('Share link not found.', 404, 'NOT_FOUND'));
    return;
  }
  next();
}
