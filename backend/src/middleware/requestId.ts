import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export interface RequestWithId extends Request {
  id?: string;
}

// A caller-supplied correlation ID is kept only if it is a short, plain token. Anything else (very long,
// odd characters, log-injection attempts) is replaced, because the ID is echoed in headers and written to logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,64}$/;

export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const existingId = req.headers['x-request-id'];
  const requestId = typeof existingId === 'string' && SAFE_REQUEST_ID.test(existingId) ? existingId : randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}
