import { Global, Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { LoggerService } from './logger.service';
import * as winston from 'winston';
import 'winston-daily-rotate-file';


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
        //       new winston.transports.Console({
        //   format: winston.format.combine(
        //     winston.format.timestamp(),
        //     winston.format.json()
        //   ),
        // }),
      ],
      format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
          winston.format.printf(({ timestamp, level, message, context }) => {
            return `${timestamp} [${level.toUpperCase()}] ${context || ''} ${message}`;
          })
        ),

    }),
  ],
  providers: [LoggerService],
  exports: [LoggerService], // <- Important!
})
export class LoggerModule {}
