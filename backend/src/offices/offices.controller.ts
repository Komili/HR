import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { OfficesService } from './offices.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('offices')
export class OfficesController {
  constructor(private readonly officesService: OfficesService) {}

  @Get()
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  findAll(
    @Query('companyId') companyId?: string,
    @Request() req?: { user: RequestUser },
  ) {
    const requestedCompanyId = companyId ? parseInt(companyId, 10) : undefined;
    return this.officesService.findAll(req!.user, requestedCompanyId);
  }

  @Get(':id')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.officesService.findOne(id, req.user);
  }

  @Post()
  @Roles('Суперадмин', 'Кадровик')
  create(
    @Body() dto: CreateOfficeDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.officesService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles('Суперадмин', 'Кадровик')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOfficeDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.officesService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('Суперадмин', 'Кадровик')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.officesService.remove(id, req.user);
  }
}
