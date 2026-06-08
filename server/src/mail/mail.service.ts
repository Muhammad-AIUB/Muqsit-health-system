import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

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
    const from =
      this.config.get<string>('MAIL_FROM') ?? 'Muqsit Health System <no-reply@muqsit.local>';
    const subject = 'Your Muqsit Health System verification code';
    const text = `Your Muqsit Health System email verification code is ${code}. It expires soon.`;
    const html = `
      <div style="font-family:sans-serif;max-width:420px;margin:auto">
        <h2 style="color:#0F6E56">Muqsit Health System email verification</h2>
        <p>Use the code below to verify your email address:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#1A1A1A">${code}</p>
        <p style="color:#6B6B6B;font-size:13px">If you did not request this, you can ignore this email.</p>
      </div>`;

    if (!this.transporter) {
      // Dev fallback: surface the code so the flow can be tested without SMTP.
      this.logger.log(`[DEV OTP] ${email} -> ${code}`);
      return;
    }

    await this.transporter.sendMail({ from, to: email, subject, text, html });
  }
}
