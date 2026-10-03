import crypto from 'crypto';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Client for the external AquaVision ML service (separate project, hosted on Render).
 *
 * Contract (see the ML service integration guide):
 *   POST {base}/v1/enhance        multipart/form-data, exactly one file in the field `file`
 *   Header X-API-Key              required shared secret (server-side only, never sent to the browser)
 *   Header X-Model-Input-SHA256   optional hex SHA-256 of the exact bytes uploaded
 *   200 -> raw image/jpeg or image/png bytes (not JSON); errors -> JSON { error, message, request_id }
 *   Only JPEG and PNG, ≤ 20 MiB, ≤ 2,073,600 px, ≤ 4,096 px per side; one inference at a time.
 */

export interface MLEnhanceResult {
  buffer: Buffer;
  contentType: string;
  requestId: string | null;
  modelVersion: string | null;
  inferenceMs: string | null;
}

export interface MLEnhanceOptions {
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const MAX_ML_RESPONSE_BYTES = 50 * 1024 * 1024;
const ALLOWED_RESULT_TYPES = ['image/jpeg', 'image/png'];
const MAX_BUSY_RETRIES = 2; // 'service_busy' only; everything else is not retried automatically
const DEFAULT_RETRY_AFTER_SECONDS = 5;
const MAX_RETRY_DELAY_MS = 15_000;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Configuration comes only from server-side environment variables.
 * Preferred names follow the ML integration guide; AQUAVISION_API_KEY (the ML service's own name for the
 * same secret) and the older ML_SERVICE_* names also work.
 */
function resolveMlConfig(): { baseUrl: string; apiKey: string; timeoutMs: number } {
  const baseUrl = (process.env.AQUAVISION_ML_BASE_URL || config.mlServiceUrl || '').trim().replace(/\/+$/, '');
  const apiKey = (process.env.AQUAVISION_ML_API_KEY || process.env.AQUAVISION_API_KEY || process.env.ML_SERVICE_API_KEY || '').trim();
  const secondsOverride = Number(process.env.AQUAVISION_ML_TIMEOUT_SECONDS);
  const timeoutMs =
    Number.isFinite(secondsOverride) && secondsOverride > 0 ? Math.ceil(secondsOverride * 1000) : config.mlServiceTimeoutMs;

  const isProd = config.env === 'production';
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(baseUrl);

  if (!baseUrl || (isProd && (isLocalhost || !baseUrl.startsWith('https://')))) {
    logger.error(
      'ML service base URL is not configured for production (needs an https:// URL in AQUAVISION_ML_BASE_URL or ML_SERVICE_URL).',
      undefined,
      'MLService'
    );
    throw new AppError('The enhancement engine is not configured. Please try again later.', 503, 'ML_UNAVAILABLE');
  }
  if (isProd && !apiKey) {
    logger.error('ML service API key is missing (set AQUAVISION_ML_API_KEY as a secret).', undefined, 'MLService');
    throw new AppError('The enhancement engine is not configured. Please try again later.', 503, 'ML_UNAVAILABLE');
  }
  return { baseUrl, apiKey, timeoutMs };
}

interface MlErrorBody {
  error?: string;
  message?: string;
  request_id?: string;
}

async function readErrorBody(response: Response): Promise<MlErrorBody> {
  try {
    const payload = await response.json();
    return payload && typeof payload === 'object' ? (payload as MlErrorBody) : {};
  } catch {
    return {}; // Render/proxy errors can be HTML or empty
  }
}

/** Translates an ML service failure into the application's own error contract. */
function mapMlFailure(status: number, body: MlErrorBody, mlRequestId: string | null): AppError {
  const code = typeof body.error === 'string' ? body.error : 'upstream_http_error';
  logger.error(
    `ML service error: HTTP ${status} code=${code} ml_request_id=${body.request_id || mlRequestId || 'n/a'}`,
    undefined,
    'MLService'
  );

  // Problems with the user's image.
  if (status === 400 && (code === 'empty_file' || code === 'invalid_image')) {
    return new AppError('The image could not be read. Please upload a different JPEG or PNG.', 422, 'ML_REJECTED_INPUT');
  }
  if (status === 400 && code === 'unsupported_format') {
    return new AppError('Unsupported image format. Please upload a still JPEG or PNG.', 422, 'ML_REJECTED_INPUT');
  }
  if (status === 413) {
    return new AppError(
      code === 'file_too_large'
        ? 'The image file is too large for the enhancement engine (max 20MB).'
        : 'The image is too large for the enhancement engine (max 2,073,600 pixels, e.g. 1920×1080). Please resize it and try again.',
      413,
      code === 'file_too_large' ? 'FILE_TOO_LARGE' : 'IMAGE_TOO_LARGE'
    );
  }
  // Availability: tell the user to try again.
  if (status === 503 && code === 'service_busy') {
    return new AppError('The enhancement engine is busy right now. Please try again in a moment.', 503, 'ML_BUSY');
  }
  if (status === 503 && (code === 'model_unavailable' || code === 'compute_unavailable')) {
    return new AppError('The enhancement engine is temporarily unavailable. Please try again shortly.', 503, 'ML_UNAVAILABLE');
  }
  // Everything else is our integration or the ML service's fault, never the user's:
  // 401 unauthorized, 503 service_unconfigured, 400 missing_file/invalid_request/checksum_mismatch,
  // 500 inference_failed, and non-JSON gateway errors.
  if (status === 504) {
    return new AppError('The enhancement engine took too long to respond. Please try again.', 504, 'ML_TIMEOUT');
  }
  return new AppError('The enhancement engine failed to process the image. Please try again.', 502, 'ML_FAILED');
}

export async function enhanceImageWithMLService(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  requestId?: string,
  options: MLEnhanceOptions = {}
): Promise<MLEnhanceResult> {
  const { baseUrl, apiKey, timeoutMs } = resolveMlConfig();
  const sleep = options.sleep ?? realSleep;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  // SHA-256 of the exact bytes we upload (not of the filename or multipart envelope).
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  for (let attempt = 0; ; attempt++) {
    // The multipart body is rebuilt per attempt (a FormData/Blob can only be consumed once).
    const formData = new FormData();
    formData.append('file', new Blob([buffer as unknown as BlobPart], { type: mimeType }), filename);

    const headers: Record<string, string> = { 'X-Model-Input-SHA256': sha256 };
    if (apiKey) headers['X-API-Key'] = apiKey;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/enhance`, {
        method: 'POST',
        headers,
        body: formData,
        redirect: 'error', // never forward the API key across a redirect
        signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
      });
    } catch (err: any) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      logger.error(
        `Failed to reach ML service (${timedOut ? 'timeout' : 'connection error'}): ${err?.message}`,
        requestId,
        'MLService'
      );
      throw new AppError(
        timedOut
          ? 'The enhancement engine took too long to respond. Please try again.'
          : 'The enhancement engine is temporarily unavailable. Please try again.',
        timedOut ? 504 : 503,
        timedOut ? 'ML_TIMEOUT' : 'ML_UNAVAILABLE'
      );
    }

    const mlRequestId = response.headers.get('X-Request-ID');

    if (response.status !== 200) {
      const body = await readErrorBody(response);
      const isBusy = response.status === 503 && body.error === 'service_busy';
      if (isBusy && attempt < MAX_BUSY_RETRIES) {
        const retryAfterSeconds = Number(response.headers.get('Retry-After'));
        const baseDelay = (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : DEFAULT_RETRY_AFTER_SECONDS) * 1000;
        const delay = Math.min(MAX_RETRY_DELAY_MS, baseDelay * (attempt + 1)) + Math.floor(Math.random() * 1000);
        // Only retry if there is realistic time left in the overall budget.
        if (deadline - Date.now() > delay + 10_000) {
          logger.warn(`ML service busy; retry ${attempt + 1}/${MAX_BUSY_RETRIES} in ${delay}ms`, requestId, 'MLService');
          await sleep(delay);
          continue;
        }
      }
      throw mapMlFailure(response.status, body, mlRequestId);
    }

    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_RESULT_TYPES.includes(contentType)) {
      logger.error(`ML service returned HTTP 200 with unexpected content-type "${contentType}" (ml_request_id=${mlRequestId})`, requestId, 'MLService');
      throw new AppError('The enhancement engine returned an invalid result. Please try again.', 502, 'ML_INVALID_RESPONSE');
    }
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ML_RESPONSE_BYTES) {
      throw new AppError('The enhancement engine returned an oversized result.', 502, 'ML_INVALID_RESPONSE');
    }
    const resultBuffer = Buffer.from(await response.arrayBuffer());
    if (resultBuffer.length === 0 || resultBuffer.length > MAX_ML_RESPONSE_BYTES) {
      throw new AppError('The enhancement engine returned an invalid result. Please try again.', 502, 'ML_INVALID_RESPONSE');
    }

    const result: MLEnhanceResult = {
      buffer: resultBuffer,
      contentType,
      requestId: mlRequestId,
      modelVersion: response.headers.get('X-Model-Version'),
      inferenceMs: response.headers.get('X-Inference-Ms'),
    };
    logger.info(
      `ML enhancement ok: ml_request_id=${result.requestId} model=${result.modelVersion} inference_ms=${result.inferenceMs} total_ms=${Date.now() - startedAt} attempts=${attempt + 1}`,
      requestId,
      'MLService'
    );
    return result;
  }
}