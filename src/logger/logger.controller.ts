// src/logger/logger.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { LogDto } from './dto/log.dto';

@Controller('logs')
export class LoggerController {
  private readonly logger = new Logger('RemoteLogger');

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
