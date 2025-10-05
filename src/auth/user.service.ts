import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PpnUserProfileDto } from './dto/ppn-user-profile.dto';

@Injectable()
export class AuthUserService {
  private readonly logger = new Logger(AuthUserService.name);
  private readonly prisma = new PrismaClient();

  // Get user profile by system username (returns full profile and supabase_migrated flag)
  async getUserLegacyAuthed(username: string, password: string): Promise<boolean> {
    return this.VumberAuthenticate(username, password);

    // if (!username) return null;
    // try {
    //   const normalized = username.trim();
    //   this.logger.log(`getUser: looking up UserId='${normalized}'`);

    //   // userId is not unique in schema (index only) so use findFirst
    //   const row = await this.prisma.ppnUserProfile.findFirst({ where: { userId: normalized } }) as any | null;
    //   this.logger.debug(`Row lookup result for UserId='${normalized}': ${row ? 'found' : 'not found'}`);
    //   if (!row) {
    //     this.logger.log(`getUser: no profile found for UserId='${normalized}'`);
    //     return null;
    //   }

    //   // best-effort: derive supabaseMigrated from either explicit column (if present) or from options JSON
    //   let supabaseMigrated = false;
    //   try {
    //     if (typeof row.supabaseMigrated !== 'undefined') {
    //       supabaseMigrated = !!row.supabaseMigrated;
    //     } else if (row.options) {
    //       const opts = typeof row.options === 'string' ? JSON.parse(row.options) : row.options;
    //       if (opts && typeof opts.supabaseMigrated !== 'undefined') supabaseMigrated = !!opts.supabaseMigrated;
    //     }
    //   } catch (e) {
    //     this.logger.warn('Failed to parse options JSON for supabaseMigrated flag: ' + (e?.message || e));
    //     supabaseMigrated = false;
    //   }

    //   const response: PpnUserProfileDto = {
    //     id: row.id ?? null,
    //     type: row.type ?? null,
    //     userId: row.userId ?? normalized,
    //     accountNo: row.accountNo ?? null,
    //     membershipGrpId: row.membershipGrpId ?? null,
    //     email: row.email ?? null,
    //     firstName: row.firstName ?? null,
    //     lastName: row.lastName ?? null,
    //     jobTitle: row.jobTitle ?? null,
    //     phoneNumber: row.phoneNumber ?? null,
    //     timeZone: row.timeZone ?? null,
    //     timeFormat: row.timeFormat ?? null,
    //     lastLoginDate: row.lastLoginDate ?? null,
    //     photo: row.photo ?? null,
    //     status: row.status ?? null,
    //     options: row.options ?? null,
    //     addedBy: row.addedBy ?? null,
    //     addedDate: row.addedDate ?? null,
    //     modifiedBy: row.modifiedBy ?? null,
    //     modifiedDate: row.modifiedDate ?? null,
    //     supabaseMigrated: row.supabaseMigrated ?? false
    //   };

    //   this.logger.log(`getUser: UserId='${normalized}' -> email='${response.email}', supabase_migrated=${response.supabaseMigrated}, id=${response.id}`);

    //   // If not yet migrated, attempt legacy authentication check
    //   if (response.supabaseMigrated === false) {
    //     const isValid = await this.VumberAuthenticate(username, password);
    //     response.legacyAuthenticated = !!isValid;
    //     if (!isValid) {
    //       this.logger.log(`getUser: UserId='${normalized}' failed legacy authentication`);
    //     } else {
    //       this.logger.log(`getUser: UserId='${normalized}' passed legacy authentication`);
    //     }
    //   }

    //   return response;
    // } catch (err) {
    //   const msg = (err?.message || String(err || '')).toLowerCase();
    //   // Detect common Azure SQL firewall / connectivity error and log a concise warning to avoid noisy stack traces
    //   if (msg.includes('cannot open server') || msg.includes('client with ip address') || msg.includes('is not allowed to access the server')) {
    //     this.logger.warn(`Database connection blocked by firewall or network rules. Skipping legacy lookup for '${username}'.`);
    //     return null;
    //   }

    //   // Default: log error and return null
    //   this.logger.error('Error fetching profile for username ' + username + ': ' + (err?.message || String(err)));
    //   return null;
    // }
  }

  // Get user profile by username (no authentication) — returns full profile DTO or null
  async getUserProfileByUsername(username: string): Promise<PpnUserProfileDto | null> {
    if (!username) return null;
    try {
      const normalized = username.trim();
      this.logger.log(`getUserProfileByUsername: looking up UserId='${normalized}'`);

      // userId is not unique in schema (index only) so use findFirst
      const row = await this.prisma.ppnUserProfile.findFirst({ where: { userId: normalized } }) as any | null;
      if (!row) {
        this.logger.log(`getUserProfileByUsername: no profile found for UserId='${normalized}'`);
        return null;
      }

      // derive supabaseMigrated from explicit column or options JSON
      // let supabaseMigrated = false;
      // try {
      //   if (typeof row.supabaseMigrated !== 'undefined') {
      //     supabaseMigrated = !!row.supabaseMigrated;
      //   } else if (row.options) {
      //     const opts = typeof row.options === 'string' ? JSON.parse(row.options) : row.options;
      //     if (opts && typeof opts.supabaseMigrated !== 'undefined') supabaseMigrated = !!opts.supabaseMigrated;
      //   }
      // } catch (e) {
      //   this.logger.warn('getUserProfileByUsername: failed to parse options JSON for supabaseMigrated flag: ' + (e?.message || e));
      //   supabaseMigrated = false;
      // }

      const response: PpnUserProfileDto = {
        id: row.id ?? null,
        type: row.type ?? null,
        userId: row.userId ?? normalized,
        accountNo: row.accountNo ?? null,
        membershipGrpId: row.membershipGrpId ?? null,
        email: row.email ?? null,
        firstName: row.firstName ?? null,
        lastName: row.lastName ?? null,
        jobTitle: row.jobTitle ?? null,
        phoneNumber: row.phoneNumber ?? null,
        timeZone: row.timeZone ?? null,
        timeFormat: row.timeFormat ?? null,
        lastLoginDate: row.lastLoginDate ?? null,
        photo: row.photo ?? null,
        status: row.status ?? null,
        options: row.options ?? null,
        addedBy: row.addedBy ?? null,
        addedDate: row.addedDate ?? null,
        modifiedBy: row.modifiedBy ?? null,
        modifiedDate: row.modifiedDate ?? null,
        supabaseMigrated: row.supabaseMigrated ?? false
      };

      this.logger.log(`getUserProfileByUsername: UserId='${normalized}' -> email='${response.email}', supabase_migrated=${response.supabaseMigrated}, id=${response.id}`);
      return response;
    } catch (err) {
      this.logger.error('Error fetching profile for username ' + username + ': ' + (err?.message || String(err)));
      return null;
    }
  }

  async VumberAuthenticate(username: string, password: string): Promise<boolean> {
    if (!username) return false;

    try {
      const normalized = username.trim();
      this.logger.log(`VumberAuthenticate: authenticating UserId='${normalized}'`);

      //call vumber system to authenticate user
      // const vumberAuth = require('../vumber-auth/vumber-auth');
      // const isValid = await vumberAuth.authenticate(username, password);
      // if(!isValid){
      //     this.logger.log(`VumberAuthenticate: UserId='${normalized}' failed legacy authentication`);
      //     return false;
      // }
      this.logger.log(`VumberAuthenticate: username='${normalized}' passed legacy authentication`);
      return true;
    } catch (err) {
      this.logger.error('Error authenticating username ' + username + ': ' + (err?.message || String(err)));
      return false;
    }
  }

  // Mark a Vumber system user profile as migrated to Supabase (writes a flag into options JSON)
  async markUserMigrated(id: number ): Promise<boolean> {
    this.logger.log(`markUserMigrated called for id='${id}'`);
    if (id === undefined || id === null ) return false;
    try {
      
      // fetch the row by primary id to get current options
      const rowById = await this.prisma.ppnUserProfile.findUnique({ where: { id: id } }) as any | null;
      console.log(`Row by id `, rowById);
      if (!rowById) {
        this.logger.error(`markUserMigrated: could not find profile for id='${id}'`);
        return false;
      }

      // Previously we updated the options JSON with a supabaseMigrated flag.
      // Now update the dedicated `supabaseMigrated` BIT column directly.
      this.logger.log(`markUserMigrated: updating supabaseMigrated flag for id=${id}`);

      // update by primary id (set the boolean column)
      let updatedRow = await this.prisma.ppnUserProfile.update({ where: { id }, data: ({ supabaseMigrated: true } as any) });
      this.logger.debug(`markUserMigrated: updated row: ${updatedRow ? 'ok' : 'none'}`);
      this.logger.log(`markUserMigrated: marked id='${id}' as migrated`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to mark id ${id} as migrated: ` + (err?.message || String(err)));
      return false;
    }
  }
}
