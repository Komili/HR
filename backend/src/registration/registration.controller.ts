import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Throttle } from '@nestjs/throttler';
import { RegistrationService } from './registration.service';
import { SelfRegisterDto } from './dto/self-register.dto';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Controller('registration')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Get('validate')
  async validateToken(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Токен обязателен');
    }
    return this.registrationService.validateToken(token);
  }

  @Post('submit')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
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
          cb(null, `reg_${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async submit(
    @Body() dto: SelfRegisterDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.registrationService.submitRegistration(dto, photo);
  }
}
