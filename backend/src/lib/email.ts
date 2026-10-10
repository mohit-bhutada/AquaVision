import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from './logger.js';
import { AppError } from '../middleware/errorHandler.js';

interface SendOtpOptions {
  to: string;
  otp: string;
  purpose: 'SIGNUP' | 'PASSWORD_RESET';
}

function createTransporter() {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return null;
  }
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
    // Fail fast instead of hanging the request (and the user's loading screen) if the SMTP
    // server cannot be reached from this runtime.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Gmail API (HTTPS) sender: sends from your own Gmail account without SMTP, which Cloudflare
// Workers cannot use. Needs GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN.
// Gmail itself enforces its sending limit (about 500/day for a personal account).
// ---------------------------------------------------------------------------
let cachedGmailToken: { token: string; expiresAt: number } | null = null;

const stripLineBreaks = (v: string): string => v.replace(/[\r\n]+/g, ' ').trim();

async function getGmailAccessToken(): Promise<string> {
  if (cachedGmailToken && cachedGmailToken.expiresAt > Date.now() + 60_000) {
    return cachedGmailToken.token;
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID || '',
      client_secret: process.env.GMAIL_CLIENT_SECRET || '',
      refresh_token: process.env.GMAIL_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Gmail token refresh failed: HTTP ${res.status} ${detail}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Gmail token refresh returned no access_token');
  cachedGmailToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}

function toBase64Lines(text: string): string {
  return (Buffer.from(text, 'utf8').toString('base64').match(/.{1,76}/g) || []).join('\r\n');
}

function buildRawMimeMessage(from: string, to: string, subject: string, html: string, text: string): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(stripLineBreaks(subject), 'utf8').toString('base64')}?=`;
  const boundary = `av_${globalThis.crypto.randomUUID().replace(/-/g, '')}`;
  // multipart/alternative with BOTH a plain-text and an HTML part. HTML-only mail is a common
  // spam-filter trigger; every legitimate transactional message ships a text version too.
  const message = [
    `From: ${stripLineBreaks(from)}`,
    `To: ${stripLineBreaks(to)}`,
    `Subject: ${encodedSubject}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    toBase64Lines(text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    toBase64Lines(html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return Buffer.from(message, 'utf8').toString('base64url');
}

async function sendViaGmailApi(from: string, to: string, subject: string, html: string, text: string): Promise<void> {
  const accessToken = await getGmailAccessToken();
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: buildRawMimeMessage(from, to, subject, html, text) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    if (res.status === 401) cachedGmailToken = null;
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Gmail API send failed: HTTP ${res.status} ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Mail relay (Vercel function running Nodemailer + Gmail SMTP). Workers cannot make SMTP connections,
// so the Worker sends the finished message over HTTPS to POST {VERCEL_API_URL}/api/send-email,
// authenticated with the shared secret INTERNAL_API_KEY. Gmail credentials only exist on Vercel.
// ---------------------------------------------------------------------------
async function sendViaMailRelay(baseUrl: string, apiKey: string, to: string, subject: string, text: string, html: string): Promise<void> {
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseUrl);
  if (!baseUrl.startsWith('https://') && !isLocal) {
    throw new Error('VERCEL_API_URL must be an https:// URL (the shared secret is sent with every request).');
  }
  if (apiKey.length < 32) {
    throw new Error('INTERNAL_API_KEY must be at least 32 characters.');
  }
  const res = await fetch(`${baseUrl}/api/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ to, subject, text, html }),
    // never follow a redirect: it would forward the Authorization header to another address
    redirect: 'manual',
    signal: AbortSignal.timeout(25_000),
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`Mail relay URL redirected (HTTP ${res.status}) to "${res.headers.get('location') || 'unknown'}". Use the final custom-domain URL in VERCEL_API_URL, not the vercel.app one.`);
  }
  if (res.headers.get('x-aquavision-relay') !== '1') {
    throw new Error(`HTTP ${res.status} did not come from the mail function (is /api/send-email being proxied to the Worker instead of served by Vercel?).`);
  }
  if (!res.ok) {
    throw new Error(`Mail relay responded HTTP ${res.status}`);
  }
}

export async function sendOtpEmail(options: SendOtpOptions): Promise<void> {
  const { to, otp, purpose } = options;
  const isSignup = purpose === 'SIGNUP';
  const subject = isSignup
    ? 'Verify your AquaVision account'
    : 'Reset your AquaVision password';

  const titleText = isSignup
    ? 'Welcome to AquaVision'
    : 'AquaVision Password Reset';

  const bodyText = isSignup
    ? 'Thank you for signing up for AquaVision. Use the 6-digit verification code below to confirm your account creation:'
    : 'We received a request to reset your AquaVision password. Use the 6-digit verification code below to proceed:';

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; background-color: #0b0f19; color: #f3f4f6; border-radius: 16px; border: 1px solid #1f293d;">
      <div style="margin-bottom: 24px;">
        <span style="font-size: 24px; font-weight: 700; color: #38bdf8; letter-spacing: -0.5px;">AquaVision</span>
      </div>
      <h1 style="font-size: 20px; font-weight: 600; color: #ffffff; margin-bottom: 16px;">${titleText}</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #9ca3af; margin-bottom: 24px;">${bodyText}</p>
      
      <div style="background-color: #111827; border: 1px solid #374151; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #38bdf8;">${otp}</span>
      </div>

      <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">
        This code is valid for <strong>10 minutes</strong>.
      </p>
      <p style="font-size: 12px; color: #4b5563; margin-top: 24px; border-top: 1px solid #1f293d; padding-top: 16px;">
        If you did not request this code, please ignore this email.
      </p>
    </div>
  `;

  const textContent = [
    titleText,
    '',
    bodyText,
    '',
    `Your verification code: ${otp}`,
    '',
    'This code is valid for 10 minutes.',
    '',
    'If you did not request this code, please ignore this email.',
    '',
    '- The AquaVision team',
  ].join('\n');

  const fromAddress = `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`;

  const relayBase = (process.env.VERCEL_API_URL || '').trim().replace(/\/+$/, '');
  const relayKey = (process.env.INTERNAL_API_KEY || '').trim();
  if (relayBase && relayKey) {
    try {
      await sendViaMailRelay(relayBase, relayKey, to, subject, textContent, htmlContent);
    } catch (err) {
      logger.error(`Failed to send OTP email via mail relay to ${to}: ${(err as Error).message}`, undefined, 'EmailService');
      throw new AppError('Unable to send the verification email. Please try again shortly.', 500, 'EMAIL_SEND_FAILED');
    }
    logger.info(`OTP email sent via mail relay to ${to} (${purpose})`, undefined, 'EmailService');
    return;
  }

  // Preferred path on Cloudflare Workers: Workers cannot open raw SMTP (TCP) connections to most
  // mail servers, so when RESEND_API_KEY is set the mail is sent over HTTPS instead.
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: fromAddress, to: [to], subject, html: htmlContent }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      logger.error(`Failed to reach Resend API for ${to}: ${(err as Error).message}`, undefined, 'EmailService');
      throw new AppError('Unable to send the verification email. Please try again shortly.', 500, 'EMAIL_SEND_FAILED');
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      logger.error(`Resend API rejected email to ${to}: HTTP ${response.status} ${detail}`, undefined, 'EmailService');
      throw new AppError('Unable to send the verification email. Please try again shortly.', 500, 'EMAIL_SEND_FAILED');
    }
    logger.info(`OTP email sent via Resend to ${to} (${purpose})`, undefined, 'EmailService');
    return;
  }

  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
    try {
      await sendViaGmailApi(fromAddress, to, subject, htmlContent, textContent);
    } catch (err) {
      logger.error(`Failed to send OTP email via Gmail API to ${to}: ${(err as Error).message}`, undefined, 'EmailService');
      throw new AppError('Unable to send the verification email. Please try again shortly.', 500, 'EMAIL_SEND_FAILED');
    }
    logger.info(`OTP email sent via Gmail API to ${to} (${purpose})`, undefined, 'EmailService');
    return;
  }

  const transporter = createTransporter();

  if (!transporter) {
    logger.error('No email provider configured (set VERCEL_API_URL + INTERNAL_API_KEY, GMAIL_* credentials, RESEND_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS)', undefined, 'EmailService');
    throw new AppError('Email service is not configured.', 500, 'EMAIL_CONFIGURATION_ERROR');
  }

  try {
    await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html: htmlContent,
    });
    logger.info(`OTP email sent via Nodemailer SMTP to ${to} (${purpose})`, undefined, 'EmailService');
  } catch (err) {
    logger.error(`Failed to send OTP email via SMTP to ${to}: ${(err as Error).message}`, undefined, 'EmailService');
    throw new AppError('Unable to send the verification email. Please try again shortly.', 500, 'EMAIL_SEND_FAILED');
  }
}

export async function sendSignupOtp(to: string, otp: string): Promise<void> {
  return sendOtpEmail({ to, otp, purpose: 'SIGNUP' });
}

export async function sendPasswordResetOtp(to: string, otp: string): Promise<void> {
  return sendOtpEmail({ to, otp, purpose: 'PASSWORD_RESET' });
}