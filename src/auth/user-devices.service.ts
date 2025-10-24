import { Injectable, BadRequestException } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';
import { PrismaClient } from '@prisma/client';

export interface DeviceInput {
  user_id: number;
  device_id: string;
  device_type: string;
  device_name?: string | null;
  is_active?: boolean;
  refresh_token?: string | null;
  last_login_datetime?: string | Date | null;
  expires_datetime?: string | Date | null;
  last_refresh_datetime?: string | Date | null;
  platform?: string | null;
  brand_id?: number | null;
  notification_key?: string | null;
  notification_key_voip?: string | null;
  ip_info?: string | null;
  device_info?: string | null;
}

@Injectable()
export class UserDevicesService {
  private prisma: PrismaClient;

  constructor(private readonly logger: LoggerService) {
    this.prisma = new PrismaClient();
  }

  // Create a device record from a (partial) device object and return the inserted id.
  // Validates presence of user_id (or convertible) and device_id and device_type.
  async createDevice(device: Partial<DeviceInput> | Record<string, any>): Promise<number> {
    if (!device) throw new BadRequestException('device object is required');
    this.logger.log('UserDevicesService.createDevice: received device object', device); 

    // normalize/validate required fields
    const deviceId = (device as any)['device_id'] || (device as any)['deviceId'] || null;
    const deviceType = (device as any)['device_type'] || (device as any)['deviceType'] || null;
    let userId = (device as any)['user_id'] ?? (device as any)['userId'] ?? null;

    if (!deviceId || !deviceType) {
      throw new BadRequestException('device_id and device_type are required');
    }

    // attempt to coerce numeric user id if possible
    if (typeof userId === 'string' && userId.match(/^\d+$/)) {
      userId = Number(userId);
    }

    if (userId === null || userId === undefined) {
      throw new BadRequestException('user_id is required');
    }

    const input: DeviceInput = {
      user_id: Number(userId),
      device_id: String(deviceId),
      device_type: String(deviceType),
      device_name: (device as any)['device_name'] ?? (device as any)['deviceName'] ?? null,
      is_active: (device as any)['is_active'] !== undefined ? !!(device as any)['is_active'] : true,
      refresh_token: (device as any)['refresh_token'] ?? (device as any)['refreshToken'] ?? null,
      last_login_datetime: (device as any)['last_login_datetime'] ?? (device as any)['lastLoginDatetime'] ?? new Date(),
      expires_datetime: (device as any)['expires_datetime'] ?? (device as any)['expiresDatetime'] ?? null,
      last_refresh_datetime: (device as any)['last_refresh_datetime'] ?? (device as any)['lastRefreshDatetime'] ?? null,
      platform: (device as any)['platform'] ?? null,
      brand_id: (device as any)['brand_id'] ?? (device as any)['brandId'] ?? null,
      notification_key: (device as any)['notification_key'] ?? (device as any)['notificationKey'] ?? null,
      notification_key_voip: (device as any)['notification_key_voip'] ?? (device as any)['notificationKeyVoip'] ?? null,
      ip_info: (device as any)['ip_info'] ?? (device as any)['ipInfo'] ?? null,
      device_info: (device as any)['device_info'] ?? (device as any)['deviceInfo'] ?? null,
    };

    this.logger.log(`UserDevicesService.createDevice: inserting device for user_id=${input.user_id} device_id=${input.device_id}`);
    try{
    let response =  await this.insertDevice(input);
    this.logger.log(`UserDevicesService.createDevice: inserted device with id=${response}`);
    return response
    
    } catch (error) {
      this.logger.error('UserDevicesService.createDevice: error inserting device', error);
      throw error;
    }
    
  }

  // Insert a device and return the inserted id
  async insertDevice(input: DeviceInput): Promise<number> {
    try {
      // Map DeviceInput fields to Prisma UserDevice model fields
      const created = await (this.prisma as any).userDevice.create({
        data: {
          userId: input.user_id,
          deviceId: input.device_id,
          deviceType: input.device_type,
          deviceName: input.device_name ?? null,
          refreshToken: input.refresh_token ?? null,
          isActive: input.is_active === false ? false : true,
          lastLoginDatetime: input.last_login_datetime ? new Date(input.last_login_datetime as any) : null,
          expiresDatetime: input.expires_datetime ? new Date(input.expires_datetime as any) : null,
          lastRefreshDatetime: input.last_refresh_datetime ? new Date(input.last_refresh_datetime as any) : null,
          platform: input.platform ?? null,
          brandId: input.brand_id ?? null,
          notificationKey: input.notification_key ?? null,
          notificationKeyVoip: input.notification_key_voip ?? null,
          ipInfo: input.ip_info ?? null,
          deviceInfo: input.device_info ?? null,
        }
      });
      this.logger.debug?.('Prisma userDevice.create result: ' + JSON.stringify(created));
      return Number(created.id || 0);
    } catch (err: any) {
      this.logger.error('Prisma insertDevice failed', err);
      throw err;
    }
  }

  // Update device by id, only provided fields
  async updateDevice(id: number, updates: Partial<DeviceInput>): Promise<boolean> {
    if (!id) return false;
    try {
      const data: any = {};
      if (updates.user_id !== undefined) data.userId = updates.user_id;
      if (updates.device_id !== undefined) data.deviceId = updates.device_id;
      if (updates.device_type !== undefined) data.deviceType = updates.device_type;
      if (updates.device_name !== undefined) data.deviceName = updates.device_name ?? null;
      if (updates.is_active !== undefined) data.isActive = !!updates.is_active;
      if (updates.last_login_datetime !== undefined) data.lastLoginDatetime = updates.last_login_datetime ? new Date(updates.last_login_datetime as any) : null;
      if (updates.expires_datetime !== undefined) data.expiresDatetime = updates.expires_datetime ? new Date(updates.expires_datetime as any) : null;
      if (updates.last_refresh_datetime !== undefined) data.lastRefreshDatetime = updates.last_refresh_datetime ? new Date(updates.last_refresh_datetime as any) : null;
      if (updates.platform !== undefined) data.platform = updates.platform ?? null;
      if (updates.brand_id !== undefined) data.brandId = updates.brand_id ?? null;
      if (updates.notification_key !== undefined) data.notificationKey = updates.notification_key ?? null;
      if (updates.notification_key_voip !== undefined) data.notificationKeyVoip = updates.notification_key_voip ?? null;
      if (updates.refresh_token !== undefined) data.refreshToken = updates.refresh_token ?? null;
      if (updates.ip_info !== undefined) data.ipInfo = updates.ip_info ?? null;
      if (updates.device_info !== undefined) data.deviceInfo = updates.device_info ?? null;

      if (Object.keys(data).length === 0) return false;

      const updated = await (this.prisma as any).userDevice.update({ where: { id }, data });
      this.logger.debug?.(`Prisma updateDevice updated record id=${id}`);
      return !!updated;
    } catch (err: any) {
      this.logger.error('Prisma updateDevice failed', err);
      throw err;
    }
  }

  // Delete device
  async deleteDevice(id: number): Promise<boolean> {
    try {
      await (this.prisma as any).userDevice.delete({ where: { id } });
      return true;
    } catch (err: any) {
      this.logger.error('Prisma deleteDevice failed', err);
      throw err;
    }
  }

  // Get device by id
  async getDeviceById(id: number): Promise<any | null> {
    try {
      const rec = await (this.prisma as any).userDevice.findUnique({ where: { id } });
      return rec ?? null;
    } catch (err: any) {
      this.logger.error('Prisma getDeviceById failed', err);
      throw err;
    }
  }

  // Find devices for a user
  async findDevicesByUserId(userId: number): Promise<any[]> {
    try {
      const res = await (this.prisma as any).userDevice.findMany({ where: { userId } });
      return Array.isArray(res) ? res : [];
    } catch (err: any) {
      this.logger.error('Prisma findDevicesByUserId failed', err);
      throw err;
    }
  }

  // Upsert device by device_id + user_id
  async upsertDevice(input: DeviceInput): Promise<number> {
    try {
      this.logger.debug?.(`Prisma upsertDevice: checking existing device for user_id=${input.user_id} device_id=${input.device_id}`);
      const existing = await (this.prisma as any).userDevice.findFirst({ where: { deviceId: input.device_id, userId: input.user_id } });
      this.logger.debug?.('Prisma upsertDevice existing select result: ' + JSON.stringify(existing));
      if (existing) {
        const id = existing.id;
        await this.updateDevice(Number(id), input);
        this.logger.debug?.(`Prisma upsertDevice: update completed for id=${id}`);
        return Number(id);
      }
      const newRec = await (this.prisma as any).userDevice.create({ data: {
        userId: input.user_id,
        deviceId: input.device_id,
        deviceType: input.device_type,
        deviceName: input.device_name ?? null,
        refreshToken: input.refresh_token ?? null,
        isActive: input.is_active === false ? false : true,
        lastLoginDatetime: input.last_login_datetime ? new Date(input.last_login_datetime as any) : null,
        expiresDatetime: input.expires_datetime ? new Date(input.expires_datetime as any) : null,
        lastRefreshDatetime: input.last_refresh_datetime ? new Date(input.last_refresh_datetime as any) : null,
        platform: input.platform ?? null,
        brandId: input.brand_id ?? null,
        notificationKey: input.notification_key ?? null,
        notificationKeyVoip: input.notification_key_voip ?? null,
        ipInfo: input.ip_info ?? null,
        deviceInfo: input.device_info ?? null,
      }});
      this.logger.debug?.(`Prisma upsertDevice: inserted new id=${newRec.id}`);
      return Number(newRec.id || 0);
    } catch (err: any) {
      this.logger.error('Prisma upsertDevice failed', err);
      throw err;
    }
  }

  async deactivateDevice(id: number): Promise<boolean> {
    return this.updateDevice(id, { is_active: false });
  }

  // Find device by refresh token
  async findDeviceByRefreshToken(refreshToken: string): Promise<any | null> {
    try {
      if (!refreshToken) return null;
      const rec = await (this.prisma as any).userDevice.findFirst({ where: { refreshToken } });
      return rec ?? null;
    } catch (err: any) {
      this.logger.error('Prisma findDeviceByRefreshToken failed', err);
      throw err;
    }
  }

  async close() {
    try {
      await this.prisma.$disconnect();
      this.logger.debug?.('Prisma client disconnected for UserDevicesService');
    } catch (err: any) {
      this.logger.error('Prisma disconnect failed', err);
    }
  }
}
