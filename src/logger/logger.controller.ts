// src/logger/logger.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { LogDto } from './dto/log.dto';
import { CreateLogDto } from './dto/create-log.dto';
import { LoggerService } from './logger.service';


@Controller('logs')
export class LoggerController {
  // private readonly logger = new Logger('RemoteLogger');
  // constructor(private readonly loggerService: LoggerService) {}
  constructor(private readonly logger: LoggerService) {}


  //  @Post()
  // log(@Body() logDto: CreateLogDto) {
  //   this.loggerService.log(logDto.message, logDto.context);
  //   return { status: 'logged' };
  // }

   @Post()
  log(@Body() body: { message: string; level?: string; context?: string }) {
    const { message, level = 'log', context } = body;
    this.logger[level]?.(message, context); // dynamically call log level
    return { status: 'ok' };
  }

  @Post()
  logFromClient(@Body() body: LogDto) {
    const { level, message } = body;

    switch (level) {
      case 'error':
        this.logger.error(message);
        break;
      case 'warn':
        this.logger.warn(message);
        break;
      case 'debug':
        this.logger.debug(message);
        break;
      case 'verbose':
        this.logger.verbose(message);
        break;
      default:
        this.logger.log(message);
    }

    return { status: 'ok' };
  }
}
