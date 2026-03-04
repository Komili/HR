import { Module } from '@nestjs/common';
import { PositionHistoryController } from './position-history.controller';
import { PositionHistoryService } from './position-history.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PositionHistoryController],
  providers: [PositionHistoryService],
})
export class PositionHistoryModule {}
