import test from 'node:test';
import assert from 'node:assert/strict';
import { detectImageType, readImageInfo, sanitizeFilename, validateImageUpload, MAX_UPLOAD_BYTES } from '../../src/lib/uploadValidation.js';
import { makePng, makeJpeg } from '../helpers/images.js';

const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);
const code = (e: any) => e?.code;

test('detects JPEG and PNG from magic bytes', () => {
  assert.equal(detectImageType(makePng(10, 10))?.mime, 'image/png');
  assert.equal(detectImageType(makeJpeg(10, 10))?.mime, 'image/jpeg');
});

test('WebP is NOT supported (the ML service only accepts JPEG and PNG)', () => {
  assert.equal(detectImageType(webp), null);
  assert.throws(() => validateImageUpload({ buffer: webp, originalname: 'a.webp' }), (e: any) => e.statusCode === 415);
});

test('rejects non-images even when named/declared as images', () => {
  for (const b of [Buffer.from('<?php system($_GET[1]); ?>'), Buffer.from('<svg onload=alert(1)></svg>'), Buffer.from('MZ\x90\x00exe'), Buffer.from('GIF89a....')]) {
    assert.equal(detectImageType(b), null);
  }
  assert.throws(() => validateImageUpload({ buffer: Buffer.from('not an image'), originalname: 'cat.png' }), (e: any) => e.statusCode === 415);
});

test('reads real dimensions from PNG, baseline JPEG and progressive JPEG', () => {
  assert.deepEqual(readImageInfo(makePng(1920, 1080), { mime: 'image/png', extension: 'png' }), { width: 1920, height: 1080, animated: false });
  assert.deepEqual(readImageInfo(makeJpeg(1080, 1920), { mime: 'image/jpeg', extension: 'jpg' }), { width: 1080, height: 1920, animated: false });
  assert.deepEqual(readImageInfo(makeJpeg(800, 600, { progressive: true }), { mime: 'image/jpeg', extension: 'jpg' }), { width: 800, height: 600, animated: false });
});

test('accepts images exactly at the ML limits (1920x1080 = 2,073,600 px)', () => {
  assert.equal(validateImageUpload({ buffer: makeJpeg(1920, 1080), originalname: 'a.jpg' }).width, 1920);
  assert.equal(validateImageUpload({ buffer: makePng(1080, 1920), originalname: 'a.png' }).height, 1920);
  assert.equal(validateImageUpload({ buffer: makePng(800, 600), originalname: 'a.png' }).mime, 'image/png');
});

test('rejects images over the pixel budget or the per-side cap BEFORE any credit is used', () => {
  for (const [w, h] of [[2560, 1440], [3840, 2160], [4000, 3000], [5000, 100], [100, 5000]]) {
    assert.throws(() => validateImageUpload({ buffer: makeJpeg(w, h), originalname: 'a.jpg' }), (e: any) => code(e) === 'IMAGE_TOO_LARGE' && e.statusCode === 413, `${w}x${h}`);
  }
  assert.throws(() => validateImageUpload({ buffer: makePng(1921, 1081), originalname: 'a.png' }), (e: any) => code(e) === 'IMAGE_TOO_LARGE');
});

test('rejects animated PNG and unreadable headers', () => {
  assert.throws(() => validateImageUpload({ buffer: makePng(10, 10, { animated: true }), originalname: 'a.png' }), (e: any) => e.statusCode === 415);
  // valid signature but truncated: no readable dimensions
  assert.throws(() => validateImageUpload({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]), originalname: 'a.jpg' }), (e: any) => e.statusCode === 415);
  assert.throws(() => validateImageUpload({ buffer: makePng(0, 0), originalname: 'a.png' }), (e: any) => e.statusCode === 415);
});

test('rejects empty/missing uploads and oversized files', () => {
  assert.throws(() => validateImageUpload(undefined), (e: any) => e.statusCode === 400);
  assert.throws(() => validateImageUpload({ buffer: Buffer.alloc(0) }), (e: any) => e.statusCode === 400);
  assert.throws(() => validateImageUpload({ buffer: makePng(100, 100, { padBytes: MAX_UPLOAD_BYTES }), originalname: 'a.png' }), (e: any) => e.statusCode === 413 && code(e) === 'FILE_TOO_LARGE');
});

test('uses the detected type, not the client-declared extension; sanitizes filenames', () => {
  const v = validateImageUpload({ buffer: makePng(64, 64), originalname: 'evil.exe' });
  assert.equal(v.mime, 'image/png');
  assert.equal(v.filename, 'evil.png');
  assert.equal(sanitizeFilename('../../etc/passwd', 'png'), 'passwd.png');
  assert.equal(sanitizeFilename('..\\..\\win\\sys.dll', 'jpg'), 'sys.jpg');
  assert.equal(sanitizeFilename('a b<script>.png', 'png'), 'a_b_script_.png');
  assert.equal(sanitizeFilename(undefined, 'png'), 'upload.png');
});
