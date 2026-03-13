import {
  Controller, Get, Post, Query, Body, UseGuards, Request,
  ParseIntPipe,
} from '@nestjs/common';
import { CheckinService } from './checkin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';

// ── Публичные эндпоинты (без JWT) ──

@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  // Список сотрудников по офису + валидация токена
  @Get('employees')
  getEmployees(
    @Query('officeId', ParseIntPipe) officeId: number,
    @Query('token') token: string,
  ) {
    return this.checkinService.getEmployees(officeId, token);
  }

  // Записать событие check-in/out
  @Post('event')
  recordEvent(
    @Body() body: {
      officeId: number;
      token: string;
      employeeId: number;
      direction: 'IN' | 'OUT';
      selfie?: string;
    },
  ) {
    return this.checkinService.recordEvent(
      body.officeId,
      body.token,
      body.employeeId,
      body.direction,
      body.selfie,
    );
  }
}

// ── Защищённый эндпоинт для admin (получить токен для QR) ──

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('checkin/admin')
export class CheckinAdminController {
  constructor(private readonly checkinService: CheckinService) {}

  @Get('qr')
  @Roles('Суперадмин', 'Кадровик')
  getQr(
    @Query('officeId', ParseIntPipe) officeId: number,
  ) {
    return this.checkinService.getQrInfo(officeId);
  }
}
