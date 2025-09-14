import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SupabaseAuthService } from './auth.service';
import { SupabaseAuthGuard } from './auth.guard';

@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthService, SupabaseAuthGuard],
  exports: [SupabaseAuthService], // export if other modules need it
})
export class AuthModule {}
