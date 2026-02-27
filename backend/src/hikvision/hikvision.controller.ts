import { Controller, Post, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { HikvisionService } from './hikvision.service';

@SkipThrottle()
@Controller('hikvision')
export class HikvisionController {
  constructor(private readonly hikvisionService: HikvisionService) {}

  // Endpoint для Hikvision устройств — без JWT авторизации, устройства сами пишут сюда
  // POST /api/hikvision/event
  @Post('event')
  @HttpCode(HttpStatus.OK)
  async handleEvent(@Req() req: Request): Promise<void> {
    // NestJS rawBody (включён в main.ts через { rawBody: true })
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const body = rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    await this.hikvisionService.handleEvent(body);
  }
}
