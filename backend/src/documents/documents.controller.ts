import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload/:employeeId')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './storage', // Эта папка будет внутри контейнера
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
    @Param('employeeId') employeeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType: string,
  ) {
    // Здесь будет вызов сервиса для создания структуры папок и сохранения в БД
    console.log(file);
    return this.documentsService.handleFileUpload({
      employeeId: +employeeId,
      documentType,
      file,
    });
  }
}