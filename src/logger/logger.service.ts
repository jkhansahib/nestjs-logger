import { Inject, Injectable, Optional } from '@nestjs/common';
import { LOGGER_ADAPTER } from './logger.adapter';
import type { ILoggerAdapter } from './logger.adapter';

@Injectable()
export class LoggerService {
  constructor(
    @Optional() @Inject(LOGGER_ADAPTER) private readonly adapter?: ILoggerAdapter,
  ) {}

  // Safe stringify helper to handle BigInt and other non-serializable values
  private safeStringify(obj: any): string {
    try {
      return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    } catch (err) {
      try {
        return String(obj);
      } catch (_e) {
        return '[unserializable]';
      }
    }
  }

  private get logger(): ILoggerAdapter {
    // Provide a minimal console adapter when no adapter injected
    if (this.adapter) return this.adapter;
    return {
      log: (m: any, meta?: any) => console.log('[INFO]', meta || '', typeof m === 'object' ? this.safeStringify(m) : m),
      info: (m: any, meta?: any) => console.log('[INFO]', meta || '', typeof m === 'object' ? this.safeStringify(m) : m),
      error: (m: any, meta?: any) => console.error('[ERROR]', meta || '', typeof m === 'object' ? this.safeStringify(m) : m),
      warn: (m: any, meta?: any) => console.warn('[WARN]', meta || '', typeof m === 'object' ? this.safeStringify(m) : m),
      debug: (m: any, meta?: any) => console.debug('[DEBUG]', meta || '', typeof m === 'object' ? this.safeStringify(m) : m),
      verbose: (m: any, meta?: any) => console.log('[VERBOSE]', meta || '', typeof m === 'object' ? this.safeStringify(m) : m),
      child: (meta: any) => null,
      getLogger: () => console,
    } as ILoggerAdapter;
  }

  private safeInvoke(method: keyof ILoggerAdapter, message: any, meta?: any) {
    try {
      const logger = this.logger;
      const fn = (logger as any)[method];
      if (fn && typeof fn === 'function') {
        if (meta && typeof meta === 'object') {
          fn.call(logger, message, meta);
        } else if (meta !== undefined) {
          fn.call(logger, message, { context: String(meta) });
        } else {
          fn.call(logger, message);
        }
        return;
      }

      // fallback to generic log
      if ((logger as any).log && typeof (logger as any).log === 'function') {
        (logger as any).log(method, message, meta);
        return;
      }

      // final fallback
      console.log(`[${String(method).toUpperCase()}]`, meta || '', typeof message === 'object' ? this.safeStringify(message) : message);
    } catch (err) {
      console.log(`[${String(method).toUpperCase()}]`, message, meta || '', '(logger fallback)');
    }
  }

  log(message: string | object, context?: string | object) {
    this.safeInvoke('info', message, context);
  }

  error(message: string | object, trace?: string | object, context?: string | object) {
    const meta: any = {};
    if (trace) meta.trace = trace;
    if (context) meta.context = context;
    this.safeInvoke('error', message, Object.keys(meta).length ? meta : undefined);
  }

  warn(message: string | object, context?: string | object) {
    this.safeInvoke('warn', message, context);
  }

  debug(message: string | object, context?: string | object) {
    this.safeInvoke('debug', message, context);
  }

  verbose(message: string | object, context?: string | object) {
    this.safeInvoke('verbose', message, context);
  }

  getLogger(): any {
    return this.logger.getLogger ? this.logger.getLogger() : this.logger;
  }

  child(meta: any): any {
    return this.logger.child ? this.logger.child(meta) : this.logger;
  }
}
