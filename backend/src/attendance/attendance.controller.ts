import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  Request,
  Res,
  Sse,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { AttendanceService } from './attendance.service';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { RegisterEventDto } from './dto/register-event.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly jwtService: JwtService,
  ) {}

  @Get()
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  getDailyAttendance(
    @Query('date') date: string,
    @Query('companyId') companyId?: string,
    @Request() req?: { user: RequestUser },
  ) {
    const requestedCompanyId = companyId ? parseInt(companyId, 10) : undefined;
    return this.attendanceService.getDailyAttendance(date, req!.user, requestedCompanyId);
  }

  @Get('latest-date')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  getLatestDate(
    @Query('companyId') companyId?: string,
    @Request() req?: { user: RequestUser },
  ) {
    const requestedCompanyId = companyId ? parseInt(companyId, 10) : undefined;
    return this.attendanceService.getLatestDate(req!.user, requestedCompanyId);
  }

  @Get('range')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  getRangeAttendance(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('companyId') companyId?: string,
    @Request() req?: { user: RequestUser },
  ) {
    const requestedCompanyId = companyId ? parseInt(companyId, 10) : undefined;
    return this.attendanceService.getRangeAttendance(dateFrom, dateTo, req!.user, requestedCompanyId);
  }

  @Get('employee/:id')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  getEmployeeAttendance(
    @Param('id', ParseIntPipe) id: number,
    @Query('month') month: string,
    @Query('year') year: string,
    @Request() req: { user: RequestUser },
  ) {
    return this.attendanceService.getEmployeeAttendance(
      id,
      parseInt(month, 10),
      parseInt(year, 10),
      req.user,
    );
  }

  @Patch(':id/correct')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель')
  correctAttendance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorrectAttendanceDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.attendanceService.correctAttendance(id, dto, req.user);
  }

  @Post('event')
  @Roles('Суперадмин', 'Кадровик')
  registerEvent(
    @Body() dto: RegisterEventDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.attendanceService.registerEvent(dto, req.user);
  }

  @Get('events/:id/selfie')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  async getSelfie(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, mimeType } = await this.attendanceService.getSelfiePhoto(id, req.user);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return new StreamableFile(buffer);
  }

  /** SSE-эндпоинт для real-time обновлений посещаемости. JWT передаётся через query ?token= */
  @Get('stream')
  @Sse()
  stream(
    @Query('date') date: string,
    @Query('token') token: string,
    @Query('companyId') companyId?: string,
    @Res({ passthrough: true }) res?: Response,
  ): Observable<MessageEvent> {
    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    const user: RequestUser = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId,
      companyName: payload.companyName,
      isHoldingAdmin: payload.isHoldingAdmin,
    };
    const cid = companyId ? parseInt(companyId, 10) : (user.companyId ?? null);
    const effectiveCid = user.isHoldingAdmin ? cid : (user.companyId ?? null);
    if (res) {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no');
    }
    return this.attendanceService.getUpdateStream(effectiveCid, date);
  }
}
