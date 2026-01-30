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
import { PositionsService } from './positions.service';
import { PositionDto } from './dto/position.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Post()
  @Roles('Кадровик')
  create(@Body() positionDto: PositionDto) {
    return this.positionsService.create(positionDto);
  }

  @Get()
  @Roles('Кадровик', 'Руководитель')
  findAll() {
    return this.positionsService.findAll();
  }

  @Get(':id')
  @Roles('Кадровик', 'Руководитель')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const position = await this.positionsService.findOne(id);
    if (!position) {
      throw new NotFoundException(`Position with ID ${id} not found`);
    }
    return position;
  }

  @Patch(':id')
  @Roles('Кадровик')
  update(@Param('id', ParseIntPipe) id: number, @Body() positionDto: PositionDto) {
    return this.positionsService.update(id, positionDto);
  }

  @Delete(':id')
  @Roles('Кадровик')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.positionsService.remove(id);
  }
}
