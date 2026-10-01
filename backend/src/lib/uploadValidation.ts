import { AppError } from '../middleware/errorHandler.js';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

export type DetectedImageType = {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
};

/**
 * Detects the real image type from file signature (magic bytes).
 * The client-declared MIME type and file extension are never trusted.
 */
export function detectImageType(buffer: Buffer): DetectedImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mime: 'image/png', extension: 'png' };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', extension: 'webp' };
  }
  return null;
}

/** Strips path components and unsafe characters from a client-supplied filename. */
export function sanitizeFilename(name: string | undefined, extension: string): string {
  const base = (name || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    .replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 80);
  return `${base || 'upload'}.${extension}`;
}

export interface ValidatedImage {
  buffer: Buffer;
  mime: DetectedImageType['mime'];
  extension: DetectedImageType['extension'];
  filename: string;
  size: number;
}

/**
 * Validates an uploaded file regardless of which runtime parsed it
 * (multer on Node, or the Cloudflare Worker multipart adapter).
 */
export function validateImageUpload(
  file: { buffer?: Buffer; originalname?: string } | undefined | null
): ValidatedImage {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new AppError('No image file provided in upload payload.', 400, 'BAD_REQUEST');
  }
  if (file.buffer.length > MAX_UPLOAD_BYTES) {
    throw new AppError('Image exceeds the 20MB upload limit.', 413, 'FILE_TOO_LARGE');
  }
  const detected = detectImageType(file.buffer);
  if (!detected) {
    throw new AppError(
      'Unsupported or corrupted file. Please upload a JPEG, PNG, or WebP image.',
      415,
      'UNSUPPORTED_FILE_TYPE'
    );
  }
  return {
    buffer: file.buffer,
    mime: detected.mime,
    extension: detected.extension,
    filename: sanitizeFilename(file.originalname, detected.extension),
    size: file.buffer.length,
  };
}
