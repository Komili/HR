import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

// Проверка обязательных переменных окружения при старте
function validateEnv() {
  const required = ['JWT_SECRET', 'DATABASE_URL'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`КРИТИЧЕСКАЯ ОШИБКА: отсутствуют обязательные переменные: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('ВНИМАНИЕ: JWT_SECRET слишком короткий (рекомендуется минимум 32 символа)');
  }
}

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Заголовки безопасности
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // для фото сотрудников
  }));

  // Глобальный префикс API
  app.setGlobalPrefix('api');

  // CORS — только разрешённые источники
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:7373,http://localhost:7474')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
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

  // Включаем graceful shutdown (для уведомления Telegram при остановке)
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 HRMS Backend запущен на порту ${port}`);
}
bootstrap();
