import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export interface UserCreateInput {
  user_name?: string | null;
  auth_provider?: number | null;
  auth_provider_id?: string | null;
  phone_number?: string | null;
  email?: string | null;
  is_anonymous?: boolean;
  is_active?: boolean;
  account_id?: string | null;
}

@Injectable()
export class AuthUsersService {
  private readonly logger = new Logger(AuthUsersService.name);
  private readonly prisma = new PrismaClient();

  async createUser(input: UserCreateInput) {
    if (!input) throw new BadRequestException('input is required');
    try {
      const rec = await (this.prisma as any).user.create({ data: {
        userName: input.user_name ?? null,
        authProvider: input.auth_provider ?? null,
        authProviderId: input.auth_provider_id ?? null,
        phoneNumber: input.phone_number ?? null,
        email: input.email ?? null,
        isAnonymous: input.is_anonymous ?? false,
        isActive: input.is_active ?? true,
        accountId: input.account_id ?? null,
      }});
      this.logger.debug('AuthUsersService.createUser: created id=' + rec.id);
      return rec;
    } catch (err: any) {
      this.logger.error('AuthUsersService.createUser failed', err);
      throw err;
    }
  }

  async getUserById(id: number) {
    if (!id) return null;
    try {
      const rec = await (this.prisma as any).user.findUnique({ where: { id } });
      return rec;
    } catch (err: any) {
      this.logger.error('AuthUsersService.getUserById failed', err);
      throw err;
    }
  }

  async findByProvider(provider: number | string, providerId: string) {
    if ((provider === null || provider === undefined) || !providerId) return null;
    try {
      const rec = await (this.prisma as any).user.findFirst({ where: { authProvider: provider, authProviderId: providerId } });
      return rec;
    } catch (err: any) {
      this.logger.error('AuthUsersService.findByProvider failed', err);
      throw err;
    }
  }

  /**
   * Lookup a local user record by auth provider (numeric enum or string) and provider-specific id.
   * This is a convenience wrapper with the same semantics as findByProvider.
   */
  async getUserByAuthProviderId(provider: number | string, providerId: string) {
    if ((provider === null || provider === undefined) || !providerId) return null;
    try {
      const rec = await (this.prisma as any).user.findFirst({ where: { authProvider: provider, authProviderId: providerId } });
      return rec ?? null;
    } catch (err: any) {
      this.logger.error('AuthUsersService.getUserByAuthProviderId failed', err);
      throw err;
    }
  }

  async updateUser(id: number, updates: Partial<UserCreateInput>) {
    if (!id) throw new BadRequestException('id is required');
    try {
      const data:any = {};
      if (updates.user_name !== undefined) data.userName = updates.user_name ?? null;
      if (updates.auth_provider !== undefined) data.authProvider = updates.auth_provider ?? null;
      if (updates.auth_provider_id !== undefined) data.authProviderId = updates.auth_provider_id ?? null;
      if (updates.phone_number !== undefined) data.phoneNumber = updates.phone_number ?? null;
      if (updates.email !== undefined) data.email = updates.email ?? null;
      if (updates.is_anonymous !== undefined) data.isAnonymous = !!updates.is_anonymous;
      if (updates.is_active !== undefined) data.isActive = !!updates.is_active;
      if (updates.account_id !== undefined) data.accountId = updates.account_id ?? null;

      const rec = await (this.prisma as any).user.update({ where: { id }, data });
      return rec;
    } catch (err:any) {
      this.logger.error('AuthUsersService.updateUser failed', err);
      throw err;
    }
  }

  async deleteUser(id: number) {
    if (!id) throw new BadRequestException('id is required');
    try {
      await (this.prisma as any).user.delete({ where: { id } });
      return true;
    } catch (err:any) {
      this.logger.error('AuthUsersService.deleteUser failed', err);
      throw err;
    }
  }
}
