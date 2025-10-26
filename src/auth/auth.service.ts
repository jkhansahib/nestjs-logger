import { Injectable, Inject, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { AuthProvider } from './auth.interface';
import { AuthUserService } from './user.service';
import { UserDevicesService, DeviceInput } from './user-devices.service';
import { access } from 'fs';
import { ref } from 'process';
import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/constants';
import { AuthProvider as AuthProviderEnum } from '../common/enums';
import { AuthUsersService } from './users.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly emailDomain = 'vumber.local'; // Domain to append for username->email conversion

  constructor(
    @Inject('AuthProvider') private authProvider: AuthProvider,
    private authUserService: AuthUserService,
    private userDevicesService: UserDevicesService,
    private usersService: AuthUsersService
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

  /**
   * Mock helper to resolve roles for a given local user id.
   * - Tries to read roles/role/user_metadata.role from the local users table via UsersService.
   * - Falls back to a simple mapping for development/testing (userId===1 -> ['admin','user']).
   * - Returns ['user'] by default.
   */
  private async getUserRoles(userId: number): Promise<string[]> {
    if (!userId) return ['user'];
    try {
      // const local = await this.usersService.getUserById(Number(userId));
      // if (local) {
      //   // common shapes: roles array, role string, or user_metadata.role
      //   if ((local as any).roles && Array.isArray((local as any).roles)) return (local as any).roles;
      //   if ((local as any).role && typeof (local as any).role === 'string') return [(local as any).role];
      //   if ((local as any).user_metadata && (local as any).user_metadata.role) return [ (local as any).user_metadata.role ];
      // }
      // TODO: Implement proper role lookup from local users table
      return ['user'];
    } catch (err) {
      this.logger.debug && this.logger.debug('getUserRoles: lookup failed: ' + (err?.message || String(err)));
    }

    // Simple dev/test mapping
    if (Number(userId) === 1) return ['admin', 'user'];
    return ['user'];
  }

  // --- sign up
  async signUp(email: string, phone: string, password: string, device:any ) {
    // username may be an email or system username; phone optional; password required; role is a string
    if (!password) throw new BadRequestException('password is required');
    if (!email && !phone) throw new BadRequestException('email or phone is required');

    const identifier = email && email.trim().length > 0 ? email.trim() : (phone || '').trim();
    let roles = ['user'];
    // const metadata = { role: role || 'user', phone: phone || null };
    this.logger.log(`AuthService.signUp: creating account for identifier='${identifier}' role='${roles}'`);
    // call provider.createUser(email, phone, password, metadata)
    // const email = this.normalizeUsernameToEmail(identifier, false);
    try {
      // Prefer calling provider.signup which is the public signup surface. Keep the old createUser call commented for reference.
      // const { data, error } =  await this.authProvider.createUser(email, phone || '', password, roles, false);
      const { data, error } = await (this.authProvider as any).signup(email, phone || '', password);
      if (error) throw new UnauthorizedException(error.message);
      // this.logger.debug(`AuthService.signUp: provider createUser data: ` + JSON.stringify(data)); 
      // const user = (authUser && (authUser as any)?.data?.user) || (authUser && (authUser as any)?.user) || null;
      // After provider user created, insert into local users table
      try {
        const providerId = (data && (data as any)?.user?.id)  || null;
        const userRec = await this.usersService.createUser({
          user_name: email || null,
          auth_provider: AuthProviderEnum.supabase,
          auth_provider_id: providerId ? String(providerId) : null,
          phone_number: phone || null,
          email: email || null,
          is_anonymous: false,
          is_active: true,
        });
        this.logger.log(`AuthService.signUp: created local user id=${userRec?.id}`);

        // Create JWT token
        // Cant genreate token because, user has to verify their email first
        // Create user will not create token
        // this.logger.debug(`AuthService.signUp: data=${JSON.stringify(data)}`);
        // const refreshToken = (data && (data as any).session && (data as any).session.refresh_token) ? (data as any).session.refresh_token : null;
        // this.logger.debug(`AuthService.signUp: generating JWT token for new user id=${userRec.id} device=${device?.id || 'n/a'} roles=${JSON.stringify(roles)} ${refreshToken}`);
        // let response = await this.generateJWTToken(userRec.id, data.user, roles, device, data.session.refresh_token);
        // this.logger.debug('AuthService.signUp: generated JWT token for new user id=' + (userRec?.id ?? 'unknown'));
        // return response
        return data;

      } catch (uErr) {
        this.logger.warn('AuthService.signUp: failed to insert user record in users table: ' + (uErr?.message || String(uErr)));
      }

      // return data;
    } catch (error) {
      // Log structured error for diagnostics but avoid returning internal details to callers
      this.logger.error('AuthService.signUp: provider signup failed', error);
      throw new UnauthorizedException('Failed to create user account');
    }
    
  }

  // --- sign in and return a server-issued token (bypasses legacy migration)
  async signIn(identifier: string, password: string, device: any) {

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
      //Get Refresh token
      const refreshToken = (data && (data as any).session && (data as any).session.refresh_token) ? (data as any).session.refresh_token : null;
      //Get userId from local db
      const providerId = user?.id ? String(user.id) : null;
      let dbUser: any = null;

      if (providerId) {
        try {
          dbUser = await this.usersService.getUserByAuthProviderId(AuthProviderEnum.supabase, providerId);
          this.logger.log(`AuthService.signIn: resolved local user for providerId=${providerId} -> id=${dbUser?.id ?? 'not found'}`);
        } catch (lookupErr) {
          this.logger.warn(`AuthService.signIn: error looking up user by providerId=${providerId}`, lookupErr);
        }
      }

      let userId: number | null = dbUser?.id ?? null;

      // if (!userId) {
      //   // If no local user exists, create a minimal local record (keeps parity with signUp flow)
      //   try {
      //     const created = await this.usersService.createUser({
      //       user_name: user?.email ?? null,
      //       auth_provider: AuthProviderEnum.supabase,
      //       auth_provider_id: providerId,
      //       phone_number: user?.phone ?? null,
      //       email: user?.email ?? null,
      //       is_anonymous: false,
      //       is_active: true,
      //     });
      //     userId = created?.id ?? null;
      //     this.logger.log(`AuthService.signIn: created local user id=${userId} for providerId=${providerId}`);
      //   } catch (createErr) {
      //     this.logger.warn('AuthService.signIn: failed to create local user record', createErr);
      //   }
      // }

      if (!userId) {
        throw new UnauthorizedException('Local user record not found or could not be created');
      }
      let response = await this.generateJWTToken(userId, user, roles, device, refreshToken);
      
      return response;
    } catch (err) {
      this.logger.log(`AuthService.signInPrivate: authentication flow failed for '${identifier}': ${err?.message || String(err)}`);
      // throw new UnauthorizedException('Invalid username or password');
      throw new UnauthorizedException(err.message || 'Invalid username or password');
    }
  }

  
 private async  generateJWTToken(userId: number, user:any, roles:any, device: any, refreshToken: string): Promise<any> {
  // Avoid logging secrets (refresh tokens) or full user objects
  this.logger.debug(`AuthService.generateJWTToken: generating token for userId=${userId} device=${device?.id || 'n/a'} roles=${JSON.stringify(roles)}`);
 let payload = {
        id: user.id,
        email: user.email,
        brand: "vumber",
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
          user_id: userId,
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
          device_info: JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
          refresh_token: refreshToken || null
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

        let response = { 
        ...payload, 
        session: {
            access_token: newResponse.access_token, 
            token_type: 'bearer',
            refresh_token: refreshToken, 
            expires_in: newResponse.expires_in, 
            expires_at : newResponse.expires_at 
        }
      }

        return response;
      } catch (dErr) {
        this.logger.warn('AuthService.signInPrivate: failed to create user device record: ' + (dErr?.message || String(dErr)));
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
        if((res as any)?.error){
          this.logger.error(`sendPhoneOtp error for ${phone}: ${JSON.stringify((res as any).error)}`);
          return { ok: false, error: (res as any).error?.message || 'Failed to send OTP' };
        } else {
          return { ok: true };
        }

    } catch (error) {
      this.logger.error('sendPhoneOtp error', error);
      return { ok: false, error: error?.message || String(error) };
    }
    
  }

  // --- verify OTP for phone and sign-in (delegates to provider)
  async verifyPhoneOtp(phone: string, token: string, device: any) {
    if (!phone || !token) throw new BadRequestException('phone and token are required');
    const anyProvider = this.authProvider as any;
    if (typeof anyProvider.verifyPhoneOtp !== 'function') {
      throw new BadRequestException('Auth provider does not support phone OTP verification');
    }
    this.logger.log(`verifyPhoneOtp requested for ${phone}`);
    // Do not log token
    const {data, error} = await anyProvider.verifyPhoneOtp(phone, token);
    this.logger.log(`verifyPhoneOtp completed for ${phone}`);
    this.logger.debug(`verifyPhoneOtp result for ${phone}: ${JSON.stringify(data)}`);
    if(error){
      this.logger.error(`verifyPhoneOtp error for ${phone}: ${JSON.stringify(error)}`);
      throw new UnauthorizedException(error.message || 'Invalid OTP token');
    }

    // extract provider user id from provider response
    const providerUserId = (data as any)?.user?.id ? String((data as any).user.id) : null;
    let localUser: any = null;

    if (providerUserId) {
      try {
        localUser = await this.usersService.getUserByAuthProviderId(AuthProviderEnum.supabase, providerUserId);
        this.logger.log(`verifyPhoneOtp: resolved local user for providerId=${providerUserId} -> id=${localUser?.id ?? 'not found'}`);
        // attach local user id to response for caller convenience
        (data as any).local_user_id = localUser?.id ?? null;
        try {
          // Extract refresh token and device info from provider response if available
          const refreshToken = (data as any)?.session?.refresh_token ?? null;
          const providerUser = (data as any)?.user ?? null;

          // const deviceFromProvider = (data as any)?.device;
          // const device = deviceFromProvider
          //   ? {
          //       id: deviceFromProvider.id ?? `phone-${phone}`,
          //       type: deviceFromProvider.type ?? 'phone',
          //       name: deviceFromProvider.name ?? 'Phone OTP',
          //       platform: deviceFromProvider.platform ?? 'phone',
          //       ip: deviceFromProvider.ip ?? null,
          //     }
          //   : {
          //       id: `phone-${phone}`,
          //       type: 'phone',
          //       name: 'Phone OTP',
          //       platform: 'phone',
          //       ip: null,
          //     };

          // Ensure we have a local user record; create one if missing
          // let localUserId: number | null = localUser?.id ?? null;
          // if (!localUserId) {
          //   try {
          //     const created = await this.usersService.createUser({
          //       user_name: providerUser?.email ?? phone,
          //       auth_provider: AuthProviderEnum.supabase,
          //       auth_provider_id: providerUser?.id ? String(providerUser.id) : providerUserId,
          //       phone_number: phone ?? null,
          //       email: providerUser?.email ?? null,
          //       is_anonymous: false,
          //       is_active: true,
          //     });
          //     localUserId = created?.id ?? null;
          //     (data as any).local_user_id = localUserId;
          //     this.logger.log(`verifyPhoneOtp: created local user id=${localUserId} for providerId=${providerUserId}`);
          //   } catch (createErr) {
          //     this.logger.warn('verifyPhoneOtp: failed to create local user record', createErr);
          //   }
          // }

          // Resolve roles and generate a JWT response
          const roles = await this.getUserRoles(localUser.id ?? 0);
          const jwtResponse = await this.generateJWTToken(localUser.id ?? 0, providerUser, roles, device, refreshToken);

          // Return the JWT-shaped response to caller
          return jwtResponse;
        } catch (err) {
          this.logger.error('verifyPhoneOtp: failed to generate JWT', err);
          throw new UnauthorizedException('Failed to complete phone OTP sign-in');
        }
      } catch (lookupErr) {
        this.logger.warn(`verifyPhoneOtp: error looking up user by providerId=${providerUserId}`, lookupErr);
      }
    } else {
      this.logger.log('verifyPhoneOtp: provider response did not include user.id');
    }
    // Optionally, perform legacy migration: if the phone maps to a legacy profile that isn't migrated,
    // create a provider user and mark migrated. This is left intentionally minimal — implementers
    // may extend this behavior to fetch profile by phone and reconcile roles/metadata.
    return data;
  }
}
