import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SupabaseAuthProvider } from './supabase-auth.provider';
import { AuthUserService } from './user.service';
import { TwilioService } from './twilio.service';
import { TwilioController } from './twilio.controller';
import { AuthEmailService } from './email.service';
import { AuthEmailController } from './email.controller';
import { UserDevicesService } from './user-devices.service';

@Module({
  controllers: [AuthController, TwilioController, AuthEmailController],
  providers: [AuthGuard, AuthService, AuthUserService, TwilioService, AuthEmailService, UserDevicesService, { provide: 'AuthProvider', useClass: SupabaseAuthProvider }],
  exports: [AuthService, 'AuthProvider', AuthUserService, TwilioService, AuthEmailService, UserDevicesService], // export AuthProvider token and AuthUserService
})
export class AuthModule {}
