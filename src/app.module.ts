import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerModule } from './logger/logger.module'; // ✅ Import your logger module
import { AuthModule } from './auth/auth.module';  // ✅ Import AuthModule
import { APP_GUARD } from '@nestjs/core';
import { SupabaseAuthGuard as AuthGuard } from './auth/auth.guard'; // ✅ Import your global auth guard
import { UserModule } from './user/user.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), // ✅ load .env
    LoggerModule, AuthModule,UserModule], // ✅ Add here
  controllers: [AppController],
  providers: [AppService,{
      provide: APP_GUARD,
      useClass: AuthGuard, // ✅ applies to all controllers/routes
    },],
})
export class AppModule {}
