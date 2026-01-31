import {
  Controller,
  Get,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  Body,
  ParseIntPipe,
  Res,
  StreamableFile,
  UseGuards,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { diskStorage } from 'multer';
import { extname } from 'path';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('employee/:employeeId')
  findByEmployeeId(@Param('employeeId', ParseIntPipe) employeeId: number) {
    return this.documentsService.findByEmployeeId(employeeId);
  }

  @Get(':documentId/download')
  async downloadFile(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, fileName, mimeType } = await this.documentsService.getDocumentStream(documentId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    return new StreamableFile(stream);
  }

  @Get(':documentId/view')
  async viewFile(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, fileName, mimeType } = await this.documentsService.getDocumentStream(documentId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    return new StreamableFile(stream);
  }

  @Post('upload/employee/:employeeId')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
          return cb(new BadRequestException('Unsupported file type'), false);
        }
        return cb(null, true);
      },
      storage: diskStorage({
        destination: './storage/tmp', // Временная папка для загрузок
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
  uploadFile(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType: string,
    @Request() req: { user?: { email?: string; sub?: number } },
  ) {
    const uploadedBy = req.user?.email ?? String(req.user?.sub ?? 'system');
    return this.documentsService.handleFileUpload({
      employeeId,
      documentType,
      file,
      uploadedBy,
    });
  }
}
