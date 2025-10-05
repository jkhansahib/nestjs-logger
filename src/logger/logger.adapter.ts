// Adapter interface and DI token for pluggable logging backends
export const LOGGER_ADAPTER = 'LOGGER_ADAPTER';

export interface ILoggerAdapter {
  log(message: any, meta?: any): any;
  info(message: any, meta?: any): any;
  error(message: any, meta?: any): any;
  warn(message: any, meta?: any): any;
  debug(message: any, meta?: any): any;
  verbose(message: any, meta?: any): any;
  child?(meta: any): any;
  getLogger?(): any;
}
