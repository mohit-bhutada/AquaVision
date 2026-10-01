import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import crypto from 'crypto';

export interface MLServiceHealth {
  status: string;
  service: string;
  model_loaded: boolean;
  device?: string;
  epoch?: number;
}

const HEALTH_TIMEOUT_MS = 5000;
const MAX_ML_RESPONSE_BYTES = 50 * 1024 * 1024;
const ALLOWED_RESULT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * The ML service is a separate, external project. Its location comes exclusively from the
 * ML_SERVICE_URL environment variable (server-side only; never exposed to the frontend).
 */
function resolveMlBaseUrl(): string {
  const base = (config.mlServiceUrl || '').replace(/\/+$/, '');
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(base);
  if (!base || (config.env === 'production' && isLocalhost)) {
    logger.error(
      'ML_SERVICE_URL is not configured for production (unset or pointing to localhost).',
      undefined,
      'MLService'
    );
    throw new AppError('Underwater ML enhancement engine is not configured. Please try again later.', 503, 'ML_UNAVAILABLE');
  }
  return base;
}

export async function checkMLServiceHealth(): Promise<MLServiceHealth> {
  try {
    const res = await fetch(`${resolveMlBaseUrl()}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`ML Health check returned status ${res.status}`);
    }
    return (await res.json()) as MLServiceHealth;
  } catch (err: any) {
    logger.warn(`ML Service health check failed: ${err.message}`, undefined, 'MLService');
    return {
      status: 'unavailable',
      service: 'aquavision-ml-service',
      model_loaded: false,
    };
  }
}

export async function enhanceImageWithMLService(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  requestId?: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const baseUrl = resolveMlBaseUrl();
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const formData = new FormData();
  const blob = new Blob([buffer as unknown as BlobPart], { type: mimeType });
  formData.append('file', blob, filename);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/enhance`, {
      method: 'POST',
      headers: {
        'X-Model-Input-SHA256': sha256,
      },
      body: formData,
      signal: AbortSignal.timeout(config.mlServiceTimeoutMs),
    });
  } catch (err: any) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    logger.error(
      `Failed to reach ML Service (${timedOut ? 'timeout' : 'connection error'}): ${err.message}`,
      requestId,
      'MLService'
    );
    throw new AppError(
      timedOut
        ? 'Underwater ML enhancement timed out. Please try again.'
        : 'Underwater ML enhancement engine is temporarily unavailable. Please try again.',
      timedOut ? 504 : 503,
      'ML_UNAVAILABLE'
    );
  }

  if (!response.ok) {
    // Upstream error text is logged for operators but never forwarded to the client.
    let upstreamDetail = '';
    try {
      const errorJson = (await response.json()) as any;
      if (typeof errorJson?.detail === 'string') upstreamDetail = errorJson.detail.slice(0, 300);
    } catch {
      /* non-JSON error body */
    }
    logger.error(`ML Service enhancement error HTTP ${response.status}: ${upstreamDetail}`, requestId, 'MLService');
    if (response.status === 400 || response.status === 413 || response.status === 415 || response.status === 422) {
      throw new AppError('The image could not be processed by the enhancement engine.', 422, 'ML_REJECTED_INPUT');
    }
    throw new AppError('ML enhancement engine failed to process image.', 502, 'ML_FAILED');
  }

  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_RESULT_TYPES.includes(contentType)) {
    logger.error(`ML Service returned unexpected content-type "${contentType}"`, requestId, 'MLService');
    throw new AppError('ML enhancement engine returned an invalid result.', 502, 'ML_INVALID_RESPONSE');
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ML_RESPONSE_BYTES) {
    throw new AppError('ML enhancement engine returned an oversized result.', 502, 'ML_INVALID_RESPONSE');
  }

  const resultBuffer = Buffer.from(await response.arrayBuffer());
  if (resultBuffer.length === 0 || resultBuffer.length > MAX_ML_RESPONSE_BYTES) {
    throw new AppError('ML enhancement engine returned an invalid result.', 502, 'ML_INVALID_RESPONSE');
  }

  return { buffer: resultBuffer, contentType };
}
