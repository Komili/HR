import { Module } from '@nestjs/common';
import { RegistrationController } from './registration.controller';
import { RegistrationAdminController } from './registration-admin.controller';
import { RegistrationService } from './registration.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RegistrationController, RegistrationAdminController],
  providers: [RegistrationService],
})
export class RegistrationModule {}
