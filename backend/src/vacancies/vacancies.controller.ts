import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Res,
  StreamableFile,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import type { Response } from 'express';
import { VacanciesService } from './vacancies.service';
import { VacancyDto } from './dto/vacancy.dto';
import { CandidateDto } from './dto/candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/jwt.strategy';
import { isAuthorizedForCompany } from '../common/company-filter';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vacancies')
export class VacanciesController {
  constructor(private readonly vacanciesService: VacanciesService) {}

  @Get()
  @Roles('Суперадмин', 'Кадровик', 'Руководитель')
  findAll(
    @Request() req: { user: RequestUser },
    @Query('companyId') companyId?: string,
  ) {
    const requestedCompanyId = companyId ? parseInt(companyId, 10) : undefined;
    return this.vacanciesService.findAll(req.user, requestedCompanyId);
  }

  @Get(':id')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель')
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req: { user: RequestUser }) {
    return this.vacanciesService.findOne(id, req.user);
  }

  @Post()
  @Roles('Суперадмин', 'Кадровик')
  create(@Body() dto: VacancyDto, @Request() req: { user: RequestUser }) {
    let targetCompanyId: number | null | undefined;
    if (dto.companyId) {
      if (!isAuthorizedForCompany(req.user, dto.companyId)) {
        throw new ForbiddenException('Нет доступа к этой компании');
      }
      targetCompanyId = dto.companyId;
    } else {
      targetCompanyId = req.user.companyId;
    }
    if (!targetCompanyId) throw new NotFoundException('Company ID is required');

    return this.vacanciesService.create(
      {
        title: dto.title,
        companyId: targetCompanyId,
        departmentId: dto.departmentId,
        positionId: dto.positionId,
        description: dto.description,
        status: dto.status,
      },
      req.user,
    );
  }

  @Patch(':id')
  @Roles('Суперадмин', 'Кадровик')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VacancyDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.vacanciesService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('Суперадмин', 'Кадровик')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req: { user: RequestUser }) {
    return this.vacanciesService.remove(id, req.user);
  }

  // ─────────── кандидаты ───────────

  @Get(':id/candidates')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель')
  listCandidates(@Param('id', ParseIntPipe) id: number, @Request() req: { user: RequestUser }) {
    return this.vacanciesService.listCandidates(id, req.user);
  }

  @Post(':id/candidates')
  @Roles('Суперадмин', 'Кадровик')
  @UseInterceptors(
    FileInterceptor('resume', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
          return cb(new BadRequestException('Неподдерживаемый формат файла'), false);
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
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  createCandidate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CandidateDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request() req: { user: RequestUser },
  ) {
    return this.vacanciesService.createCandidate(id, dto, file, req.user);
  }

  @Patch('candidates/:candidateId')
  @Roles('Суперадмин', 'Кадровик')
  updateCandidate(
    @Param('candidateId', ParseIntPipe) candidateId: number,
    @Body() dto: UpdateCandidateDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.vacanciesService.updateCandidate(candidateId, dto, req.user);
  }

  @Delete('candidates/:candidateId')
  @Roles('Суперадмин', 'Кадровик')
  removeCandidate(@Param('candidateId', ParseIntPipe) candidateId: number, @Request() req: { user: RequestUser }) {
    return this.vacanciesService.removeCandidate(candidateId, req.user);
  }

  @Get('candidates/:candidateId/resume')
  @Roles('Суперадмин', 'Кадровик', 'Руководитель')
  async downloadResume(
    @Param('candidateId', ParseIntPipe) candidateId: number,
    @Request() req: { user: RequestUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, fileName, mimeType } = await this.vacanciesService.getResumeStream(candidateId, req.user);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    return new StreamableFile(stream);
  }
}
