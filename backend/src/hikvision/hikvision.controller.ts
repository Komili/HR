import { Controller, Post, Get, Req, HttpCode, HttpStatus, ForbiddenException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { HikvisionService } from './hikvision.service';

@SkipThrottle()
@Controller('hikvision')
export class HikvisionController {
  constructor(private readonly hikvisionService: HikvisionService) {}

  /** IP-адреса зарегистрированных Hikvision устройств из переменной окружения */
  private getAllowedDeviceIps(): string[] {
    try {
      const devices = JSON.parse(process.env.HIKVISION_DEVICES || '[]');
      return devices.map((d: any) => d.ip).filter(Boolean);
    } catch {
      return [];
    }
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded
      ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]).trim()
      : req.socket?.remoteAddress || req.ip || '';
    return ip.replace('::ffff:', ''); // убираем IPv4-mapped IPv6 префикс
  }

  // Webhook от Hikvision устройств — без JWT, но проверяем IP источника
  // POST /api/hikvision/event
  @Post('event')
  @HttpCode(HttpStatus.OK)
  async handleEvent(@Req() req: Request): Promise<void> {
    const allowedIps = this.getAllowedDeviceIps();
    if (allowedIps.length > 0) {
      const clientIp = this.getClientIp(req);
      if (!allowedIps.includes(clientIp)) {
        throw new ForbiddenException(`IP не в белом списке: ${clientIp}`);
      }
    }

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
