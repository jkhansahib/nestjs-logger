import type { ILoggerAdapter } from './logger.adapter';
import { winstonConfig } from './winston.config';

export class WinstonAdapter implements ILoggerAdapter {
  private logger = winstonConfig;

  log(message: any, meta?: any) {
    this.logger.info(message, meta);
  }
  info(message: any, meta?: any) {
    this.logger.info(message, meta);
  }
  error(message: any, meta?: any) {
    this.logger.error(message, meta);
  }
  warn(message: any, meta?: any) {
    this.logger.warn(message, meta);
  }
  debug(message: any, meta?: any) {
    this.logger.debug(message, meta);
  }
  verbose(message: any, meta?: any) {
    this.logger.verbose ? this.logger.verbose(message, meta) : this.logger.debug(message, meta);
  }

  child(meta: any) {
    if (typeof this.logger.child === 'function') return this.logger.child(meta);
    return this.logger;
  }

  getLogger() {
    return this.logger;
  }
}
