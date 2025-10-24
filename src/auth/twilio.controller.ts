import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { Public } from './public.decorator';
import { TwilioService } from './twilio.service';

class SendVerifyDto {
  phone!: string;
  channel?: 'sms' | 'call' | 'voice';
}
class CheckVerifyDto {
  phone!: string;
  code!: string;
}

@Controller('auth/twilio')
export class TwilioController {
  constructor(private readonly twilio: TwilioService) {}

  @Public()
  @Post('send')
  async send(@Body() body: SendVerifyDto) {
    if (!body?.phone) throw new UnauthorizedException('phone is required');
    const channel = body.channel || 'sms';
    const res = await this.twilio.sendVerification(body.phone, channel as any);
    return res;
  }

  @Public()
  @Post('verify')
  async verify(@Body() body: CheckVerifyDto) {
    if (!body?.phone || !body?.code) throw new UnauthorizedException('phone and code are required');
    const res = await this.twilio.verifyCode(body.phone, body.code);
    return res;
  }
}
