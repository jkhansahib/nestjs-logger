// src/auth/auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseAuthService } from './auth.service';
import { ROLES_KEY } from './roles.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { Logger } from '@nestjs/common';
import { verify } from 'jsonwebtoken';


@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  constructor(
    private reflector: Reflector,
    private supabaseAuth: SupabaseAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const isPublic = this.reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (isPublic) {
        this.logger.log('✅ Public route, skipping auth guard');
        return true;
      }

      const request = context.switchToHttp().getRequest();
      this.logger.log(`🔐 Incoming request to ${request.url}`);
      const authHeader = request.headers['authorization'];

      if (!authHeader) throw new UnauthorizedException('Missing Authorization header');

      const token = authHeader.split(' ')[1];
      if (!token) throw new UnauthorizedException('Invalid token');

      // First, try verifying our server-signed JWT (contains roles)
      try {
        const secret = process.env.JWT_SECRET || 'dev-secret';
        const decoded = verify(token, secret) as any;
        if (decoded && decoded.sub) {
          // attach user from server token
          const role = decoded.roles && decoded.roles.length > 0 ? decoded.roles[0] : (decoded.role || 'user');
          request.user = { id: decoded.sub, email: decoded.email, role, roles: decoded.roles || [] };
          this.logger.log(`✔️ Verified server token for user ${decoded.sub}`);
        }
      } catch (err) {
        // Not a server token or invalid — fall back to Supabase access token
        this.logger.log('Server token verification failed, falling back to Supabase access token');

        // 1️⃣ Get user from Supabase access token
        const user = await this.supabaseAuth.getUserFromAccessToken(token);
        if (!user) throw new UnauthorizedException('Invalid user');

        // ✅ fetch role from profile using the service method
        const profile = await this.supabaseAuth.getProfile(user.id);

        // attach user + profile
        request.user = { ...user, role: profile?.role || 'user' };
      }

      // 3️⃣ Role check
      const requiredRoles = this.reflector.getAllAndOverride<string[]>(
        ROLES_KEY,
        [context.getHandler(), context.getClass()],
      );

      if (requiredRoles && requiredRoles.length > 0) {
        // normalize user's roles to an array for checks
        const userRoles: string[] = Array.isArray(request.user?.roles)
          ? request.user.roles
          : request.user?.role
          ? [request.user.role]
          : [];

        const hasRequired = requiredRoles.some((r) => userRoles.includes(r));
        if (!hasRequired) {
          throw new ForbiddenException(
            `You need one of the following roles: ${requiredRoles.join(', ')}`,
          );
        }
      }

      return true;
    } catch (error) {
      this.logger.error('Auth Guard Error:', error);
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
