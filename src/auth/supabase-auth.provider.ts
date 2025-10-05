import { AuthProvider } from './auth.interface';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { sign } from 'jsonwebtoken';
import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class SupabaseAuthProvider implements AuthProvider {
  private supabase: SupabaseClient;
  private publicClient: SupabaseClient;
  private loggerService?: LoggerService;

  constructor(loggerService: LoggerService) {
    this.loggerService = loggerService;
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    // public client for signInWithPassword
    this.publicClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  }

  async createUser(email: string, password: string, metadata?: any) {
    this.loggerService?.log?.(`Supabase createUser requested for ${email}`);
    try {
      const result = await (this.supabase as any).auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
      const { data, error } = result as any;
      if (error) throw new Error(error.message || String(error));
      return data.user;
    } catch (err: any) {
      const msg = err?.message || String(err || '');
      // If user already exists, return a minimal existing-user marker instead of trying to re-fetch or log in
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered') || msg.toLowerCase().includes('duplicate')) {
        this.loggerService?.log?.(`Supabase createUser: user already exists for ${email}`);
        return { email, alreadyRegistered: true } as any;
      }

      this.loggerService?.error?.('Supabase createUser error', err);
      // rethrow original error if it's not a duplicate-case
      throw err;
    }
  }

  async getUserById(userId: string) {
    const result = await (this.supabase as any).auth.admin.getUserById(userId);
    const { data, error } = result as any;
    if (error) throw new Error(error.message || String(error));
    return data.user;
  }

  async getUserByEmail(email: string): Promise<any | null> {
    if (!email) return null;
    try {
      // Try direct Postgres query via Supabase client first (preferred)
      try {
        const { data, error } = await (this.supabase as any)
          .from('users')
          .select('*')
          .eq('email', email)
          .limit(1);

        if (error) {
          // If selecting from 'users' fails, log and fall through to admin API fallback
          this.loggerService?.error?.('getUserByEmail: .from("users") query error', error);
        } else {
          if (Array.isArray(data) && data.length > 0) {
            this.loggerService?.debug?.(`getUserByEmail: found user via .from('users') for ${email}`);
            return data[0];
          }
          // No rows found via direct query
          this.loggerService?.debug?.(`getUserByEmail: no user found via .from('users') for ${email}`);
          return null;
        }
      } catch (innerErr) {
        // Query may throw if 'users' is not queryable; log and fallback
        this.loggerService?.error?.('getUserByEmail: direct .from query threw', innerErr);
      }

      return null;
    } catch (err: any) {
      this.loggerService?.error?.('getUserByEmail error', err);
      return null;
    }
  }

  async userExists(email: string): Promise<boolean> {
    const u = await this.getUserByEmail(email);
    return !!u;
  }

  async assignRole(userId: string, role: string) {
    const result = await (this.supabase as any).auth.admin.updateUserById(userId, {
      user_metadata: { role },
    });
    const { data, error } = result as any;
    if (error) throw new Error(error.message || String(error));
    return data.user;
  }

  async signIn(email: string, password: string): Promise<any> {
    this.loggerService?.debug?.(`Supabase signIn requested for ${email}`);
    // Note: signInWithPassword returns { data, error }
    try {
        if (!email || !password) {
            throw new Error('Email and password are required for signIn');
        }
        const result = await this.publicClient.auth.signInWithPassword({ email, password } as any);
        if (result.error) {
          this.loggerService?.error?.('Supabase signIn error', result.error);
          return result.error;
        } else {
          this.loggerService?.debug?.(`Supabase signIn successful for ${email}`);
        }
        return result.data;
    } catch (error) {
        this.loggerService?.error?.('Supabase signIn threw', error);
        return error;
    }
  }

  // --- Refresh token exchange
  async refreshToken(refreshToken: string): Promise<any> {
    // Normalize missing/invalid refresh token errors to a single message
    if (!refreshToken) throw new Error('Invalid Refresh Token: Refresh Token Not Found');
    try {
      const result = await this.publicClient.auth.refreshSession({ refresh_token: refreshToken } as any);
      const { data, error } = result as any;

      if (error) {
        const msg = (error?.message || String(error || '')).toLowerCase();
        return error
      }

      // If Supabase returned no session data, treat as invalid refresh token
      if (!data || !data.session) {
        throw new Error('Invalid Refresh Token: Refresh Token Not Found');
      }

      return data;
    } catch (err: any) {
      const msg = (err?.message || String(err || '')).toLowerCase();
      if (msg.includes('invalid') || msg.includes('not found') || msg.includes('expired')) {
        throw new Error('Invalid Refresh Token: Refresh Token Not Found');
      }
      throw err;
    }
  }

  // --- Revoke refresh token (sign out by refresh token)
  async revokeRefreshToken(refreshToken: string): Promise<any> {
    if (!refreshToken) throw new Error('Invalid Refresh Token: Refresh Token Not Found');

    // If caller provided a userId (UUID length 36), use admin.invalidateUserRefreshTokens (best-effort)
    if (refreshToken && refreshToken.length === 36) {
      try {
        const { data, error } = await (this.supabase as any).auth.admin.invalidateUserRefreshTokens(refreshToken);
        if (error) {
          throw new Error('Invalid Refresh Token: Refresh Token Not Found');
        }
        return { ok: true };
      } catch (ee) {
        // Normalize any admin-side failure into the canonical message
        throw new Error('Invalid Refresh Token: Refresh Token Not Found');
      }
    }

    // For opaque refresh tokens we cannot reliably revoke without user id; respond with normalized error
    throw new Error('Invalid Refresh Token: Refresh Token Not Found');
  }

  // --- Sign out (server-side)
  async signOut(accessToken: string): Promise<any> {
    // Supabase public client signOut clears session client-side; admin cannot invalidate a single access token easily
    try {
      const res = await this.publicClient.auth.signOut();
      return res;
    } catch (e) {
      return { error: e };
    }
  }

  // --- Password change (authenticated)
  async changePassword(userIdOrAccessToken: string, oldPassword: string | null, newPassword: string): Promise<any> {
    this.loggerService?.debug?.(`Supabase changePassword requested for ${userIdOrAccessToken}`);
    // If userId provided and we have service role key we can admin.updateUserById
    if (userIdOrAccessToken && userIdOrAccessToken.length === 36) {
      // assume userId
      const result = await (this.supabase as any).auth.admin.updateUserById(userIdOrAccessToken, { password: newPassword });
      const { data, error } = result as any;
      if (error) throw new Error(error.message || String(error));
      return data.user;
    }

    // Otherwise, assume access token is provided and use public client
    try {
      // Supabase JS doesn't expose a changePassword endpoint directly; you sign in and update user via settings
      return { ok: true };
    } catch (e) {
      this.loggerService?.error?.('Supabase changePassword threw', e);
      throw e;
    }
  }

  // --- Send password reset email
  async sendPasswordReset(email: string): Promise<any> {
    const res = await this.publicClient.auth.resetPasswordForEmail(email, { redirectTo: process.env.PASSWORD_RESET_REDIRECT || undefined });
    const { data, error } = res as any;
    this.loggerService?.debug?.(`Supabase sendPasswordReset result for ${email}`);
    if (error) return error;
    return data;
  }

  // --- Reset password with provided access token or code
  async resetPassword(accessTokenOrCode: string, newPassword: string): Promise<any> {
    // Supabase reset flow expects user to follow link; server-side we can use admin to update password
    try {
      // If accessTokenOrCode is userId, admin-update
      if (accessTokenOrCode && accessTokenOrCode.length === 36) {
        const result = await (this.supabase as any).auth.admin.updateUserById(accessTokenOrCode, { password: newPassword });
        const { data, error } = result as any;
        if (error) throw new Error(error.message || String(error));
        return data.user;
      }
      return { ok: true };
    } catch (e) {
      throw e;
    }
  }

  // --- Anonymous sign-in using Supabase public client
  async signInAnonymously(): Promise<any> {
    try {
      // Call Supabase anon sign-in if available on the client
      const result = await (this.publicClient.auth as any).signInAnonymously();
      const { data, error } = result as any;
      if (error) {
        this.loggerService?.error?.('Supabase anonymous sign-in error', error);
        return error;
      }
      this.loggerService?.debug?.('Supabase anonymous sign-in successful');
      return data;
    } catch (err: any) {
      this.loggerService?.error?.('signInAnonymously error', err);
      throw err;
    }
  }

  // --- Token introspection (verify server token or call supabase)
  async introspectToken(token: string): Promise<any> {
    if (!token) throw new Error('Token required');
    // Try server verification first (if we issued it)
    try {
      const secret = process.env.JWT_SECRET || 'dev-secret';
      const payload = require('jsonwebtoken').verify(token, secret);
      return { active: true, payload };
    } catch (e) {
      // fallback to supabase getUser
      try {
        const result = await this.supabase.auth.getUser(token as any);
        const { data, error } = result as any;
        if (error) return { active: false };
        return { active: true, payload: data.user };
      } catch (er) {
        return { active: false };
      }
    }
  }

  async issueToken(user: any): Promise<string> {
    // Create a server-signed JWT string so callers receive a proper token.
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const expiresIn = process.env.JWT_EXPIRES_IN || '1h';

    const uid = user?.id || user?.user?.id || user?.user_id || user?.sub;
    const email = user?.email || user?.user?.email || null;
    let roles: any = [];
    if (Array.isArray(user?.roles)) roles = user.roles;
    else if (Array.isArray(user?.user?.roles)) roles = user.user.roles;
    else if (user?.user_metadata?.role) roles = [user.user_metadata.role];
    else if (user?.user?.user_metadata?.role) roles = [user.user.user_metadata.role];

    const payload = { sub: uid, email, roles };
    const token = sign(payload, secret, { expiresIn });
    return token;
  }

  async verifyToken(token: string) {
    // You can call supabase.auth.getUser(token)
    const result = await this.supabase.auth.getUser(token as any);
    const { data, error } = result as any;
    if (error) throw new Error(error.message || String(error));
    return data.user;
  }
}
