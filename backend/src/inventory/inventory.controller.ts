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
  BadRequestException,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @Roles('Суперадмин', 'Кадровик')
  create(
    @Body() dto: CreateInventoryItemDto,
    @Request() req: { user: RequestUser },
  ) {
    const { companyId, employeeId, ...itemData } = dto;

    const targetCompanyId = req.user.isHoldingAdmin && companyId
      ? companyId
      : req.user.companyId;

    if (!targetCompanyId) {
      throw new BadRequestException('Выберите компанию перед добавлением инвентаря');
    }

    const data = {
      ...itemData,
      company: { connect: { id: targetCompanyId } },
      employee: employeeId ? { connect: { id: employeeId } } : undefined,
    };

    return this.inventoryService.create(data, req.user);
  }

  @Get()
  @Roles('Суперадмин', 'Кадровик', 'Руководитель')
  findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
    @Request() req?: { user: RequestUser },
  ) {
    const requestedCompanyId = companyId ? parseInt(companyId, 10) : undefined;
    return this.inventoryService.findAll(+page, +limit, search, req?.user, requestedCompanyId);
  }

  @Get(':id/history')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  getHistory(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.inventoryService.getHistory(id, req.user);
  }

  @Get('employee/:employeeId')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  findByEmployee(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.inventoryService.findByEmployee(employeeId, req.user);
  }

  @Get(':id')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.inventoryService.findOne(id, req.user);
  }

  @Patch(':id')
  @Roles('Суперадмин', 'Кадровик')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInventoryItemDto,
    @Request() req: { user: RequestUser },
  ) {
    const { companyId, employeeId, ...itemData } = dto;
    const data = {
      ...itemData,
      employee: employeeId !== undefined
        ? (employeeId ? { connect: { id: employeeId } } : { disconnect: true })
        : undefined,
    };
    return this.inventoryService.update(id, data, req.user);
  }

  @Delete(':id')
  @Roles('Суперадмин', 'Кадровик')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.inventoryService.remove(id, req.user);
  }

  @Patch(':id/assign/:employeeId')
  @Roles('Суперадмин', 'Кадровик')
  assignToEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.inventoryService.assignToEmployee(id, employeeId, req.user);
  }

  @Patch(':id/unassign')
  @Roles('Суперадмин', 'Кадровик')
  unassignFromEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.inventoryService.unassignFromEmployee(id, req.user);
  }
}
