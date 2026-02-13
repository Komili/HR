import { Module } from '@nestjs/common';
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

@Module({
  imports: [
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
