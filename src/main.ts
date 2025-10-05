import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { LoggerService } from './logger/logger.service';

async function bootstrap() {
  // Create the app without supplying a custom logger so we can attach our LoggerService
  const app = await NestFactory.create(AppModule);

  // Use the application's LoggerService as Nest's logger implementation
  try {
    const loggerService = app.get(LoggerService);
    if (loggerService) {
      app.useLogger(loggerService as any);
    }
  } catch (e) {
    // If logger isn't available yet, fall back to default Nest logger
    console.warn('Warning: could not attach LoggerService as Nest logger:', e?.message || e);
  }

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
