import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  NotFoundException,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles('Кадровик')
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    const { departmentId, positionId, ...employeeData } = createEmployeeDto;
    const data = {
      ...employeeData,
      department: departmentId ? { connect: { id: departmentId } } : undefined,
      position: positionId ? { connect: { id: positionId } } : undefined,
    };
    return this.employeesService.create(data);
  }

  @Get()
  @Roles('Кадровик', 'Руководитель')
  findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    return this.employeesService.findAll(+page, +limit, search);
  }

  @Get(':id')
  @Roles('Кадровик', 'Руководитель', 'Бухгалтер')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const employee = await this.employeesService.findOne(id);
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }
    return employee;
  }

  @Patch(':id')
  @Roles('Кадровик')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    const { departmentId, positionId, ...employeeData } = updateEmployeeDto;
    const data = {
      ...employeeData,
      department: departmentId ? { connect: { id: departmentId } } : undefined,
      position: positionId ? { connect: { id: positionId } } : undefined,
    };
    return this.employeesService.update(id, data);
  }

  @Delete(':id')
  @Roles('Кадровик')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.remove(id);
  }
}