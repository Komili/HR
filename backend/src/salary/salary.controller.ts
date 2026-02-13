import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SalaryService } from './salary.service';
import { RequestUser } from '../auth/jwt.strategy';

@Controller('salary')
@UseGuards(AuthGuard('jwt'))
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  // GET /salary?month=1&year=2026&companyId=1
  @Get()
  async findAll(
    @Req() req: { user: RequestUser },
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('companyId') companyId?: string,
  ) {
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();
    return this.salaryService.findAll(m, y, req.user, companyId ? parseInt(companyId) : undefined);
  }

  // GET /salary/employee/:id?year=2026
  @Get('employee/:id')
  async findByEmployee(
    @Req() req: { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Query('year') year: string,
  ) {
    const y = parseInt(year) || new Date().getFullYear();
    return this.salaryService.findByEmployee(id, y, req.user);
  }

  // POST /salary/calculate?month=1&year=2026&companyId=1
  @Post('calculate')
  async calculate(
    @Req() req: { user: RequestUser },
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('companyId') companyId?: string,
  ) {
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();
    return this.salaryService.calculate(m, y, req.user, companyId ? parseInt(companyId) : undefined);
  }

  // PATCH /salary/:id
  @Patch(':id')
  async update(
    @Req() req: { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { bonus?: number; deduction?: number; note?: string },
  ) {
    return this.salaryService.update(id, body, req.user);
  }
}
