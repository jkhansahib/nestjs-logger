import { Global, Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { LoggerService } from './logger.service';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { LOGGER_ADAPTER } from './logger.adapter';
import { WinstonAdapter } from './winston.adapter';

@Global()
@Module({
  imports: [
    WinstonModule.forRoot({
      transports: [
        new winston.transports.DailyRotateFile({
          dirname: 'logs',
          filename: 'app-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: false,
          maxSize: '20m',
          maxFiles: '14d',
          level: 'debug',
        }),
        new winston.transports.DailyRotateFile({
          dirname: 'logs/errors',
          filename: 'error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          level: 'error',
        }),
        // Console transport with custom human-friendly format
        new winston.transports.Console({
          level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.printf((info) => {
              // Extract known fields and remaining meta
              const { timestamp, level, message, ...rest } = info as any;

              // Normalize message & context when Nest passes structured objects
              let msgText = '';
              let ctx = '';

              if (message && typeof message === 'object') {
                msgText = message.message ?? JSON.stringify(message);
                ctx = message.context ?? '';
              } else {
                msgText = String(message ?? '');
                ctx = rest.context ?? rest?.meta?.context ?? '';
              }

              // Remove context from rest when present so it's not duplicated
              if (rest.context) delete rest.context;
              if (rest.meta && rest.meta.context) delete rest.meta.context;

              const restStr = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
              return `${timestamp} : [${String(level).toUpperCase()}] : ${ctx} : ${msgText}${restStr}`;
            })
          ),
        }),
      ],

      // File-format: keep timestamp + simple printf for files
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.printf(({ timestamp, level, message, context }) => {
          return `${timestamp} [${level.toUpperCase()}] ${context || ''} ${message}`;
        })
      ),
    }),
  ],
  providers: [LoggerService, { provide: LOGGER_ADAPTER, useClass: WinstonAdapter }],
  exports: [LoggerService, LOGGER_ADAPTER], // <- Important!
})
export class LoggerModule {}
