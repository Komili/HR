import {
  Controller, Post, Get, Patch, Delete,
  Param, Body, Req, Query,
  HttpCode, HttpStatus, ForbiddenException, ParseIntPipe,
  UseGuards, Request,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request as ExpressRequest } from 'express';
import { HikvisionService } from './hikvision.service';
import { HikvisionIsupService } from './hikvision-isup.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';

@Controller('hikvision')
export class HikvisionController {
  constructor(
    private readonly hikvisionService: HikvisionService,
    private readonly isupService: HikvisionIsupService,
  ) {}

  // ─── Webhook от устройств (без JWT, защищён токеном) ───

  @SkipThrottle()
  @Post('event')
  @HttpCode(HttpStatus.OK)
  async handleEvent(
    @Req() req: ExpressRequest,
    @Query('token') token?: string,
  ): Promise<void> {
    const expected = process.env.HIKVISION_WEBHOOK_TOKEN;
    if (expected && token !== expected) {
      throw new ForbiddenException('Неверный токен');
    }

    const rawBody = (req as any).rawBody as Buffer | undefined;
    const body = rawBody && rawBody.length > 0
      ? rawBody
      : Buffer.from(JSON.stringify(req.body ?? {}));

    const forwarded = req.headers['x-forwarded-for'];
    const externalIp = forwarded
      ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]).trim()
      : (req.socket?.remoteAddress || req.ip || '').replace('::ffff:', '');

    await this.hikvisionService.handleEvent(body, externalIp);
  }

  // ─── Управление обнаруженными устройствами (суперадмин) ───

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Суперадмин')
  @Get('devices')
  getDevices(@Request() req: { user: RequestUser }) {
    return this.hikvisionService.getDevices(req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  @Get('devices/active')
  getActiveDevices(
    @Query('companyId', ParseIntPipe) companyId: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.hikvisionService.getActiveDevicesForCompany(companyId, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Суперадмин')
  @Patch('devices/:id/bind')
  bindDevice(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { companyId: number; officeName: string; direction: 'IN' | 'OUT'; login?: string; password?: string },
    @Request() req: { user: RequestUser },
  ) {
    return this.hikvisionService.bindDevice(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Суперадмин')
  @Patch('devices/:id/unbind')
  unbindDevice(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.hikvisionService.unbindDevice(id, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Суперадмин')
  @Delete('devices/:id')
  deleteDevice(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.hikvisionService.deleteDevice(id, req.user);
  }

  // ─── Доступ сотрудников к устройствам ───

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Суперадмин', 'Кадровик', 'Руководитель')
  @Get('devices/employee/:employeeId')
  getEmployeeDevices(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.hikvisionService.getEmployeeDevices(employeeId, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Суперадмин', 'Кадровик')
  @Post('devices/:id/grant/:employeeId')
  grantAccess(
    @Param('id', ParseIntPipe) deviceId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.hikvisionService.grantAccess(deviceId, employeeId, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Суперадмин', 'Кадровик')
  @Delete('devices/:id/revoke/:employeeId')
  revokeAccess(
    @Param('id', ParseIntPipe) deviceId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.hikvisionService.revokeAccess(deviceId, employeeId, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Суперадмин')
  @Get('devices/:id/ping')
  pingDevice(
    @Param('id', ParseIntPipe) deviceId: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.hikvisionService.pingDevice(deviceId, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Суперадмин', 'Кадровик', 'Руководитель')
  @Get('devices/:id/check/:employeeId')
  checkAccess(
    @Param('id', ParseIntPipe) deviceId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.hikvisionService.checkAccess(deviceId, employeeId, req.user);
  }

  // ─── ISUP статус ───

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Суперадмин')
  @Get('isup/status')
  getIsupStatus() {
    const devices = this.isupService.getConnectedDevices();
    return {
      connected: devices.length,
      devices: devices.map(d => ({
        mac: d.mac,
        deviceId: d.deviceId,
        remoteAddr: d.remoteAddr,
        connectedSince: d.connectedAt,
        uptimeMin: Math.floor((Date.now() - d.connectedAt.getTime()) / 60000),
      })),
    };
  }

  // ─── Тест Telegram ───

  @SkipThrottle()
  @Get('test')
  async sendTest(
    @Query('token') token?: string,
  ): Promise<{ ok: boolean; message: string }> {
    const expected = process.env.HIKVISION_WEBHOOK_TOKEN;
    if (expected && token !== expected) {
      throw new ForbiddenException('Добавьте ?token=... в URL');
    }
    const message = await this.hikvisionService.sendTestMessage();
    return { ok: true, message };
  }
}
