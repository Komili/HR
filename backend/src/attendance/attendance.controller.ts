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
} from '@nestjs/common';
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
  constructor(private readonly attendanceService: AttendanceService) {}

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
}
