import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Request, UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { PositionHistoryService } from './position-history.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('position-history')
export class PositionHistoryController {
  constructor(private readonly service: PositionHistoryService) {}

  @Get('employee/:employeeId')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  findByEmployee(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.service.findByEmployee(employeeId, req.user);
  }

  @Post('employee/:employeeId')
  @Roles('Суперадмин', 'Кадровик')
  create(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() body: {
      departmentName?: string;
      positionName?: string;
      startDate: string;
      endDate?: string;
      note?: string;
    },
    @Request() req: { user: RequestUser },
  ) {
    return this.service.create(employeeId, body, req.user);
  }

  @Patch(':id')
  @Roles('Суперадмин', 'Кадровик')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
      departmentName?: string;
      positionName?: string;
      startDate?: string;
      endDate?: string;
      note?: string;
    },
    @Request() req: { user: RequestUser },
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  @Roles('Суперадмин', 'Кадровик')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.service.remove(id, req.user);
  }
}
