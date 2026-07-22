import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ReadOnlyInterceptor } from './auth/read-only.interceptor';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EmployeesModule } from './employees/employees.module';
import { DocumentsModule } from './documents/documents.module';
import { DepartmentsModule } from './departments/departments.module';
import { PositionsModule } from './positions/positions.module';
import { CompaniesModule } from './companies/companies.module';
import { InventoryModule } from './inventory/inventory.module';
import { OfficesModule } from './offices/offices.module';
import { AttendanceModule } from './attendance/attendance.module';
import { SalaryModule } from './salary/salary.module';
import { TelegramModule } from './telegram/telegram.module';
import { HikvisionModule } from './hikvision/hikvision.module';
import { PositionHistoryModule } from './position-history/position-history.module';
import { DoorsModule } from './doors/doors.module';
import { CheckinModule } from './checkin/checkin.module';
import { RegistrationModule } from './registration/registration.module';
import { VacanciesModule } from './vacancies/vacancies.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    EmployeesModule,
    DocumentsModule,
    DepartmentsModule,
    PositionsModule,
    CompaniesModule,
    InventoryModule,
    OfficesModule,
    AttendanceModule,
    SalaryModule,
    TelegramModule,
    HikvisionModule,
    PositionHistoryModule,
    DoorsModule,
    CheckinModule,
    RegistrationModule,
    VacanciesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ReadOnlyInterceptor },
  ],
})
export class AppModule {}
