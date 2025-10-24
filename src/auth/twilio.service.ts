import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';

// Lazy import Twilio to avoid requiring the package at module load time.
let TwilioClient: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  TwilioClient = require('twilio');
} catch (e) {
  TwilioClient = null;
}

@Injectable()
export class TwilioService {
  private client: any;
  private serviceSid?: string;

  constructor(private readonly loggerService: LoggerService) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    this.serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (TwilioClient && sid && token) {
      try {
        this.client = TwilioClient(sid, token);
        this.loggerService?.debug?.('TwilioService: client initialized');
      } catch (err) {
        this.loggerService?.error?.('TwilioService: failed to initialize client', err);
        this.client = null;
      }
    } else {
      this.loggerService?.warn?.('TwilioService not fully configured (missing package or env vars)');
    }
  }

  // Send verification code to phone using Twilio Verify
  async sendVerification(phone: string, channel: 'sms' | 'call' | 'voice' = 'sms') {
    if (!this.client) throw new Error('Twilio client not configured');
    if (!this.serviceSid) throw new Error('TWILIO_VERIFY_SERVICE_SID not configured');
    if (!phone) throw new Error('phone required');

    try {
      const res = await this.client.verify.services(this.serviceSid).verifications.create({ to: phone, channel });
      // Normalize
      return { ok: true, sid: res.sid, status: res.status };
    } catch (err: any) {
      this.loggerService?.error?.('Twilio sendVerification error', err);
      // Normalize common Twilio Verify errors into structured object
      const code = err?.code || err?.status || 'twilio_error';
      const message = err?.message || String(err);
      throw Object.assign(new Error('Twilio verification send failed'), { code, message });
    }
  }

  // Verify the code for a phone
  async verifyCode(phone: string, code: string) {
    if (!this.client) throw new Error('Twilio client not configured');
    if (!this.serviceSid) throw new Error('TWILIO_VERIFY_SERVICE_SID not configured');
    if (!phone || !code) throw new Error('phone and code required');

    try {
      const res = await this.client.verify.services(this.serviceSid).verificationChecks.create({ to: phone, code });
      // res.status could be 'approved' on success
      const success = String(res.status).toLowerCase() === 'approved';
      return { ok: success, status: res.status, sid: res.sid, data: res };
    } catch (err: any) {
      this.loggerService?.error?.('Twilio verifyCode error', err);
      const codeErr = err?.code || err?.status || 'twilio_error';
      const message = err?.message || String(err);
      throw Object.assign(new Error('Twilio verification check failed'), { code: codeErr, message });
    }
  }
}
