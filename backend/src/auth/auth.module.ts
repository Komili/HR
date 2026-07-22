import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './constants';
import { LocalStrategy } from './local.strategy';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller';
import { TelegramModule } from '../telegram/telegram.module';
import { IpLockoutService } from './ip-lockout.service';
import { IpLockoutGuard } from './ip-lockout.guard';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TelegramModule,
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '60m' }, // Токен живет 1 час
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy, IpLockoutService, IpLockoutGuard],
  controllers: [AuthController],
})
export class AuthModule {}
