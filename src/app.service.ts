import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';


@Injectable()
export class AppService {
  // Using NestJS Logger for logging
  // This will utilize the Winston logger configured in main.ts
  private readonly logger = new Logger(AppService.name);

  getHello(): string {
    // Log a message using the logger
    this.logger.log('Hello World triggered');
    this.logger.debug('Debug message');
    this.logger.error('Something went wrong');

    return 'Hello World!';
  }
}
