import { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
import express from 'express';
import app from './app.js';
import { MAX_UPLOAD_BYTES } from './lib/uploadValidation.js';

// Body-size ceilings enforced BEFORE buffering (the adapter buffers whole bodies in memory,
// and runs before authentication, so unbounded bodies would be an unauthenticated DoS vector).
const MAX_MULTIPART_BODY_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024; // file + form overhead
const MAX_JSON_BODY_BYTES = 1024 * 1024; // matches express.json({ limit: '1mb' })

function payloadTooLarge(): Response {
  return new Response(
    JSON.stringify({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } }),
    { status: 413, headers: { 'Content-Type': 'application/json' } }
  );
}


export interface WorkerEnv {
  NODE_ENV?: string;
  PORT?: string;
  CORS_ORIGIN?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ML_SERVICE_URL?: string;
  OTP_PEPPER?: string;
  OTP_EXPIRY_SECONDS?: string;
  OTP_MAX_ATTEMPTS?: string;
  OTP_RESEND_COOLDOWN_SECONDS?: string;
  OTP_LOCKOUT_SECONDS?: string;
  FORGOT_PASSWORD_DAILY_LIMIT?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM_EMAIL?: string;
  SMTP_FROM_NAME?: string;
  [key: string]: string | undefined;
}

export async function handleExpressRequest(
  expressApp: express.Express,
  request: Request
): Promise<Response> {
  const url = new URL(request.url);
  const dummySocket = new EventEmitter();
  Object.assign(dummySocket, {
    remoteAddress: request.headers.get('cf-connecting-ip') || '127.0.0.1',
    remotePort: 8787,
    encrypted: true,
    writable: true,
    readable: true,
    write(_chunk: any, _encoding?: any, cb?: any) {
      if (typeof cb === 'function') cb();
      return true;
    },
    end(_chunk?: any, _encoding?: any, cb?: any) {
      if (typeof cb === 'function') cb();
    },
    destroy() {},
    cork() {},
    uncork() {},
  });

  const req = new IncomingMessage(dummySocket as any);
  Object.defineProperty(req, 'socket', { get: () => dummySocket, configurable: true });
  Object.defineProperty(req, 'connection', { get: () => dummySocket, configurable: true });
  req.url = url.pathname + url.search;
  req.method = request.method;



  // Copy incoming HTTP headers
  request.headers.forEach((value, key) => {
    req.headers[key.toLowerCase()] = value;
  });

  // Populate stream body or parse multipart form-data for non-GET/HEAD requests
  if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    const isMultipart = contentType.includes('multipart/form-data');
    const declaredLength = Number(request.headers.get('content-length'));
    const limit = isMultipart ? MAX_MULTIPART_BODY_BYTES : MAX_JSON_BODY_BYTES;
    if (Number.isFinite(declaredLength) && declaredLength > limit) {
      return payloadTooLarge();
    }
    if (contentType.includes('multipart/form-data')) {
      try {
        const formData = await request.formData();
        const file = (formData.get('image') || formData.get('file')) as File | null;
        if (file && typeof file === 'object' && typeof (file as any).arrayBuffer === 'function') {
          if ((file as any).size > MAX_UPLOAD_BYTES) {
            return payloadTooLarge();
          }
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          (req as any).file = {
            fieldname: formData.has('image') ? 'image' : 'file',
            originalname: (file as any).name || 'upload.png',
            encoding: '7bit',
            mimetype: (file as any).type || 'image/png',
            buffer,
            size: buffer.length,
          };
        }
        const bodyObj: Record<string, any> = {};
        formData.forEach((value, key) => {
          if (typeof value === 'string') {
            bodyObj[key] = value;
          }
        });
        (req as any).body = bodyObj;
      } catch (_err) {
        req.push(null);
      }
    } else {
      try {
        const arrayBuffer = await request.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_JSON_BODY_BYTES) {
          return payloadTooLarge();
        }
        const buffer = Buffer.from(arrayBuffer);
        req.push(buffer);
        req.push(null);
      } catch (_err) {
        req.push(null);
      }
    }
  } else {
    req.push(null);
  }

  return new Promise<Response>((resolve, reject) => {
    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];

    const origWrite = res.write;
    const origEnd = res.end;

    res.write = function (chunk: any): boolean {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return (origWrite as any).apply(res, arguments);
    };

    res.end = function (chunk?: any): ServerResponse {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const result = (origEnd as any).apply(res, arguments);

      const statusCode = res.statusCode || 200;
      const headers = new Headers();

      // Copy response headers preserving header arrays (e.g. Set-Cookie)
      const rawHeaders = res.getHeaders();
      for (const [key, value] of Object.entries(rawHeaders)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const val of value) {
            headers.append(key, String(val));
          }
        } else {
          headers.set(key, String(value));
        }
      }

      const bodyBuffer = Buffer.concat(chunks);
      const webResponse = new Response(bodyBuffer.length > 0 ? bodyBuffer : null, {
        status: statusCode,
        headers,
      });

      resolve(webResponse);
      return result;
    };

    try {
      expressApp(req, res);
    } catch (err) {
      reject(err);
    }
  });
}


export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: unknown): Promise<Response> {
    // Hydrate process.env from Cloudflare Worker environment bindings
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string') {
          process.env[key] = value;
        }
      }
    }

    // Delegate execution to the Express app via Cloudflare Worker adapter
    return handleExpressRequest(app, request);
  },
};
