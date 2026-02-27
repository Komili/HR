import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Глобальный префикс API
  app.setGlobalPrefix('api');

  // CORS для фронтенда
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:7373',
      'http://localhost:7474',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:7373',
      'http://127.0.0.1:7474',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Валидация DTO
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  }));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 HRMS Backend запущен на порту ${port}`);
}
bootstrap();
