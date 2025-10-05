import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly prisma = new PrismaClient();

  async check(): Promise<any> {
    const result: any = { uptime: process.uptime(), timestamp: new Date().toISOString() };

    // Check DB
    try {
      // lightweight query
      await this.prisma.$queryRaw`SELECT 1 as result`;
      result.db = { ok: true };
    } catch (err: any) {
      this.logger.warn('Database health check failed: ' + (err?.message || String(err)));
      result.db = { ok: false, error: err?.message || String(err) };
    }

    // Check Supabase reachability by pinging the base URL
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      if (!supabaseUrl) {
        result.supabase = { ok: false, error: 'SUPABASE_URL not configured' };
      } else {
        const res = await fetch(supabaseUrl, { method: 'GET' });
        if (res.ok) result.supabase = { ok: true, status: res.status };
        else result.supabase = { ok: false, status: res.status, statusText: res.statusText };
      }
    } catch (err: any) {
      this.logger.warn('Supabase reachability check failed: ' + (err?.message || String(err)));
      result.supabase = { ok: false, error: err?.message || String(err) };
    }

    return result;
  }
}
