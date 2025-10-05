import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SupabaseAuthProvider } from './supabase-auth.provider';
import { AuthUserService } from './user.service';

@Module({
  controllers: [AuthController],
  providers: [AuthGuard, AuthService, AuthUserService, { provide: 'AuthProvider', useClass: SupabaseAuthProvider }],
  exports: [AuthService, 'AuthProvider', AuthUserService], // export AuthProvider token and AuthUserService
})
export class AuthModule {}
