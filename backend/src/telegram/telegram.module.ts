import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramSettingsService } from './telegram-settings.service';
import { TelegramSettingsController } from './telegram-settings.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TelegramSettingsController],
  providers: [TelegramService, TelegramSettingsService],
  exports: [TelegramService],
})
export class TelegramModule {}
