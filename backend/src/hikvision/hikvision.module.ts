import { Module } from '@nestjs/common';
import { HikvisionController } from './hikvision.controller';
import { HikvisionService } from './hikvision.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [PrismaModule, AttendanceModule, TelegramModule],
  controllers: [HikvisionController],
  providers: [HikvisionService],
})
export class HikvisionModule {}
