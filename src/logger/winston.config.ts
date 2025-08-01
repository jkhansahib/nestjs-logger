// // src/logger/winston.config.ts
// import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
// import * as winston from 'winston';

// export const winstonConfig: winston.LoggerOptions = {
//   transports: [
//     new winston.transports.Console({
//       format: winston.format.combine(
//         winston.format.timestamp(),
//         nestWinstonModuleUtilities.format.nestLike('NestApp', {
//           prettyPrint: true,
//         }),
//       ),
//     }),
//     new winston.transports.File({
//       filename: 'logs/error.log',
//       level: 'error',
//     }),
//     new winston.transports.File({
//       filename: 'logs/combined.log',
//     }),
//   ],
// };

import * as winston from 'winston';
import 'winston-daily-rotate-file';

export const winstonConfig = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(({ timestamp, level, message, context }) => {
      return `${timestamp} [${level.toUpperCase()}] ${context || ''} ${message}`;
    })
  ),
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
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  ],
});
