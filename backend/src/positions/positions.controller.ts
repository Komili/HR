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
import { PositionsService } from './positions.service';
import { PositionDto } from './dto/position.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Post()
  @Roles('Суперадмин', 'Кадровик')
  create(
    @Body() positionDto: PositionDto,
    @Request() req: { user: RequestUser },
  ) {
    const targetCompanyId = req.user.isHoldingAdmin && positionDto.companyId
      ? positionDto.companyId
      : req.user.companyId;

    if (!targetCompanyId) {
      throw new NotFoundException('Company ID is required');
    }

    return this.positionsService.create({
      name: positionDto.name,
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
    return this.positionsService.findAll(req.user, requestedCompanyId);
  }

  @Get(':id')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    const position = await this.positionsService.findOne(id, req.user);
    if (!position) {
      throw new NotFoundException(`Position with ID ${id} not found`);
    }
    return position;
  }

  @Patch(':id')
  @Roles('Суперадмин', 'Кадровик')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() positionDto: PositionDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.positionsService.update(id, { name: positionDto.name }, req.user);
  }

  @Delete(':id')
  @Roles('Суперадмин', 'Кадровик')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.positionsService.remove(id, req.user);
  }
}
