// @ts-nocheck
// Backup of auth.service.ts
// Generated on 2025-09-20

import { Injectable, UnauthorizedException, Inject, Logger } from '@nestjs/common';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import type { AuthProvider } from './auth.interface';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';

@Injectable()
export class AuthService {
  private supabase: SupabaseClient;
  private prisma: PrismaClient;

    // Using NestJS Logger for logging
  // This will utilize the Winston logger configured in main.ts
  private readonly logger = new Logger(AuthService.name);

  constructor(@Inject('AuthProvider') private authProvider: AuthProvider) {
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

  // Get user profile by system username (returns email and supabase_migrated flag)
  private async getUser(username: string): Promise<{ email: string | null; supabaseMigrated: boolean } | null> {
    if (!username) return null;
    try {
      const normalized = username.trim();
      this.logger.log(`getUser: looking up UserId='${normalized}'`);

      // Use the generated Prisma model to fetch the profile
      const row = await this.prisma.ppnUserProfile.findUnique({ where: { userId: normalized } }) as unknown as { email?: string | null; supabaseMigrated?: boolean } | null;

      const email = row?.email ?? null;
      const supabaseMigrated = !!row?.supabaseMigrated;
      this.logger.log(`getUser: UserId='${normalized}' -> email='${email}', supabase_migrated=${supabaseMigrated}`);

      return { email, supabaseMigrated };
    } catch (err) {
      this.logger.error('Error fetching profile for username ' + username + ': ' + (err?.message || String(err)));
      return null;
    }
  }

  // --- sign up
  async signUp(username: string, password: string) {
    this.logger.log('Attempting to sign up user with username: ' + username);
    try {
        // allow username input: try to resolve email/profile regardless of whether input looks like an email
        let email = username;
        if (email) {
          const usernameKey = username.trim();
          const profile = await this.getUser(usernameKey);
          const resolved = profile?.email ?? null;
          if (!resolved) {
            throw new UnauthorizedException('Unable to resolve username to an email');
          }
          email = resolved;
        }

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
  async signIn(username: string, password: string) {
    // support login by username: map to email if needed
    let email = username;
    if (email) {
      const usernameKey = username.trim();
      const profile = await this.getUser(usernameKey);
      const resolved = profile?.email ?? null;
      this.logger.log('Resolved username to email: ' + resolved);
      if (!resolved) throw new UnauthorizedException('Invalid username');
      email = resolved;

      // If the profile indicates it hasn't been migrated to Supabase, try to create the user now
      if (profile && !profile.supabaseMigrated) {
        try {
          const { data: signUpData, error: signUpErr } = await this.supabase.auth.signUp({ email, password });
          if (!signUpErr) {
            this.logger.log(`Successfully created Supabase user for ${usernameKey} (${email}). Marking migrated.`);
            await this.prisma.ppnUserProfile.update({ where: { userId: usernameKey }, data: { supabaseMigrated: true } });
          } else {
            const msg = (signUpErr.message || '').toLowerCase();
            // If user already exists in Supabase, treat as migrated
            if (msg.includes('already') || msg.includes('exists')) {
              try {
                await this.prisma.ppnUserProfile.update({ where: { userId: usernameKey }, data: { supabaseMigrated: true } });
                this.logger.log(`Supabase user already existed for ${usernameKey}; marked as migrated.`);
              } catch (uerr) {
                this.logger.error('Failed to mark profile as migrated: ' + (uerr?.message || String(uerr)));
              }
            } else {
              this.logger.warn('Supabase signup during migration returned error: ' + signUpErr.message);
            }
          }
        } catch (merr) {
          this.logger.error('Error migrating user to Supabase: ' + (merr?.message || String(merr)));
        }
      }
    }
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw new UnauthorizedException(error.message);
    // this.logger.log('before update ', data);
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
    // this.logger.log('after update ' , data);

    // Build standardized response object
    const session = (data as any)?.session || {};
    const user = (data as any)?.user || {};

    const accessToken = session.access_token || '';
    const refreshToken = session.refresh_token || '';
    const tokenType = 'bearer';

    const configuredExpires = process.env.JWT_EXPIRES_IN || '1h';
    const expiresInSeconds = this.parseExpiresIn(configuredExpires);
    const expiresIn = session.expires_in || expiresInSeconds;

    const accountIsActive = 'true';
    const roleStr = Array.isArray(user.roles) ? user.roles.join(',') : (user.role || 'user');

    const clientId = process.env.SUPABASE_CLIENT_ID || ((session as any)['as:client_id'] as string) || 'ngAuthProd';

    const issued = new Date().toUTCString();
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toUTCString();

    const response = {
      access_token: accessToken,
      token_type: tokenType,
      expires_in: expiresIn,
      refresh_token: refreshToken,
      accountIsActive,
      role: roleStr,
      'as:client_id': clientId, //Todo
      '.issued': issued,
      '.expires': expiresAt,
    } as const;

    // also attach original server_token for clients that expect it
    // if ((data as any)?.server_token) {
    //   (response as any).server_token = (data as any).server_token;
    // }

    return response;
  }

  // New: signInBase - raw Supabase sign-in without server token/role augmentation
  async signInBase(username: string, password: string) {
    // This base sign-in uses only Supabase auth and expects an email address.
    if (!username || !username.trim()) throw new UnauthorizedException('Email is required');
    const email = username.trim();
    if (!email.includes('@')) {
      // Keep this method purely Supabase-based — require an email. Use signIn() for username-to-email mapping.
      throw new UnauthorizedException('signInBase requires an email address. Use signIn for system username login.');
    }

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

      // Build standardized response object (same shape as signIn)
      const session = (data as any)?.session || {};
      const user = session.user || {};

      const accessToken = session.access_token || '';
      const refreshTokenOut = session.refresh_token || '';
      const tokenType = 'bearer';

      const configuredExpires = process.env.JWT_EXPIRES_IN || '1h';
      const expiresInSeconds = this.parseExpiresIn(configuredExpires);
      const expiresIn = session.expires_in || expiresInSeconds;

      const accountIsActive = 'true';
      const roleStr = Array.isArray(user.roles) ? user.roles.join(',') : (user.role || 'user');

      const clientId = process.env.SUPABASE_CLIENT_ID || ((session as any)['as:client_id'] as string) || 'ngAuthProd';

      const issued = new Date().toUTCString();
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toUTCString();

      const response = {
        access_token: accessToken,
        token_type: tokenType,
        expires_in: expiresIn,
        refresh_token: refreshTokenOut,
        accountIsActive,
        role: roleStr,
        'as:client_id': clientId,
        '.issued': issued,
        '.expires': expiresAt,
      } as const;

      // include server_token if present
      if ((session as any)?.server_token) {
        (response as any).server_token = (session as any).server_token;
      }

      return response; // standardized response object
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
