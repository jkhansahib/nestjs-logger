import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class AuthEmailService {
  constructor(private readonly logger: LoggerService) {}

  async sendMailViaSendgrid(to: string, subject: string, text: string, html?: string) {
    if (!process.env.SENDGRID_API_KEY) {
      this.logger.error('SendGrid API key not configured');
      throw new Error('Email provider not configured');
    }

    const sg = require('@sendgrid/mail');
    sg.setApiKey(process.env.SENDGRID_API_KEY);

    const msg: any = {
      to,
      from: process.env.SENDGRID_FROM,
      subject,
      text,
      html,
    };

    try {
      await sg.send(msg);
      this.logger.debug?.(`Auth email sent to ${to} subject=${subject}`);
      return { ok: true };
    } catch (err: any) {
      this.logger.error('Auth email send failed', err);
      throw err;
    }
  }

  async sendMailViaSES(to: string, subject: string, text: string, html?: string) {
    try {
      const smtpUser = process.env.SES_SMTP_USER || process.env.AWS_SMTP_USER || process.env.SES_SMTP_USERNAME;
      const smtpPass = process.env.SES_SMTP_PASS || process.env.AWS_SMTP_PASS || process.env.SES_SMTP_PASSWORD;
      if (!smtpUser || !smtpPass) {
        this.logger.error('SMTP credentials not configured (SES_SMTP_USER / SES_SMTP_PASS)');
        throw new Error('SMTP credentials not configured');
      }

      const nodemailer = require('nodemailer');
      const host = process.env.SES_SMTP_HOST || 'email-smtp.us-east-1.amazonaws.com';
      const port = Number(process.env.SES_SMTP_PORT) || 587;
      const secure = port === 465; // true for 465, false for 587

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const from = process.env.SES_FROM || 'no-reply@example.com';
      const mailOptions: any = { from, to, subject, text };
      if (html) mailOptions.html = html;

      const info = await transporter.sendMail(mailOptions);
      this.logger.debug?.(`Auth SMTP email sent to ${to} messageId=${info?.messageId || 'unknown'}`);
      return { ok: true, messageId: info?.messageId };
    } catch (err: any) {
      this.logger.error('Auth SMTP email send failed', err);
      throw err;
    }
  }
}
