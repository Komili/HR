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
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompanyDto } from './dto/company.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @Roles('Суперадмин')
  create(@Body() companyDto: CompanyDto) {
    return this.companiesService.create(companyDto);
  }

  @Get()
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  findAll(@Request() req: { user: RequestUser }) {
    return this.companiesService.findAll(req.user);
  }

  @Get('stats')
  @Roles('Суперадмин')
  getHoldingStats() {
    return this.companiesService.getHoldingStats();
  }

  @Get(':id')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    const company = await this.companiesService.findOne(id, req.user);
    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    return company;
  }

  @Patch(':id')
  @Roles('Суперадмин')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() companyDto: CompanyDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.companiesService.update(id, companyDto, req.user);
  }

  @Delete(':id')
  @Roles('Суперадмин')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.companiesService.remove(id, req.user);
  }
}
