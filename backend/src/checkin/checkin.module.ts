import { Module } from '@nestjs/common';
import { CheckinService } from './checkin.service';
import { CheckinController, CheckinAdminController } from './checkin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [PrismaModule, AttendanceModule, TelegramModule],
  controllers: [CheckinController, CheckinAdminController],
  providers: [CheckinService],
})
export class CheckinModule {}
