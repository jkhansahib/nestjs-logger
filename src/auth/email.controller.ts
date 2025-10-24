import { Controller, Post, Body } from '@nestjs/common';
import { AuthEmailService } from './email.service';
import { Public } from './public.decorator';

@Controller('auth/email')
export class AuthEmailController {
  constructor(private readonly emailService: AuthEmailService) {}

  @Public()
  @Post('send')
  async send(@Body() body: { to: string; subject: string; text?: string; html?: string }) {
    const { to, subject, text, html } = body;
    return this.emailService.sendMailViaSendgrid(to, subject, text || '', html);
    // return this.emailService.sendMailViaSES(to, subject, text || '', html);
  }
}
