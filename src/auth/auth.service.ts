import { Injectable, Inject, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { AuthProvider } from './auth.interface';
import { AuthUserService } from './user.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly emailDomain = 'vumber.local'; // Domain to append for username->email conversion

  constructor(
    @Inject('AuthProvider') private authProvider: AuthProvider,
    private authUserService: AuthUserService
  ) {}

  // --- sign up
  async signUp(username: string, password: string, role: string = 'user') {
    
    return await this.authProvider.createUser(username, password, { role });
    
  }

  // --- sign in
  async signIn(username: string, password: string) {
    if (!this.authProvider.signIn) {
      throw new BadRequestException('Auth provider does not support signIn');
    }

    //Check if username exists in database
    let userExists = await this.authUserService.getUserProfileByUsername(username);
    if(!userExists) {
      this.logger.log(`AuthService.signIn: username '${username}' does not exist`);
      throw new UnauthorizedException('Invalid username or password');
    }

    // Normalize username to email if it doesn't contain '@'
    let userEmail = username;
    if (!userEmail.includes('@')) userEmail = `${username}@${this.emailDomain}`;
    
    // First, attempt to sign in using the auth provider (Supabase) directly.
    try {
      // If user exists and is already migrated, sigin in directly
      if(userExists.supabaseMigrated === true) {

        const supResult = await this.authProvider.signIn(userEmail, password);

        // Provider returns either a data object or an { error } shape; treat presence of `.error` as failure
        if (supResult && !(supResult as any).__isAuthError) {
          this.logger.log(`AuthService.signIn: Supabase sign-in successful for '${username}'`);
          this.logger.debug(`AuthService.signIn: Supabase sign-in result: ${JSON.stringify(supResult)}`);
          return supResult;
        } else {
          this.logger.log(`AuthService.signIn: Supabase sign-in failed for '${username}'`);
          throw new UnauthorizedException('Invalid username or password');
        }
      } else {
        this.logger.log(`AuthService.signIn: user '${username}' exists but not migrated, falling back to legacy lookup`);
        
        const isLegacyAuthed = await this.authUserService.getUserLegacyAuthed(username, password);

        if (!isLegacyAuthed) {
          // Nothing we can do — rethrow a generic auth error
          throw new UnauthorizedException('Invalid username or password');
        } else {
          this.logger.log(`AuthService.signIn: legacy authentication successful for '${username}'`);
          // proceed to migration below
          // Create user via provider (idempotent: provider.createUser returns { alreadyRegistered: true } when duplicate)
          let created: any;
          try {
            created = await this.authProvider.createUser(userEmail, password, { role: 'user' });
            this.logger.debug(`AuthService.signIn: createUser result: ${JSON.stringify(created)}`);
            if (created && (created as any).alreadyRegistered) {
              this.logger.log(`AuthService.signIn: user '${username}' already registered in provider during migration`);
              // Attempt sign-in with the Supabase credentials we just created
              try {
                const postSign = await this.authProvider.signIn(userEmail, password);
                if (postSign && !(postSign as any).__isAuthError) {
                  this.logger.log(`AuthService.signIn: Supabase sign-in successful for '${username}' after migration`);
                  // Mark migrated in legacy store
                  try {
                    await this.authUserService.markUserMigrated(userExists.id as number);
                    this.logger.log(`AuthService.signIn: marked legacy user '${username}' as migrated`);
                  } catch (mErr) {
                    this.logger.warn('AuthService.signIn: failed to mark legacy user migrated: ' + (mErr?.message || String(mErr)));
                  }
                  return postSign;
                } else {
                  // If sign-in still fails, return created marker so caller can decide
                  this.logger.error(`AuthService.signIn: sign-in failed for '${username}'`);
                  return postSign;
                }
                
              } catch (sErr) {
                this.logger.error('AuthService.signIn: sign-in  failed: ' + (sErr?.message || String(sErr)));
                // return created;
                throw new UnauthorizedException('Invalid username or password');
              }


            } else if (created && (created as any).id) {
              this.logger.log(`AuthService.signIn: created user '${username}' in provider during migration`);
              // Mark migrated in legacy store
              try {
                await this.authUserService.markUserMigrated(userExists.id as number);
                this.logger.log(`AuthService.signIn: marked legacy user '${username}' as migrated`);
              } catch (mErr) {
                this.logger.warn('AuthService.signIn: failed to mark legacy user migrated: ' + (mErr?.message || String(mErr)));
              }
              return created;
            } else {
              this.logger.error(`AuthService.signIn: unexpected createUser result during migration for '${username}': ` + JSON.stringify(created));
              throw new UnauthorizedException('Failed to migrate legacy user');
            }
          } catch (err) {
            this.logger.error('AuthService.signIn: error creating user during migration: ' + (err?.message || String(err)));
            throw new UnauthorizedException('Failed to migrate legacy user');
          }
        }

      }
    } catch (err) {
      this.logger.log(`AuthService.signIn: Supabase sign-in threw: ${err?.message || err}`);
    }

    
  }

  // --- refresh access token using refresh token
  async refreshAccessToken(refreshToken: string) {
    if (!this.authProvider.refreshToken) {
      throw new BadRequestException('Auth provider does not support refresh token');
    }
    return await this.authProvider.refreshToken(refreshToken);
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
}
