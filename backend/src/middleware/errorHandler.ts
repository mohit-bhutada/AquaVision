import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';
import { config } from '../config/env.js';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 400, code?: string, details?: any, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || getDefaultErrorCode(statusCode);
    this.details = details;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function getDefaultErrorCode(statusCode: number): string {
  switch (statusCode) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHENTICATED';
    case 402: return 'INSUFFICIENT_CREDITS';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 413: return 'FILE_TOO_LARGE';
    case 415: return 'UNSUPPORTED_FILE_TYPE';
    case 422: return 'VALIDATION_ERROR';
    case 429: return 'RATE_LIMITED';
    default: return 'INTERNAL';
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Resource not found: ${req.method} ${req.path}`,
    },
  });
}

export function errorHandler(err: Error | AppError, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (req as unknown as { id?: string }).id;

  if (err.name === 'MulterError') {
    const multerErr = err as unknown as { code: string };
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'Uploaded file size exceeds the maximum limit of 20MB.',
        },
      });
      return;
    }
  }

  // express.json() failures (malformed JSON, body too large) carry a 4xx status but are not AppErrors.
  // Treat them as client errors instead of reporting a server fault.
  const parserType = (err as unknown as { type?: string }).type;
  if (!(err instanceof AppError) && (parserType === 'entity.parse.failed' || parserType === 'entity.too.large')) {
    const tooLarge = parserType === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
        message: tooLarge ? 'Request body is too large.' : 'The request body is not valid JSON.',
      },
    });
    return;
  }

  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : 'INTERNAL';

  const logFn = statusCode >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
  logFn(err.message, requestId, 'ErrorHandler', {
    name: err.name,
    code,
    stack: config.env === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  const isOperationalAppError = err instanceof AppError && err.isOperational;
  const message = (statusCode < 500 || isOperationalAppError || config.env !== 'production')
    ? err.message
    : 'An unexpected server error occurred.';

  const response = {
    error: {
      code,
      message,
      ...(err instanceof AppError && err.details !== undefined && { details: err.details }),
    },
  };

  res.status(statusCode).json(response);
}
