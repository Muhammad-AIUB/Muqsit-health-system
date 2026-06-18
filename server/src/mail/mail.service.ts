import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  // Keep the sender identity consistent (name + address on the same brand /
  // domain) — a mismatch is a classic spam/phishing signal. Override via env.
  private get from(): string {
    return (
      this.config.get<string>('MAIL_FROM') ??
      'Muqsit Health System <no-reply@muqsithealthsystem.com>'
    );
  }

  // A monitored reply address improves deliverability and trust. Optional.
  private get replyTo(): string | undefined {
    return this.config.get<string>('MAIL_REPLY_TO') ?? undefined;
  }

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
        secure: Number(this.config.get<string>('SMTP_PORT') ?? 587) === 465,
        auth: { user, pass },
      });
    } else {
      this.logger.warn(
        'SMTP not configured — verification codes will be logged to the console instead of emailed.',
      );
    }
  }

  async sendVerificationOtp(email: string, code: string): Promise<void> {
    const subject = `${code} is your Muqsit Health System verification code`;
    const text =
      `Your Muqsit Health System email verification code is ${code}. It expires in 10 minutes.\n\n` +
      `If you did not request this, you can ignore this email.\n\n` +
      `— Muqsit Health System`;
    const html = `
      <div style="font-family:sans-serif;max-width:420px;margin:auto">
        <h2 style="color:#0F6E56">Muqsit Health System email verification</h2>
        <p>Use the code below to verify your email address:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#1A1A1A">${code}</p>
        <p style="color:#6B6B6B;font-size:13px">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
        <hr style="border:none;border-top:1px solid #E5E5E3;margin:18px 0" />
        <p style="color:#999;font-size:11px">Muqsit Health System — this is an automated message sent because someone entered this address to register.</p>
      </div>`;

    if (!this.transporter) {
      // Dev fallback: surface the code so the flow can be tested without SMTP.
      this.logger.log(`[DEV OTP] ${email} -> ${code}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject,
      text,
      html,
      replyTo: this.replyTo,
    });
  }

  // Sent when an admin approves a registration — the account is now active.
  async sendAccountApproved(email: string, name: string): Promise<void> {
    const subject = 'Your Muqsit Health System account is activated';
    const text = `Dear ${name}, your Muqsit Health System account has been approved and activated. You can now sign in with your email or phone number.`;
    const html = `
      <div style="font-family:sans-serif;max-width:420px;margin:auto">
        <h2 style="color:#0F6E56">Account activated ✓</h2>
        <p>Dear ${name},</p>
        <p>Your Muqsit Health System account has been <b>approved and activated</b>.</p>
        <p>You can now sign in with your email or phone number.</p>
        <p style="color:#6B6B6B;font-size:13px">If you did not register for this account, please contact support.</p>
      </div>`;

    if (!this.transporter) {
      this.logger.log(`[DEV MAIL] account approved -> ${email}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject,
      text,
      html,
      replyTo: this.replyTo,
    });
  }
}
