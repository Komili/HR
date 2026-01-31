import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
  NotFoundException,
  Request,
  Query,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { DepartmentDto } from './dto/department.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @Roles('Суперадмин', 'Кадровик')
  create(
    @Body() departmentDto: DepartmentDto,
    @Request() req: { user: RequestUser },
  ) {
    const targetCompanyId = req.user.isHoldingAdmin && departmentDto.companyId
      ? departmentDto.companyId
      : req.user.companyId;

    if (!targetCompanyId) {
      throw new NotFoundException('Company ID is required');
    }

    return this.departmentsService.create({
      name: departmentDto.name,
      company: { connect: { id: targetCompanyId } },
    });
  }

  @Get()
  @Roles('Суперадмин', 'Кадровик', 'Руководитель')
  findAll(
    @Request() req: { user: RequestUser },
    @Query('companyId') companyId?: string,
  ) {
    const requestedCompanyId = companyId ? parseInt(companyId, 10) : undefined;
    return this.departmentsService.findAll(req.user, requestedCompanyId);
  }

  @Get(':id')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    const department = await this.departmentsService.findOne(id, req.user);
    if (!department) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }
    return department;
  }

  @Patch(':id')
  @Roles('Суперадмин', 'Кадровик')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() departmentDto: DepartmentDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.departmentsService.update(id, { name: departmentDto.name }, req.user);
  }

  @Delete(':id')
  @Roles('Суперадмин', 'Кадровик')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.departmentsService.remove(id, req.user);
  }
}
