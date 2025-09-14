import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';

@Injectable()
export class SupabaseAuthService {
  private supabase: SupabaseClient;
  private prisma: PrismaClient;

    // Using NestJS Logger for logging
  // This will utilize the Winston logger configured in main.ts
  private readonly logger = new Logger(SupabaseAuthService.name);

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
    );

    // Initialize Prisma client (uses DATABASE_URL from env)
    this.prisma = new PrismaClient();
  }

  // parseExpiresIn: helper to convert number/string like '1h'|'30m'|'3600' to seconds
  private parseExpiresIn(expiresIn: string | number): number {
    if (typeof expiresIn === 'number') return expiresIn;
    if (typeof expiresIn !== 'string') return 3600;
    const s = expiresIn.trim();
    if (/^\d+$/.test(s)) return Number(s);
    const n = Number(s.slice(0, -1));
    const unit = s.slice(-1);
    if (isNaN(n)) return 3600;
    if (unit === 'h') return n * 3600;
    if (unit === 'm') return n * 60;
    if (unit === 's') return n;
    return 3600;
  }

  // --- sign up
  async signUp(email: string, password: string) {
    this.logger.log('Attempting to sign up user with email: ' + email);
    try {
        const { data, error } = await this.supabase.auth.signUp({ email, password });
        if (error) throw new UnauthorizedException(error.message);

        // Sync with role tables in your DB using Prisma
        const userId = (data as any)?.user?.id;
        if (userId) {
          try {
            // create or update SupaUsers
            await this.prisma.supaUser.upsert({
              where: { id: userId },
              // SupaUser model uses `username` column — store email as username
              create: { id: userId, username: email },
              update: { username: email },
            });

            // ensure default 'user' role exists
            const role = await this.prisma.supaRole.upsert({
              where: { name: 'user' },
              create: { name: 'user' },
              update: {},
            });

            // link user -> role if not already linked
            const existing = await this.prisma.supaUserRole.findFirst({
              where: { userId, roleId: role.id },
            });
            if (!existing) {
              await this.prisma.supaUserRole.create({
                data: { userId, roleId: role.id },
              });
            }
          } catch (err) {
            this.logger.error('Failed to sync signup to role tables: ' + (err?.message || String(err)));
          }
        }

        return data; // { user, session }
    } catch (error) {
        this.logger.error('Error during sign up: ' + error.message.toString(), error.stack);
        throw error;    
    }
    
  }

  // --- sign in
  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw new UnauthorizedException(error.message);
    this.logger.log('before update ', data);
    // attach role(s) from DB (Prisma) if available
    try {
      const userId = (data as any)?.user?.id;
      if (userId) {
        const roles = await this.getRolesForUser(userId);
        if ((data as any).user) {
          (data as any).user.roles = roles;
          (data as any).user.role = roles && roles.length > 0 ? roles[0] : 'user';

          // create a server-signed JWT containing roles
          try {
            const secret = process.env.JWT_SECRET || 'dev-secret';
            const expiresIn = process.env.JWT_EXPIRES_IN || '1h';
            const expiresSeconds = this.parseExpiresIn(expiresIn);
            const payload = { sub: userId, email: (data as any).user.email, roles };
            const serverToken = sign(payload, secret, { expiresIn });
            (data as any).server_token = serverToken;

            // replace the Supabase session access_token with our server token if session exists
            if ((data as any).session) {
              (data as any).session.access_token = serverToken;
              (data as any).session.expires_in = expiresSeconds;
              (data as any).session.expires_at = Math.floor(Date.now() / 1000) + expiresSeconds;
            }

          } catch (err) {
            this.logger.error('Failed to sign server JWT: ' + (err?.message || String(err)));
          }
        }
      }
    } catch (err) {
      this.logger.error('Failed to fetch roles after signIn: ' + (err?.message || String(err)));
    }
    this.logger.log('after update ' , data);
    return data; // { user, session, server_token }
  }

  // New: signInBase - raw Supabase sign-in without server token/role augmentation
  async signInBase(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw new UnauthorizedException(error.message);
    return data; // raw { user, session }
  }

  // --- sign out
  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw new UnauthorizedException(error.message);
  }

  // --- ✅ method you need in guard
  async getUserFromAccessToken(accessToken: string): Promise<User> {
    const { data, error } = await this.supabase.auth.getUser(accessToken);
    if (error || !data.user) throw new UnauthorizedException(error?.message || 'Invalid token');
    return data.user;
  }

  // --- refresh
  async refresh(refreshToken: string) {
    const { data, error } = await this.supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) throw new UnauthorizedException(error?.message || 'Refresh failed');
    return data.session;
  }

  async refreshAccessToken(refreshToken: string) {
    try {
      const { data, error } = await this.supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) throw error || new UnauthorizedException('Refresh failed');

      // attach role(s) from DB (Prisma) to the returned session.user
      try {
        const userId = (data as any)?.session?.user?.id;
        if (userId) {
          const roles = await this.getRolesForUser(userId);
          if ((data as any).session.user) {
            (data as any).session.user.roles = roles;
            (data as any).session.user.role = roles && roles.length > 0 ? roles[0] : 'user';

            // sign server jwt for refreshed session
            try {
              const secret = process.env.JWT_SECRET || 'dev-secret';
              const expiresIn = process.env.JWT_EXPIRES_IN || '1h';
              const expiresSeconds = this.parseExpiresIn(expiresIn);
              const payload = { sub: userId, email: (data as any).session.user.email, roles };
              const serverToken = sign(payload, secret, { expiresIn });
              (data as any).session.server_token = serverToken;

              // replace the access_token with server-signed token
              (data as any).session.access_token = serverToken;
              (data as any).session.expires_in = expiresSeconds;
              (data as any).session.expires_at = Math.floor(Date.now() / 1000) + expiresSeconds;

            } catch (err) {
              this.logger.error('Failed to sign server JWT during refresh: ' + (err?.message || String(err)));
            }
          }
        }
      } catch (err) {
        this.logger.error('Failed to fetch role during refresh: ' + (err?.message || String(err)));
      }

      return data.session; // contains access_token, refresh_token, user, and session.server_token
    } catch (err) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // Helper: return role names assigned to a user via SupaUserRoles -> SupaRoles
  async getRolesForUser(userId: string): Promise<string[]> {
    try {
      const userRoles = await this.prisma.supaUserRole.findMany({
        where: { userId },
        include: { role: true },
      });
      const userRolesList = userRoles.map((ur) => ur.role?.name).filter(Boolean) as string[];
      this.logger.log(`User ${userId} has roles: ${userRolesList.join(', ')}`);
      return userRolesList;

    } catch (err) {
      this.logger.error('Error loading roles for user ' + userId + ': ' + (err?.message || String(err)));
      return [];
    }
  }

  // ✅ Add helper for profile (keeps previous guard compatibility)
  async getProfile(userId: string) {
    try {
      const roles = await this.getRolesForUser(userId);
      return { role: roles && roles.length > 0 ? roles[0] : 'user' };
    } catch (error) {
      this.logger.error('Error fetching profile for userId ' + userId + ': ' + (error?.message ?? error), error?.stack);
      return null;
    }
}
}
