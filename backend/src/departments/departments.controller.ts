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
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { DepartmentDto } from './dto/department.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @Roles('Кадровик')
  create(@Body() departmentDto: DepartmentDto) {
    return this.departmentsService.create(departmentDto);
  }

  @Get()
  @Roles('Кадровик', 'Руководитель')
  findAll() {
    return this.departmentsService.findAll();
  }

  @Get(':id')
  @Roles('Кадровик', 'Руководитель')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const department = await this.departmentsService.findOne(id);
    if (!department) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }
    return department;
  }

  @Patch(':id')
  @Roles('Кадровик')
  update(@Param('id', ParseIntPipe) id: number, @Body() departmentDto: DepartmentDto) {
    return this.departmentsService.update(id, departmentDto);
  }

  @Delete(':id')
  @Roles('Кадровик')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.remove(id);
  }
}
