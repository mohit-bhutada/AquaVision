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
  });
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

  const fromAddress = `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`;
  const transporter = createTransporter();

  if (!transporter) {
    logger.error('SMTP configuration missing in environment variables', undefined, 'EmailService');
    throw new AppError('SMTP email service is not configured.', 500, 'EMAIL_CONFIGURATION_ERROR');
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

