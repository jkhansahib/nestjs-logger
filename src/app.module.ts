import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerModule } from './logger/logger.module'; // ✅ Import your logger module

@Module({
  imports: [LoggerModule], // ✅ Add here
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
