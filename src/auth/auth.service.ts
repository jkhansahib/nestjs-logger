import { Injectable, Inject, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { AuthProvider } from './auth.interface';
import { AuthUserService } from './user.service';
import { UserDevicesService, DeviceInput } from './user-devices.service';
import { access } from 'fs';
import { ref } from 'process';
import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly emailDomain = 'vumber.local'; // Domain to append for username->email conversion

  constructor(
    @Inject('AuthProvider') private authProvider: AuthProvider,
    private authUserService: AuthUserService,
    private userDevicesService: UserDevicesService
  ) {}

  // Normalize a username or identifier into an email address.
  // If the identifier already contains '@' it is returned trimmed.
  // If it doesn't and appendDomainIfMissing is true, the service's emailDomain is appended.
  // If appendDomainIfMissing is false and identifier has no '@', an empty string is returned.
  private normalizeUsernameToEmail(identifier: string, appendDomainIfMissing = true): string {
    if (!identifier) return '';
    const trimmed = identifier.trim();
    if (trimmed.includes('@')) return trimmed;
    return appendDomainIfMissing ? `${trimmed}@${this.emailDomain}` : '';
  }

  // --- sign up
  async signUp(username: string, phone: string, role: string, password: string ) {
    // username may be an email or system username; phone optional; password required; role is a string
    if (!password) throw new BadRequestException('password is required');
    if (!username && !phone) throw new BadRequestException('username or phone is required');

    const identifier = username && username.trim().length > 0 ? username.trim() : (phone || '').trim();
    const metadata = { role: role || 'user', phone: phone || null };

    this.logger.log(`AuthService.signUp: creating account for identifier='${identifier}' role='${metadata.role}'`);
    // call provider.createUser(email, phone, password, metadata)
    const email = this.normalizeUsernameToEmail(identifier, false);
    return await this.authProvider.createUser(email, phone || '', password, metadata, true);
  }

  // --- sign in
  async signIn(username: string, password: string) {
    // Provide a single, unified Unauthorized response for any authentication or migration failures.
    // Success responses return the provider's result (tokens/user data). Any failure throws UnauthorizedException.

    if (!this.authProvider.signInWithPassword) {
      throw new BadRequestException('Auth provider does not support signInWithPassword');
    }

    // Ensure the username exists in our legacy profile store before attempting provider auth or migration.
    const userProfile = await this.authUserService.getUserProfileByUsername(username);
    if (!userProfile) {
      this.logger.log(`AuthService.signIn: username '${username}' does not exist`);
      throw new UnauthorizedException('Invalid username or password');
    }

    // Normalize username to email
    const userEmail = this.normalizeUsernameToEmail(username);

    try {
      // If user already migrated to Supabase, attempt provider sign-in directly.
      if (userProfile.supabaseMigrated === true) {
        const supResult = await this.authProvider.signInWithPassword(userEmail, password);

        // Normalize provider response: success when there's no .error and a user/session in .data or .user
        const hasError = supResult && ((supResult as any).error || (supResult as any).status === 'error');
        const userPresent = !!((supResult as any)?.data?.user || (supResult as any)?.user);

        if (!hasError && userPresent) {
          this.logger.log(`AuthService.signIn: Supabase sign-in successful for '${username}'`);
          return supResult;
        }

        // Any provider sign-in failure is treated as invalid credentials.
        this.logger.log(`AuthService.signIn: Supabase sign-in failed for '${username}'`);
        throw new UnauthorizedException('Invalid username or password');
      }

      // User exists but is not migrated: attempt legacy auth first, then migrate.
      this.logger.log(`AuthService.signIn: user '${username}' exists but not migrated, attempting legacy authentication`);

      const legacyAuthed = await this.authUserService.getUserLegacyAuthed(username, password);
      if (!legacyAuthed) {
        // Legacy credentials invalid.
        this.logger.log(`AuthService.signIn: legacy authentication failed for '${username}'`);
        throw new UnauthorizedException('Invalid username or password');
      }

      this.logger.log(`AuthService.signIn: legacy authentication successful for '${username}', attempting provider migration`);

      // Create the user in the provider (idempotent: provider may return alreadyRegistered marker)
      const created = await this.authProvider.createUser(userEmail, '', password, { role: 'user' });

      // Inspect creation result for id or error markers without logging entire payload
      const creationError = created && ((created as any).error || (created as any).status === 'error');
      const createdUserId = (created && ((created as any)?.data?.user?.id || (created as any)?.user?.id)) || null;
      const creationIndicatesExisting = created && (created as any).alreadyRegistered;

      if (creationError && !creationIndicatesExisting && !createdUserId) {
        this.logger.error(`AuthService.signIn: provider createUser returned an error during migration for '${username}'`);
        throw new UnauthorizedException('Invalid username or password');
      }

      if (creationIndicatesExisting || createdUserId) {
        const postSign = await this.authProvider.signInWithPassword(userEmail, password);
        const postHasError = postSign && ((postSign as any).error || (postSign as any).status === 'error');
        const postUserPresent = !!((postSign as any)?.data?.user || (postSign as any)?.user);

        if (postHasError || !postUserPresent) {
          this.logger.error(`AuthService.signIn: sign-in after provider creation failed for '${username}'`);
          throw new UnauthorizedException('Invalid username or password');
        }

        // Mark migrated in legacy store. Don't fail the whole flow if marking fails; just log.
        try {
          await this.authUserService.markUserMigrated(userProfile.id as number);
          this.logger.log(`AuthService.signIn: marked legacy user '${username}' as migrated`);
        } catch (mErr) {
          this.logger.warn('AuthService.signIn: failed to mark legacy user migrated: ' + (mErr?.message || String(mErr)));
        }

        return postSign;
      }

      // Unexpected createUser result — treat as failure
      this.logger.error(`AuthService.signIn: unexpected createUser result during migration for '${username}'`);
      throw new UnauthorizedException('Invalid username or password');
    } catch (err) {
      // Log concise diagnostics and return a unified Unauthorized response for callers.
      this.logger.log(`AuthService.signIn: authentication flow failed for '${username}': ${err?.message || String(err)}`);
      throw new UnauthorizedException('Invalid username or password');
    }
  }

  // --- sign in (provider-only, bypass legacy migration)
  async signInSupabase(identifier: string, password: string) {
    if (!this.authProvider.signInWithPassword) {
      throw new BadRequestException('Auth provider does not support signInWithPassword');
    }
    if (!identifier || !password) {
      throw new UnauthorizedException('Username and password are required');
    }

    // Normalize identifier to email
    const email = this.normalizeUsernameToEmail(identifier);

    try {
      const result = await this.authProvider.signInWithPassword(email, password);
      // provider implementations may return an error object; treat non-error results as success
      const hasError = result && ((result as any).error || (result as any).status === 'error');
      const userPresent = !!((result as any)?.data?.user || (result as any)?.user);
      if (!hasError && userPresent) {
        this.logger.log(`AuthService.signInNative: provider sign-in successful for '${identifier}'`);
        return result;
      }

      this.logger.log(`AuthService.signInNative: provider sign-in failed for '${identifier}'`);
      throw new UnauthorizedException('Invalid username or password');
    } catch (err) {
      this.logger.log(`AuthService.signInNative: provider error for '${identifier}': ${err?.message || String(err)}`);
      throw new UnauthorizedException('Invalid username or password');
    }
  }

  // --- sign in and return a server-issued token (bypasses legacy migration)
  async signInPrivate(identifier: string, password: string, device: any) {

    if (!this.authProvider.signInWithPassword) {
      throw new BadRequestException('Auth provider does not support signInWithPassword');
    }
    if (!this.authProvider.issueToken) {
      throw new BadRequestException('Auth provider does not support issuing server tokens');
    }
    if (!identifier || !password) throw new UnauthorizedException('Username and password are required');

    const email = this.normalizeUsernameToEmail(identifier);

    try {
      
      const { data, error } = await this.authProvider.signInWithPassword( email, password );
      if (error) throw new UnauthorizedException(error.message);
      // this.logger.debug(`AuthService.signInPrivate: provider sign-in data: ` + JSON.stringify(data));
      let user = (data as any)?.user;
      //TODO: Assign proper roles defined in db
      let roles = ["user","admin","super-admin"]

      let payload = {
        id: user.id,
        email: user.email,
        brand: "vumber",
        // access_token: serverToken,
        roles: roles,
        device: device
      }
      // Ask provider to issue a server token for this user
      let newResponse = {access_token: '', expires_in: 0, expires_at: 0};
      try {
        newResponse = await this.authProvider.issueToken!(payload);
        // user.access_token = serverToken;
      } catch (tErr) {
        this.logger.error('AuthService.signInPrivate: failed to issue server token', tErr);
        throw new UnauthorizedException('Invalid username or password');
      }

      // Attempt to create a user device record. Build a minimal device object from available session/user data.
      try {
        const deviceObj: DeviceInput = {
          user_id: 1234,
          device_id: device.id,
          device_type: device.type,
          device_name: device.name,
          is_active: true,
          last_login_datetime: new Date(),
          expires_datetime: new Date(newResponse.expires_at * 1000),
          last_refresh_datetime: null,
          platform: device.platform,
          brand_id: 1, //Todo: Assign proper brand ids
          notification_key: null, // Todo: assign notification keys
          notification_key_voip: null, //todo: assign voip keys
          ip_info: device.ip,
          device_info: JSON.stringify(payload),
          refresh_token: data.session.refresh_token || null
        };


        // call userDevicesService.upsertDevice/createDevice if available
        if (this.userDevicesService) {
          if (typeof this.userDevicesService.upsertDevice === 'function') {
            await this.userDevicesService.upsertDevice(deviceObj);
            this.logger.log('AuthService.signInPrivate: upserted user device record');
          } else if (typeof this.userDevicesService.createDevice === 'function') {
            await this.userDevicesService.createDevice(deviceObj);
            this.logger.log('AuthService.signInPrivate: created user device record');
          }
        }
      } catch (dErr) {
        this.logger.warn('AuthService.signInPrivate: failed to create user device record: ' + (dErr?.message || String(dErr)));
      }

      // Return minimal, safe payload
      let response = { 
        ...payload, 
        session: {
            access_token: newResponse.access_token, 
            token_type: 'bearer',
            refresh_token: data.session.refresh_token, 
            expires_in: newResponse.expires_in, 
            expires_at : newResponse.expires_at 
        }
        
      };
      
      return response;
    } catch (err) {
      this.logger.log(`AuthService.signInPrivate: authentication flow failed for '${identifier}': ${err?.message || String(err)}`);
      throw new UnauthorizedException('Invalid username or password');
    }
  }

  // --- refresh access token using refresh token
  async refreshAccessToken(refreshToken: string) {
      if (!this.authProvider.refreshToken) {
        throw new BadRequestException('Auth provider does not support refresh token');
      }

      if (!refreshToken) throw new BadRequestException('refreshToken is required');

      // Validate that refresh token exists in user_devices
      let deviceRec: any = null;
      try {
        deviceRec = await this.userDevicesService.findDeviceByRefreshToken(refreshToken);
      } catch (err) {
        this.logger.error('refreshAccessToken: failed to lookup device by refresh token', err);
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (!deviceRec) {
        this.logger.log('refreshAccessToken: refresh token not found in device store');
        throw new UnauthorizedException('Invalid refresh token');
      }
      this.logger.log(`refreshAccessToken: found device record id=${deviceRec.id} for userId=${deviceRec.user_id}`);
      // this.logger.debug(`refreshAccessToken: device record: ` + JSON.stringify(deviceRec));
      // Build payload for issuing a new server token. Use information from deviceRec and user mapping.
      const payload: any = deviceRec.deviceInfo ? JSON.parse(deviceRec.deviceInfo) : {};
      if (!payload) {
        this.logger.log('refreshAccessToken: payload not found in device store');
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Attempt to refresh with provider.refreshToken; if that is not available try provider.issueToken with the payload
      let refreshed: any = {access_token: '', expires_in: 0, expires_at: 0};
  
      const { data, error }  = await this.authProvider.refreshToken(refreshToken);
       if (error) throw new UnauthorizedException(error.message);
      // this.logger.debug(`refreshAccessToken: provider.refreshToken response: ` + JSON.stringify(data));

      // issueToken returns a new server token; provider may also need to issue a new refresh token separately
      try {
        refreshed = await this.authProvider.issueToken!(payload);
      } catch (iErr) {
        this.logger.error('refreshAccessToken: provider.issueToken failed', iErr);
        throw new UnauthorizedException('Unable to refresh token');
      }
      // Normalize refreshed response: expect access_token, expires_in, expires_at, optional refresh_token
      const accessToken = refreshed?.access_token  || null;
      const expiresIn = refreshed?.expires_in  || null;
      const expiresAt = refreshed?.expires_at || null;
      const newRefreshToken = data.session.refresh_token || null;

      // Update device record with new refresh token and last_refresh_datetime
      try {
        const updates: any = {
          last_refresh_datetime: new Date(),
          expires_datetime: new Date(expiresAt * 1000)  
        };
        if (newRefreshToken) updates.refresh_token = newRefreshToken;
        await this.userDevicesService.updateDevice(deviceRec.id, updates as any);
      } catch (err) {
        this.logger.warn('refreshAccessToken: failed to update device record with new refresh token', err?.message || err);
      }

      // Build response similar to signInPrivate
      const response = {
        // id: payload.id,
        // email: payload.email,
        // brand: payload.brand,
        // roles: payload.roles,
        // buildNumber: payload.buildNumber,
        // platform: payload.platform,
        // userDeviceId: payload.userDeviceId,
        ...payload,
        session: {
          access_token: accessToken,
          token_type: 'bearer',
          refresh_token: newRefreshToken || refreshToken,
          expires_in: expiresIn,
          expires_at: expiresAt,
        },
      };

      return response;

    }
    


  // --- revoke refresh token or revoke by user id
  async revokeRefreshToken(tokenOrUserId: string) {
    if (!this.authProvider.revokeRefreshToken) {
      throw new BadRequestException('Auth provider does not support revokeRefreshToken');
    }
    return await this.authProvider.revokeRefreshToken(tokenOrUserId);
  }

  // --- sign out
  async signOut(accessTokenOrUserId?: string) {
    if (!this.authProvider.signOut) {
      throw new BadRequestException('Auth provider does not support signOut');
    }
    const data = await this.authProvider.signOut(accessTokenOrUserId || '');
    // return provider response directly; provider is responsible for normalization
    return data;
  }

  // --- change password
  async changePassword(userIdOrAccessToken: string, oldPassword: string | null, newPassword: string) {
    if (!this.authProvider.changePassword) {
      throw new BadRequestException('Auth provider does not support changePassword');
    }
    return await this.authProvider.changePassword(userIdOrAccessToken, oldPassword, newPassword);
  }

  // --- forgot / send reset
  async sendPasswordReset(email: string) {
    if (!this.authProvider.sendPasswordReset) {
      throw new BadRequestException('Auth provider does not support sendPasswordReset');
    }
    return await this.authProvider.sendPasswordReset(email);
  }

  // --- reset password
  async resetPassword(accessTokenOrCode: string, newPassword: string) {
    if (!this.authProvider.resetPassword) {
      throw new BadRequestException('Auth provider does not support resetPassword');
    }
    return await this.authProvider.resetPassword(accessTokenOrCode, newPassword);
  }

  // --- introspect token
  async introspectToken(token: string) {
    if (!this.authProvider.introspectToken) {
      throw new BadRequestException('Auth provider does not support introspection');
    }
    return await this.authProvider.introspectToken(token);
  }

  // --- anonymous login (prefer provider-level anonymous sign-in, fallback to createUser+signIn)
  async anonymousLogin() {
    this.logger.log('anonymousLogin requested');

    // Prefer provider-level anonymous sign-in if implemented
    const anyProvider = this.authProvider as any;
    if (typeof anyProvider.signInAnonymously === 'function') {
      return await anyProvider.signInAnonymously();
    }

    // // Fallback: create an ephemeral user and sign in
    // const { randomUUID } = await import('crypto');
    // const id = randomUUID();
    // const email = `anon+${id}@example.local`;
    // const password = id;

    // if (!this.authProvider.createUser || !this.authProvider.signIn) {
    //   throw new BadRequestException('Auth provider does not support anonymous fallback flows');
    // }

    // const created = await this.authProvider.createUser(email, password, { anonymous: true, role: 'user' });
    // if (created && (created as any).alreadyRegistered) {
    //   return await this.authProvider.signIn(email, password);
    // }

    // return await this.authProvider.signIn(email, password);
  }

  // --- send OTP to phone (delegates to provider)
  async sendPhoneOtp(phone: string, channel: 'sms' | 'voice' = 'sms') {
    if (!phone) throw new BadRequestException('phone is required');
    // Note: caller should supply E.164-formatted phone numbers. Consider normalizing with libphonenumber in controller.
    const anyProvider = this.authProvider as any;
    if (typeof anyProvider.sendOtpToPhone !== 'function') {
      throw new BadRequestException('Auth provider does not support phone OTP');
    }
    this.logger.log(`sendPhoneOtp requested for ${phone}`);
    try {
        const res = await anyProvider.sendOtpToPhone(phone, channel);
        this.logger.log(`sendPhoneOtp successful for ${phone}`);
        this.logger.debug(`sendPhoneOtp result for ${phone}: ${JSON.stringify(res)}`);  
        return res;

    } catch (error) {
      this.logger.error('sendPhoneOtp error', error);
      return { ok: false, error: error?.message || String(error) };
    }
    
  }

  // --- verify OTP for phone and sign-in (delegates to provider)
  async verifyPhoneOtp(phone: string, token: string) {
    if (!phone || !token) throw new BadRequestException('phone and token are required');
    const anyProvider = this.authProvider as any;
    if (typeof anyProvider.verifyPhoneOtp !== 'function') {
      throw new BadRequestException('Auth provider does not support phone OTP verification');
    }
    this.logger.log(`verifyPhoneOtp requested for ${phone}`);
    // Do not log token
    const res = await anyProvider.verifyPhoneOtp(phone, token);
    this.logger.log(`verifyPhoneOtp completed for ${phone}`);
    this.logger.debug(`verifyPhoneOtp result for ${phone}: ${JSON.stringify(res)}`);

    // Optionally, perform legacy migration: if the phone maps to a legacy profile that isn't migrated,
    // create a provider user and mark migrated. This is left intentionally minimal — implementers
    // may extend this behavior to fetch profile by phone and reconcile roles/metadata.
    return res;
  }
}
