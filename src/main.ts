import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './logger/winston.config';
import * as winston from 'winston';
import { LoggerService } from './logger/logger.service';


async function bootstrap() {
  // const app = await NestFactory.create(AppModule, {
  //   logger: WinstonModule.createLogger(winstonConfig),
  // });
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: `logs/${new Date().toISOString().split('T')[0]}.log`,
          format: winston.format.json(),
        }),
      ],
    }),
  });
  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('NestJS Boilerplate API')
    .setDescription('The API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
}
bootstrap();
