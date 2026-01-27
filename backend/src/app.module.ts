import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EmployeesModule } from './employees/employees.module';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, EmployeesModule, DocumentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
