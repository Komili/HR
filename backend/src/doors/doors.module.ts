import { Module } from '@nestjs/common';
import { DoorsController } from './doors.controller';
import { DoorsService } from './doors.service';
import { AgentController } from './agent.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [PrismaModule, TelegramModule],
  controllers: [DoorsController, AgentController],
  providers: [DoorsService],
  exports: [DoorsService],
})
export class DoorsModule {}
