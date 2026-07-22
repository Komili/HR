import { Module } from '@nestjs/common';
import { RegistrationController } from './registration.controller';
import { RegistrationAdminController } from './registration-admin.controller';
import { RegistrationService } from './registration.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [PrismaModule, TelegramModule, EmployeesModule],
  controllers: [RegistrationController, RegistrationAdminController],
  providers: [RegistrationService],
})
export class RegistrationModule {}
