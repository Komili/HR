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
  Request,
  UseInterceptors,
  UploadedFile,
  Res,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import type { Response } from 'express';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles('Суперадмин', 'Кадровик')
  create(
    @Body() createEmployeeDto: CreateEmployeeDto,
    @Request() req: { user: RequestUser },
  ) {
    const { departmentId, positionId, companyId, ...employeeData } = createEmployeeDto;

    // Определяем companyId: суперадмин может указать любой, обычный пользователь использует свой
    const targetCompanyId = req.user.isHoldingAdmin && companyId
      ? companyId
      : req.user.companyId;

    if (!targetCompanyId) {
      throw new NotFoundException('Company ID is required');
    }

    const data = {
      ...employeeData,
      company: { connect: { id: targetCompanyId } },
      department: departmentId ? { connect: { id: departmentId } } : undefined,
      position: positionId ? { connect: { id: positionId } } : undefined,
    };
    return this.employeesService.create(data, req.user);
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
    return this.employeesService.findAll(+page, +limit, search, req?.user, requestedCompanyId);
  }

  @Post(':id/photo')
  @Roles('Суперадмин', 'Кадровик')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: MAX_PHOTO_SIZE },
      fileFilter: (req, file, cb) => {
        if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
          return cb(new BadRequestException('Допустимы только изображения (JPEG, PNG, WebP)'), false);
        }
        return cb(null, true);
      },
      storage: diskStorage({
        destination: './storage/tmp',
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `photo_${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async uploadPhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: RequestUser },
  ) {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }
    return this.employeesService.uploadPhoto(id, file, req.user);
  }

  @Get(':id/photo')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  async getPhoto(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, mimeType } = await this.employeesService.getPhotoStream(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return new StreamableFile(stream);
  }

  @Get(':id')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    const employee = await this.employeesService.findOne(id, req.user);
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }
    return employee;
  }

  @Patch(':id')
  @Roles('Суперадмин', 'Кадровик')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
    @Request() req: { user: RequestUser },
  ) {
    const { departmentId, positionId, companyId, ...employeeData } = updateEmployeeDto;
    const data = {
      ...employeeData,
      department: departmentId ? { connect: { id: departmentId } } : undefined,
      position: positionId ? { connect: { id: positionId } } : undefined,
    };
    return this.employeesService.update(id, data, req.user);
  }

  @Delete(':id')
  @Roles('Суперадмин', 'Кадровик')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.employeesService.remove(id, req.user);
  }
}
