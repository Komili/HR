import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    JwtModule.register({
      secret: 'SECRET_KEY', // В реальном приложении вынести в .env
      signOptions: { expiresIn: '60m' },
    }),
  ],
  providers: [AuthService],
})
export class AuthModule {}
