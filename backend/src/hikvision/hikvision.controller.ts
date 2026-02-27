import { Controller, Post, Get, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { HikvisionService } from './hikvision.service';

@SkipThrottle()
@Controller('hikvision')
export class HikvisionController {
  constructor(private readonly hikvisionService: HikvisionService) {}

  // Endpoint для Hikvision устройств — без JWT авторизации
  // POST /api/hikvision/event
  @Post('event')
  @HttpCode(HttpStatus.OK)
  async handleEvent(@Req() req: Request): Promise<void> {
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const body = rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    await this.hikvisionService.handleEvent(body);
  }

  // Тест-ссылка — открыть в браузере чтобы проверить Telegram
  // GET /api/hikvision/test
  @Get('test')
  async sendTest(): Promise<{ ok: boolean; message: string }> {
    const message = await this.hikvisionService.sendTestMessage();
    return { ok: true, message };
  }
}
