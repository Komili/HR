import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  ParseIntPipe, Query, UseGuards, Request,
} from '@nestjs/common';
import { DoorsService } from './doors.service';
import { CreateDoorDto, UpdateDoorDto } from './dto/door.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('doors')
export class DoorsController {
  constructor(private readonly doorsService: DoorsService) {}

  // ── Doors CRUD (Суперадмин) ──

  @Get()
  @Roles('Суперадмин', 'Кадровик', 'Руководитель')
  findAll(
    @Request() req: { user: RequestUser },
    @Query('companyId') companyId?: string,
  ) {
    return this.doorsService.findAll(req.user, companyId ? parseInt(companyId) : undefined);
  }

  @Post()
  @Roles('Суперадмин')
  create(@Body() dto: CreateDoorDto, @Request() req: { user: RequestUser }) {
    return this.doorsService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles('Суперадмин')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDoorDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.doorsService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('Суперадмин')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req: { user: RequestUser }) {
    return this.doorsService.remove(id, req.user);
  }

  // ── Access management ──

  @Get('employee/:employeeId')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель')
  getEmployeeDoors(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.doorsService.getEmployeeDoors(employeeId, req.user);
  }

  @Post(':id/grant/:employeeId')
  @Roles('Суперадмин', 'Кадровик')
  grantAccess(
    @Param('id', ParseIntPipe) doorId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.doorsService.grantAccess(doorId, employeeId, req.user);
  }

  @Delete(':id/revoke/:employeeId')
  @Roles('Суперадмин', 'Кадровик')
  revokeAccess(
    @Param('id', ParseIntPipe) doorId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.doorsService.revokeAccess(doorId, employeeId, req.user);
  }
}
