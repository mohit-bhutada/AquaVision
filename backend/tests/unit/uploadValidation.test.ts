import test from 'node:test';
import assert from 'node:assert/strict';
import { detectImageType, sanitizeFilename, validateImageUpload, MAX_UPLOAD_BYTES } from '../../src/lib/uploadValidation.js';
import { AppError } from '../../src/middleware/errorHandler.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);

test('detects real image types from magic bytes', () => {
  assert.equal(detectImageType(PNG)?.mime, 'image/png');
  assert.equal(detectImageType(JPG)?.mime, 'image/jpeg');
  assert.equal(detectImageType(WEBP)?.mime, 'image/webp');
});

test('rejects non-images even when named/declared as images', () => {
  assert.equal(detectImageType(Buffer.from('<?php system($_GET[1]); ?>')), null);
  assert.equal(detectImageType(Buffer.from('<svg onload=alert(1)></svg>')), null);
  assert.equal(detectImageType(Buffer.from('MZ\x90\x00executable')), null);
  assert.throws(() => validateImageUpload({ buffer: Buffer.from('not an image'), originalname: 'cat.png' }), (e: any) => e instanceof AppError && e.statusCode === 415);
});

test('rejects empty and missing uploads', () => {
  assert.throws(() => validateImageUpload(undefined), (e: any) => e.statusCode === 400);
  assert.throws(() => validateImageUpload({ buffer: Buffer.alloc(0) }), (e: any) => e.statusCode === 400);
});

test('rejects oversized uploads', () => {
  const big = Buffer.concat([PNG, Buffer.alloc(MAX_UPLOAD_BYTES)]);
  assert.throws(() => validateImageUpload({ buffer: big, originalname: 'a.png' }), (e: any) => e.statusCode === 413);
});

test('uses detected type, not client-declared extension', () => {
  const v = validateImageUpload({ buffer: PNG, originalname: 'evil.exe' });
  assert.equal(v.mime, 'image/png');
  assert.equal(v.filename, 'evil.png');
});

test('sanitizes path traversal and odd characters in filenames', () => {
  assert.equal(sanitizeFilename('../../etc/passwd', 'png'), 'passwd.png');
  assert.equal(sanitizeFilename('..\\..\\win\\sys.dll', 'jpg'), 'sys.jpg');
  assert.equal(sanitizeFilename('a b<script>.png', 'png'), 'a_b_script_.png');
  assert.equal(sanitizeFilename(undefined, 'webp'), 'upload.webp');
  assert.equal(sanitizeFilename('.hidden', 'png'), 'upload.png');
});
