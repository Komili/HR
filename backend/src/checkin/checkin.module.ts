import { Module } from '@nestjs/common';
import { CheckinService } from './checkin.service';
import { CheckinController, CheckinAdminController } from './checkin.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CheckinController, CheckinAdminController],
  providers: [CheckinService],
})
export class CheckinModule {}
