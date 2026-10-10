// Vercel Serverless Function: the ONLY place Nodemailer runs.
//
// Why it exists: Cloudflare Workers cannot open SMTP connections, so the AquaVision backend (a Worker)
// generates and hashes the OTP itself, then hands the plain-text message to this function over HTTPS.
// This function holds the Gmail credentials; the Worker never sees them.
//
// Required Vercel environment variables (Project -> Settings -> Environment Variables):
//   EMAIL_USER          Gmail address that sends the mail
//   EMAIL_APP_PASSWORD  Gmail App Password (16 characters, not your normal password)
//   INTERNAL_API_KEY    long random secret (>= 32 chars), identical to the Worker's INTERNAL_API_KEY secret
// Optional: EMAIL_FROM_NAME (default "AquaVision"), EMAIL_SERVICE (default "gmail")
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

const EMAIL_RE = /^[^\s@<>(),;:\\"']+@[^\s@<>(),;:\\"']+\.[^\s@<>(),;:\\"']{2,}$/;
const HAS_LINE_BREAK = /[\r\n]/;
const MAX = { to: 254, subject: 200, text: 20_000, html: 100_000 };

// Best-effort abuse limits (per warm instance). The shared secret is the real gate.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_RECIPIENT = 4;
const MAX_TOTAL = 120;
const sent = []; // { to, at }

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: (process.env.EMAIL_APP_PASSWORD || '').replace(/\s+/g, '') },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

/** Constant-time comparison so the key cannot be guessed byte by byte from response timing. */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-AquaVision-Relay', '1'); // lets the backend confirm it really reached this function
  return res.status(status).json(body);
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid body';
  const { to, subject, text, html } = body;
  if (typeof to !== 'string' || to.length > MAX.to || HAS_LINE_BREAK.test(to) || !EMAIL_RE.test(to)) return 'Invalid recipient';
  if (typeof subject !== 'string' || !subject.trim() || subject.length > MAX.subject || HAS_LINE_BREAK.test(subject)) return 'Invalid subject';
  if (typeof text !== 'string' || !text.trim() || text.length > MAX.text) return 'Invalid text';
  if (html !== undefined && (typeof html !== 'string' || html.length > MAX.html)) return 'Invalid html';
  return null;
}

function overLimit(to) {
  const cutoff = Date.now() - WINDOW_MS;
  while (sent.length && sent[0].at < cutoff) sent.shift();
  return sent.length >= MAX_TOTAL || sent.filter((s) => s.to === to.toLowerCase()).length >= MAX_PER_RECIPIENT;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Method not allowed' });
  }

  const key = process.env.INTERNAL_API_KEY || '';
  if (key.length < 32 || !process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.error('send-email: relay is not configured (INTERNAL_API_KEY >= 32 chars, EMAIL_USER, EMAIL_APP_PASSWORD).');
    return reply(res, 503, { error: 'Mail relay is not configured' });
  }
  if (!safeEqual(req.headers.authorization || '', `Bearer ${key}`)) {
    return reply(res, 401, { error: 'Unauthorized' });
  }

  const problem = validate(req.body);
  if (problem) return reply(res, 400, { error: problem });
  const { to, subject, text, html } = req.body;

  if (overLimit(to)) return reply(res, 429, { error: 'Too many emails requested. Try again later.' });

  const fromName = String(process.env.EMAIL_FROM_NAME || 'AquaVision').replace(/[\r\n"<>]/g, '').slice(0, 60) || 'AquaVision';
  try {
    await getTransporter().sendMail({ from: `"${fromName}" <${process.env.EMAIL_USER}>`, to, subject, text, ...(html ? { html } : {}) });
    sent.push({ to: to.toLowerCase(), at: Date.now() });
    return reply(res, 200, { success: true });
  } catch (err) {
    // Details stay in the Vercel logs; the caller only learns that sending failed.
    console.error('send-email: SMTP failure', err && err.code, err && err.responseCode);
    return reply(res, 502, { error: 'Email send failed' });
  }
}
