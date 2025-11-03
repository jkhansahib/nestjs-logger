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

  constructor(loggerService?: LoggerService) {
    this.loggerService = loggerService;
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    this.publicClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  }

  // Create a user via the admin API (thin wrapper)
  async createUser(email: string, phone: string, password: string, confirmEmail = false) {
    const payload: any = {
      password,
      email_confirm: confirmEmail,
      // user_metadata: { roles: roles }|| {},
    };
    if (email) payload.email = String(email).trim();
    if (phone) payload.phone = String(phone).trim();

    const res = await (this.supabase as any).auth.admin.createUser(payload);
    return res;
  }

  // Public signup (triggers Supabase delivery of confirmation/OTP depending on project settings)
  async signup(email: string, phone: string, password?: string, metadata?: any): Promise<any> {
    this.loggerService?.debug(`SupabaseAuthProvider.signup: called for email=${email}, phone=${phone}`);  
     try {
      const userObj: any = {};
      if (email) userObj.email = String(email).trim();
      if (phone) userObj.phone = String(phone).trim();
      if (password) userObj.password = password;

      const options: any = { data: {phone: userObj.phone}};
      // if (metadata) options.data = metadata;
    
      const res = await (this.publicClient.auth as any).signUp(userObj, options);

      // If Supabase returned a created user id, ensure the phone is persisted via the admin API
      try {
        const userId = (res && (res as any)?.data?.user?.id) || (res && (res as any)?.user?.id) || null;
        if (userId && userObj.phone) {
          // use service-role client to write authoritative fields
          await (this.supabase as any).auth.admin.updateUserById(userId, { phone: userObj.phone });
          this.loggerService?.debug('SupabaseAuthProvider.signup: persisted phone via admin.updateUserById');
        }
      } catch (e) {
        this.loggerService?.warn('SupabaseAuthProvider.signup: failed to persist phone via admin API', e);
        // do not fail signup on admin update issues
      }

      return res;

    } catch (error) {
      this.loggerService?.error('SupabaseAuthProvider.signup: error during signup', error);
      throw error;
    }
    
  }

  async getUserById(userId: string): Promise<any> {
    const res = await (this.supabase as any).auth.admin.getUserById(userId);
    return res;
  }

  async getUserByEmail(email: string): Promise<any | null> {
    if (!email) return null;
    try {
      const { data, error } = await (this.supabase as any)
        .from('users')
        .select('*')
        .eq('email', String(email).trim())
        .limit(1);
      if (error) return null;
      return Array.isArray(data) && data.length ? data[0] : null;
    } catch (e) {
      return null;
    }
  }

  async getUserByPhone(phone: string): Promise<any | null> {
    if (!phone) return null;
    try {
      const { data, error } = await (this.supabase as any)
        .from('users')
        .select('*')
        .eq('phone', String(phone).trim())
        .limit(1);
      if (error) return null;
      return Array.isArray(data) && data.length ? data[0] : null;
    } catch (e) {
      return null;
    }
  }

  async userExists(email: string): Promise<boolean> {
    const u = await this.getUserByEmail(email);
    return !!u;
  }

  async assignRole(userId: string, role: string) {
    const res = await (this.supabase as any).auth.admin.updateUserById(userId, { user_metadata: { role } });
    return res;
  }

  // Generate an email confirmation / signup / invite link via the Supabase admin.generateLink helper
  // type: one of 'signup' | 'invite' | 'magiclink' | 'recovery' etc. Defaults to 'signup'.
  async generateEmailConfirmationLink(
    email: string,
    options?: { password?: string; redirectTo?: string; type?: string }
  ): Promise<any> {
    if (!email) throw new Error('email is required');
    const type = (options && options.type) || 'signup';
    try {
      const payload: any = { type, email };
      if (options && options.password) payload.password = options.password;
      if (options && options.redirectTo) payload.options = { redirectTo: options.redirectTo };

      const res = await (this.supabase as any).auth.admin.generateLink(payload);
      // Log only a non-sensitive summary
      this.loggerService?.debug?.(`SupabaseAuthProvider.generateEmailConfirmationLink: type=${type} email=${email} success=${!res?.error}`);
      return res;
    } catch (err) {
      this.loggerService?.error?.('SupabaseAuthProvider.generateEmailConfirmationLink: unexpected error', err);
      throw err;
    }
  }

  async signInWithPassword(email: string, password: string): Promise<any> {
    const res = await (this.publicClient.auth as any).signInWithPassword({ email, password } as any);
    return res;
  }

  async refreshToken(refreshToken: string): Promise<any> {
    const res = await this.publicClient.auth.refreshSession({ refresh_token: refreshToken } as any);
    return res;
  }

  async revokeRefreshToken(refreshToken: string): Promise<any> {
    // If a UUID is provided, call admin.invalidateUserRefreshTokens; otherwise return a normalized response
    if (refreshToken && refreshToken.length === 36) {
      const res = await (this.supabase as any).auth.admin.invalidateUserRefreshTokens(refreshToken);
      return res;
    }
    // Not supported for opaque tokens via admin API in this wrapper
    return { error: 'revoke not supported for opaque refresh tokens without user id' };
  }

  async signOut(accessToken: string): Promise<any> {
    const res = await this.publicClient.auth.signOut();
    return res;
  }

  async changePassword(userIdOrAccessToken: string, oldPassword: string | null, newPassword: string): Promise<any> {
    if (userIdOrAccessToken && userIdOrAccessToken.length === 36) {
      const res = await (this.supabase as any).auth.admin.updateUserById(userIdOrAccessToken, { password: newPassword });
      return res;
    }
    return { error: 'changePassword via access token not implemented in this wrapper' };
  }

  async sendPasswordReset(email: string): Promise<any> {
    const res = await this.publicClient.auth.resetPasswordForEmail(email, { redirectTo: process.env.PASSWORD_RESET_REDIRECT || undefined });
    return res;
  }

  async resetPassword(accessTokenOrCode: string, newPassword: string): Promise<any> {
    if (accessTokenOrCode && accessTokenOrCode.length === 36) {
      const res = await (this.supabase as any).auth.admin.updateUserById(accessTokenOrCode, { password: newPassword });
      return res;
    }
    return { error: 'server-side reset via code not implemented in this wrapper' };
  }

  async signInAnonymously(): Promise<any> {
    const res = await (this.publicClient.auth as any).signInAnonymously();
    return res;
  }

  async introspectToken(token: string): Promise<any> {
    if (!token) throw new Error('Token required');
    try {
      const secret = process.env.JWT_SECRET || 'dev-secret';
      const payload = require('jsonwebtoken').verify(token, secret);
      return { active: true, payload };
    } catch (e) {
      const res = await this.supabase.auth.getUser(token as any);
      return res;
    }
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

  async issueToken(payload: any): Promise<any> {
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const expiresIn = process.env.JWT_EXPIRES_IN || '1h';

    // const uid = user?.id || user?.user?.id || user?.user_id || user?.sub;
    // const email = user?.email || user?.user?.email || null;
    // const roles = user?.roles || user?.user?.roles || [];

    // const payload = { sub: uid, email, roles };
    const resExpiresSeconds = this.parseExpiresIn(expiresIn);

    const token = sign(payload, secret, { expiresIn });
    // this.loggerService?.debug(`SupabaseAuthProvider.issueToken: issued token for payload: ` + JSON.stringify(token));
    let response = {
      access_token: token, 
      expires_in : resExpiresSeconds, 
      expires_at: Math.floor(Date.now() / 1000) + resExpiresSeconds ,
    };
    return response;
  }

  async verifyToken(token: string) {
    const res = await this.supabase.auth.getUser(token as any);
    return res;
  }

  async sendOtpToPhone(phone: string, channel: 'sms' | 'voice' = 'sms'): Promise<any> {
    const res = await (this.publicClient.auth as any).signInWithOtp({ phone, options: { shouldCreateUser: false } } as any);
    return res;
  }

  async verifyPhoneOtp(phone: string, token: string): Promise<any> {
    if (!phone || !token) throw new Error('phone and token are required');
    try {
      // Use the verifyOtp helper which accepts { phone, token, type }
      const { data, error } = await (this.publicClient.auth as any).verifyOtp({ phone, token, type: 'sms' } as any);
      // Avoid logging the token; log only outcome
      this.loggerService?.debug?.(`SupabaseAuthProvider.verifyPhoneOtp: result for phone=${phone} error=${!!error}`);
      return { data, error };
    } catch (err) {
      this.loggerService?.error('SupabaseAuthProvider.verifyPhoneOtp: unexpected error', err);
      throw err;
    }
  }
}
