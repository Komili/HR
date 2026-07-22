import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import { IpLockoutGuard } from './ip-lockout.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Жёсткое ограничение на вход: 10 попыток в 5 минут + блокировка IP после серии неудач
  @Throttle({ default: { limit: 10, ttl: 300000 } })
  @UseGuards(IpLockoutGuard, LocalAuthGuard)
  @Post('login')
  async login(@Request() req, @Body() loginDto: LoginDto) {
    return this.authService.login(req.user, req.ip);
  }

  // Публичная саморегистрация — всегда создаёт только роль "Сотрудник" (без доступа к данным).
  // Роль нельзя передать извне: назначение прав выполняется только суперадмином через /users.
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register({
      email: registerDto.email,
      password: registerDto.password,
    });
  }
}
