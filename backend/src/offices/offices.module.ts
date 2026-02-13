import { Module } from '@nestjs/common';
import { OfficesController } from './offices.controller';
import { OfficesService } from './offices.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OfficesController],
  providers: [OfficesService],
})
export class OfficesModule {}
