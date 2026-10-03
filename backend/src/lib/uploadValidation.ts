import { AppError } from '../middleware/errorHandler.js';

/** File-size cap. Matches the ML service limit (20 MiB = 20,971,520 bytes). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Image limits enforced by the external ML service (GET /info on the deployed service):
 * width × height ≤ 2,073,600 and each side ≤ 4,096. They apply together; a small compressed file can
 * still exceed the pixel budget. Checking here rejects bad images BEFORE a credit is reserved.
 */
export const MAX_IMAGE_PIXELS = 2_073_600;
export const MAX_IMAGE_DIMENSION = 4096;

export type DetectedImageType = {
  mime: 'image/jpeg' | 'image/png';
  extension: 'jpg' | 'png';
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Detects the real image type from the file signature (magic bytes). The client-declared MIME type and
 * extension are never trusted. Only JPEG and PNG are supported by the ML service; GIF, WebP, HEIC, PDF
 * and SVG are not.
 */
export function detectImageType(buffer: Buffer): DetectedImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { mime: 'image/png', extension: 'png' };
  }
  return null;
}

export interface ImageInfo {
  width: number;
  height: number;
  /** PNG only: true when the file is an animated PNG (APNG), which the ML service rejects. */
  animated: boolean;
}

/** Reads dimensions from the PNG header chunks (no image library needed). */
function readPngInfo(buf: Buffer): ImageInfo | null {
  // 8-byte signature, then chunks: [length:4][type:4][data][crc:4]. IHDR must come first.
  if (buf.length < 33 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  let animated = false;
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL') animated = true;
    if (type === 'IDAT' || type === 'IEND') break; // animation control must precede the first IDAT
    offset += 12 + length;
  }
  return { width, height, animated };
}

const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Reads dimensions from the JPEG start-of-frame segment (baseline and progressive). */
function readJpegInfo(buf: Buffer): ImageInfo | null {
  let offset = 2; // after SOI
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) return null;
    let marker = buf[offset + 1];
    while (marker === 0xff && offset + 2 < buf.length) { // fill bytes
      offset += 1;
      marker = buf[offset + 1];
    }
    offset += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // no length field
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan before any frame header
    if (offset + 2 > buf.length) return null;
    const length = buf.readUInt16BE(offset);
    if (length < 2) return null;
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (offset + 7 > buf.length) return null;
      return { height: buf.readUInt16BE(offset + 3), width: buf.readUInt16BE(offset + 5), animated: false };
    }
    offset += length;
  }
  return null;
}

/** Returns the pixel dimensions of a JPEG/PNG buffer, or null if the header cannot be read. */
export function readImageInfo(buffer: Buffer, type: DetectedImageType): ImageInfo | null {
  try {
    return type.mime === 'image/png' ? readPngInfo(buffer) : readJpegInfo(buffer);
  } catch {
    return null;
  }
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
  width: number;
  height: number;
}

/**
 * Validates an uploaded file regardless of which runtime parsed it (multer on Node, or the Cloudflare
 * Worker multipart adapter): real file signature, byte size, decodable dimensions, and the ML
 * service's pixel/dimension limits.
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
    throw new AppError('Unsupported or corrupted file. Please upload a JPEG or PNG image.', 415, 'UNSUPPORTED_FILE_TYPE');
  }
  const info = readImageInfo(file.buffer, detected);
  if (!info || info.width < 1 || info.height < 1) {
    throw new AppError('The image could not be read. It may be corrupted. Please upload a different JPEG or PNG.', 415, 'UNSUPPORTED_FILE_TYPE');
  }
  if (info.animated) {
    throw new AppError('Animated images are not supported. Please upload a still JPEG or PNG.', 415, 'UNSUPPORTED_FILE_TYPE');
  }
  if (
    info.width > MAX_IMAGE_DIMENSION ||
    info.height > MAX_IMAGE_DIMENSION ||
    info.width * info.height > MAX_IMAGE_PIXELS
  ) {
    throw new AppError(
      `Image is too large (${info.width}×${info.height}). The maximum is ${MAX_IMAGE_PIXELS.toLocaleString('en-US')} pixels ` +
        `(for example 1920×1080) and ${MAX_IMAGE_DIMENSION}px on each side. Please resize it and try again.`,
      413,
      'IMAGE_TOO_LARGE'
    );
  }
  return {
    buffer: file.buffer,
    mime: detected.mime,
    extension: detected.extension,
    filename: sanitizeFilename(file.originalname, detected.extension),
    size: file.buffer.length,
    width: info.width,
    height: info.height,
  };
}