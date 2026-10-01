export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  context?: string;
  details?: Record<string, unknown>;
}

class Logger {
  private format(level: LogLevel, message: string, requestId?: string, context?: string, details?: Record<string, unknown>): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(requestId && { requestId }),
      ...(context && { context }),
      ...(details && { details: this.sanitize(details) }),
    };
    return JSON.stringify(entry);
  }

  private sanitize(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'key', 'cookie'];

    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitize(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  info(message: string, requestId?: string, context?: string, details?: Record<string, unknown>): void {
    console.log(this.format('info', message, requestId, context, details));
  }

  warn(message: string, requestId?: string, context?: string, details?: Record<string, unknown>): void {
    console.warn(this.format('warn', message, requestId, context, details));
  }

  error(message: string, requestId?: string, context?: string, details?: Record<string, unknown>): void {
    console.error(this.format('error', message, requestId, context, details));
  }

  debug(message: string, requestId?: string, context?: string, details?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== 'production') {
      console.log(this.format('debug', message, requestId, context, details));
    }
  }
}

export const logger = new Logger();
