// src/auth/auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { Logger } from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import { platform } from 'os';
// import { SupabaseAuthProvider } from './supabase-auth.provider';
// inject by the exported token name from AuthModule
// the provider token is the string 'AuthProvider'

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  // Safe stringify to handle BigInt in logged objects
  private safeStringify(obj: any): string {
    try {
      return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    } catch (err) {
      try { return String(obj); } catch (_e) { return '[unserializable]'; }
    }
  }

  constructor(
    private reflector: Reflector,
    @Inject('AuthProvider') private readonly authProvider: any,
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

      // Prefer verifying tokens via the AuthProvider (Supabase) since tokens are Supabase-issued
      let verifiedByProvider = false;

      // if (this.authProvider && typeof this.authProvider.verifyToken === 'function') {
      //   const providerIsSupabase =  this.authProvider?.constructor?.name === 'SupabaseAuthProvider';
      //   if (providerIsSupabase) this.logger.log('Using SupabaseAuthProvider for token verification');
      //   try {
      //     const introspect = await this.authProvider.verifyToken(token);

      //     // Support two shapes:
      //     // 1) { active: boolean, payload?: any }
      //     // 2) direct Supabase user object
      //     let payload: any = null;
      //     if (introspect && typeof introspect === 'object') {
      //       if ('active' in introspect) {
      //         if (!introspect.active) {
      //           this.logger.log('Provider reported token inactive/invalid');
      //         } else {
      //           payload = (introspect as any).payload || introspect;
      //         }
      //       } else {
      //         // treat returned object as the user payload
      //         payload = introspect;
      //       }
      //     }

      //     if (payload) {
      //       const userId = payload?.sub || payload?.id || payload?.user?.id || payload?.id;
      //       const email = payload?.email || payload?.user?.email || payload?.email;
      //       const roles = payload?.roles || payload?.user?.roles || (payload?.user_metadata && payload.user_metadata.role ? [payload.user_metadata.role] : []);

      //       request.user = { id: userId, email, roles, role: Array.isArray(roles) && roles.length > 0 ? roles[0] : 'user' };
      //       this.logger.debug('Auth Guard: User: ' + this.safeStringify(request.user));
      //       this.logger.log(`✔️ Verified provider token for user ${userId}`);
      //       verifiedByProvider = true;
      //     }
      //   } catch (err) {
      //     this.logger.log('Provider token verification failed, will try server token as fallback', err?.message || err);
      //   }
      // } else {
      //   this.logger.log('No auth provider available to verify access token; will try server token fallback');
      // }

      // If provider didn't verify, fall back to server-signed JWT verification (legacy path)
      if (!verifiedByProvider) {
        try {
          const secret = process.env.JWT_SECRET || 'dev-secret';
          const decoded = verify(token, secret) as any;
          this.logger.debug('Auth Guard: Decoded server token: ' + this.safeStringify(decoded));
          if (decoded && decoded.id) {
            this.logger.log('Auth Guard: User Roles: ' + decoded.roles);
            const role = decoded.roles && decoded.roles.length > 0 ? decoded.roles[0] : (decoded.role || 'user');
            // Form User object
            let user = {
              id: decoded.id,
              email: decoded.email,
              brand: decoded.brand || 'vumber',
              roles: decoded.roles || [],
              buildNumber : decoded.buildNumber || null,
              platform: decoded.platform || null,
              userDeviceId: decoded.userDeviceId || null
            }
            request.user = user;
            this.logger.log(`✔️ Verified server token for user ${decoded.sub}`);
            verifiedByProvider = true;
          }
        } catch (err) {
          this.logger.log('Server token verification failed');
        }
      }

      if (!verifiedByProvider) {
        throw new UnauthorizedException('Invalid token');
      }

      this.logger.log(`User roles: ${this.safeStringify(request.user?.roles)}`);
      // Role check
      const requiredRoles = this.reflector.getAllAndOverride<string[]>(
        ROLES_KEY,
        [context.getHandler(), context.getClass()],
      );
      this.logger.log(`Required roles for route: ${requiredRoles}`);
      
      if (requiredRoles && requiredRoles.length > 0) {
        const userRoles: string[] = Array.isArray(request.user?.roles)
          ? request.user.roles
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
      this.logger.error('Auth Guard Error:', this.safeStringify(error));
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
