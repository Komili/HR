import {
  Controller, Get, Patch, Post, Param, ParseIntPipe,
  Body, Query, Headers, UnauthorizedException, ForbiddenException,
  StreamableFile, NotFoundException, UseGuards, Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * AgentController — API для relay-агента в офисах.
 * Агент аутентифицируется по заголовку X-Agent-Token.
 * Не требует JWT — используется отдельный shared secret.
 */
@Controller('agent')
export class AgentController {
  // in-memory heartbeat: companyId -> lastPingAt
  private readonly heartbeats = new Map<number, Date>();

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  private checkToken(token: string | undefined) {
    const expected = process.env.AGENT_SECRET_TOKEN;
    if (!expected || expected === 'change_me_to_random_secret_token_here') {
      throw new ForbiddenException('AGENT_SECRET_TOKEN не настроен на сервере');
    }
    if (!token) {
      throw new UnauthorizedException('Неверный токен агента');
    }
    // Timing-safe сравнение для защиты от timing-атак
    let valid = false;
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(expected);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new UnauthorizedException('Неверный токен агента');
    }
  }

  /**
   * GET /api/agent/commands?companyId=X
   * Возвращает pending-команды для данной компании.
   * Агент опрашивает этот endpoint каждые N секунд.
   */
  @Get('commands')
  async getPendingCommands(
    @Headers('x-agent-token') token: string,
    @Query('companyId') companyIdStr: string,
  ) {
    this.checkToken(token);
    const companyId = parseInt(companyIdStr);
    if (!companyId) throw new ForbiddenException('companyId обязателен');

    const commands = await this.prisma.doorCommand.findMany({
      where: {
        status: 'pending',
        door: { companyId },
      },
      include: {
        door: {
          select: {
            id: true, name: true, companyId: true,
            inDeviceIp: true, inDevicePort: true,
            outDeviceIp: true, outDevicePort: true,
            login: true, password: true,
          },
        },
        employee: {
          select: {
            id: true, firstName: true, lastName: true,
            photoPath: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Помечаем как "processing" чтобы не было дублей при параллельных агентах
    if (commands.length > 0) {
      await this.prisma.doorCommand.updateMany({
        where: { id: { in: commands.map(c => c.id) } },
        data: { status: 'processing' },
      });
    }

    return commands.map(c => ({
      id: c.id,
      action: c.action,
      door: c.door,
      employee: {
        id: c.employee.id,
        firstName: c.employee.firstName,
        lastName: c.employee.lastName,
        hasPhoto: !!c.employee.photoPath,
      },
    }));
  }

  /**
   * PATCH /api/agent/commands/:id
   * Агент сообщает результат выполнения команды.
   * Body: { status: 'done' | 'failed', error?: string }
   */
  @Patch('commands/:id')
  async updateCommand(
    @Headers('x-agent-token') token: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: 'done' | 'failed'; error?: string },
  ) {
    this.checkToken(token);

    const cmd = await this.prisma.doorCommand.findUnique({
      where: { id },
      include: {
        door: { select: { name: true } },
        employee: { select: { firstName: true, lastName: true } },
      },
    });

    const updated = await this.prisma.doorCommand.update({
      where: { id },
      data: { status: body.status, error: body.error ?? null },
    });

    // Telegram уведомление о результате
    if (cmd) {
      const empName = `${cmd.employee.lastName} ${cmd.employee.firstName}`;
      const doorName = cmd.door.name;
      if (body.status === 'done') {
        const actionText = cmd.action === 'grant' ? '✅ Доступ добавлен на устройство' : '✅ Доступ удалён с устройства';
        this.telegram.sendMessage(
          `${actionText}\n` +
          `👤 Сотрудник: *${empName}*\n` +
          `🚪 Дверь: *${doorName}*\n` +
          `🤖 Выполнено агентом`,
        ).catch(() => {});
      } else {
        const actionText = cmd.action === 'grant' ? 'добавить доступ' : 'удалить доступ';
        this.telegram.sendMessage(
          `❌ <b>Ошибка СКУД — не удалось ${actionText}</b>\n` +
          `👤 Сотрудник: *${empName}*\n` +
          `🚪 Дверь: *${doorName}*\n` +
          `⚠️ Ошибка: ${body.error || 'неизвестно'}\n` +
          `🔧 Проверь связь с устройством`,
        ).catch(() => {});
      }
    }

    return updated;
  }

  /**
   * GET /api/agent/photo/:employeeId
   * Агент скачивает фото сотрудника для загрузки на Hikvision.
   */
  @Get('photo/:employeeId')
  async getPhoto(
    @Headers('x-agent-token') token: string,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    this.checkToken(token);
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { photoPath: true },
    });
    if (!emp?.photoPath) throw new NotFoundException('Фото не найдено');
    const absPath = path.resolve(emp.photoPath);
    if (!fs.existsSync(absPath)) throw new NotFoundException('Файл фото не найден');
    const stream = fs.createReadStream(absPath);
    return new StreamableFile(stream, { type: 'image/jpeg' });
  }

  /**
   * GET /api/agent/doors?companyId=X
   * Список всех дверей компании (только IP/порты, без паролей).
   * Агент использует для мониторинга доступности устройств.
   */
  @Get('doors')
  async getDoors(
    @Headers('x-agent-token') token: string,
    @Query('companyId') companyIdStr: string,
  ) {
    this.checkToken(token);
    const companyId = parseInt(companyIdStr);
    if (!companyId) throw new ForbiddenException('companyId обязателен');

    const doors = await this.prisma.door.findMany({
      where: { companyId },
      select: {
        id: true, name: true, isActive: true,
        inDeviceIp: true, inDevicePort: true,
        outDeviceIp: true, outDevicePort: true,
      },
      orderBy: { name: 'asc' },
    });
    return doors;
  }

  /**
   * POST /api/agent/device-alert
   * Агент сообщает об изменении состояния устройства (онлайн/офлайн).
   * Сервер отправляет Telegram уведомление.
   */
  @Post('device-alert')
  async deviceAlert(
    @Headers('x-agent-token') token: string,
    @Body() body: {
      companyId: number;
      ip: string;
      port: number;
      doorName: string;
      label: string;
      online: boolean;
    },
  ) {
    this.checkToken(token);

    const company = await this.prisma.company.findUnique({
      where: { id: body.companyId },
      select: { name: true, shortName: true },
    });
    const companyName = company?.shortName || company?.name || `ID ${body.companyId}`;

    if (body.online) {
      await this.telegram.sendMessage(
        `🟢 <b>Устройство ВОССТАНОВЛЕНО</b>\n` +
        `🚪 Дверь: *${body.doorName}* [${body.label}]\n` +
        `🏢 Компания: ${companyName}\n` +
        `📡 Адрес: ${body.ip}:${body.port}\n` +
        `⏰ Связь восстановлена`,
      );
    } else {
      await this.telegram.sendMessage(
        `🔴 <b>УСТРОЙСТВО НЕДОСТУПНО</b>\n` +
        `🚪 Дверь: *${body.doorName}* [${body.label}]\n` +
        `🏢 Компания: ${companyName}\n` +
        `📡 Адрес: ${body.ip}:${body.port}\n` +
        `⚠️ Нет ответа — проверь питание и сеть`,
      );
    }

    return { ok: true };
  }

  /**
   * GET /api/agent/hik-commands?companyId=X
   * Pending HikvisionCommand записи для relay-агента.
   * Агент получает их, выполняет ISAPI и отчитывается.
   */
  @Get('hik-commands')
  async getHikCommands(
    @Headers('x-agent-token') token: string,
    @Query('companyId') companyIdStr: string,
  ) {
    this.checkToken(token);
    const companyId = parseInt(companyIdStr);
    if (!companyId) throw new ForbiddenException('companyId обязателен');

    const commands = await this.prisma.hikvisionCommand.findMany({
      where: {
        status: 'pending',
        device: { companyId },
      },
      include: {
        device: {
          select: {
            id: true, officeName: true, direction: true, companyId: true,
            lastSeenIp: true, directPort: true, login: true, password: true,
          },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true, photoPath: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (commands.length > 0) {
      await this.prisma.hikvisionCommand.updateMany({
        where: { id: { in: commands.map(c => c.id) } },
        data: { status: 'processing' },
      });
    }

    return commands.map(c => ({
      id: c.id,
      action: c.action,
      device: c.device,
      employee: {
        id: c.employee.id,
        firstName: c.employee.firstName,
        lastName: c.employee.lastName,
        hasPhoto: !!c.employee.photoPath,
      },
    }));
  }

  /**
   * PATCH /api/agent/hik-commands/:id
   * Relay-агент отчитывается о результате ISAPI команды.
   * Body: { status: 'done' | 'failed', error?: string }
   */
  @Patch('hik-commands/:id')
  async updateHikCommand(
    @Headers('x-agent-token') token: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: 'done' | 'failed'; error?: string },
  ) {
    this.checkToken(token);

    const cmd = await this.prisma.hikvisionCommand.findUnique({
      where: { id },
      include: {
        device: {
          select: {
            officeName: true, direction: true, deviceName: true,
            lastSeenIp: true, externalIp: true, directPort: true,
            company: { select: { name: true, shortName: true } },
          },
        },
        employee: {
          select: {
            firstName: true, lastName: true,
            position: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
        initiatedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    const updated = await this.prisma.hikvisionCommand.update({
      where: { id },
      data: { status: body.status, error: body.error ?? null },
    });

    if (cmd) {
      const empName = `${cmd.employee.lastName} ${cmd.employee.firstName}`;
      const position = cmd.employee.position?.name || '';
      const department = cmd.employee.department?.name || '';
      const empInfo = [position, department].filter(Boolean).join(' · ');

      const devName = cmd.device.deviceName || cmd.device.officeName || 'Устройство';
      const dirLabel = cmd.device.direction === 'IN' ? 'Вход ↑' : 'Выход ↓';
      const ipLabel = cmd.device.directPort
        ? `${cmd.device.lastSeenIp}:${cmd.device.directPort}`
        : cmd.device.lastSeenIp;
      const externalIpLabel = cmd.device.externalIp || null;
      const companyName = cmd.device.company?.shortName || cmd.device.company?.name || '';

      const now = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Dushanbe', hour12: false });

      const initiator = cmd.initiatedBy
        ? [cmd.initiatedBy.lastName, cmd.initiatedBy.firstName].filter(Boolean).join(' ') || cmd.initiatedBy.email
        : 'Система';

      if (body.status === 'done') {
        const header = cmd.action === 'grant'
          ? '✅ <b>Face ID добавлен</b>'
          : '🗑 <b>Face ID удалён</b>';
        const lines: string[] = [header, ''];
        lines.push(`👤 <b>${empName}</b>`);
        if (empInfo) lines.push(`   ${empInfo}`);
        if (companyName) lines.push(`   ${companyName}`);
        lines.push('');
        lines.push(`🚪 <b>${devName}</b>  ·  ${dirLabel}`);
        lines.push(`   🔗 <code>${ipLabel}</code>`);
        if (externalIpLabel) lines.push(`   🌐 <code>${externalIpLabel}</code>`);
        lines.push('');
        lines.push(`👮 ${initiator}`);
        lines.push(`🕐 ${now}  ·  Relay-агент`);
        this.telegram.sendMessage(lines.join('\n')).catch(() => {});
      } else {
        const actionText = cmd.action === 'grant' ? 'добавить Face ID' : 'удалить Face ID';
        const lines: string[] = [`❌ <b>Ошибка — не удалось ${actionText}</b>`, ''];
        lines.push(`👤 <b>${empName}</b>`);
        if (empInfo) lines.push(`   ${empInfo}`);
        if (companyName) lines.push(`   ${companyName}`);
        lines.push('');
        lines.push(`🚪 <b>${devName}</b>  ·  ${dirLabel}`);
        lines.push(`   🔗 <code>${ipLabel}</code>`);
        if (externalIpLabel) lines.push(`   🌐 <code>${externalIpLabel}</code>`);
        lines.push('');
        lines.push(`⚠️ ${body.error || 'неизвестно'}`);
        lines.push(`👮 ${initiator}`);
        lines.push(`🕐 ${now}`);
        this.telegram.sendMessage(lines.join('\n')).catch(() => {});
      }
    }

    return updated;
  }

  /**
   * GET /api/agent/status?companyId=X
   * Статистика команд — для мониторинга в агенте.
   */
  @Get('status')
  async getStatus(
    @Headers('x-agent-token') token: string,
    @Query('companyId') companyIdStr: string,
  ) {
    this.checkToken(token);
    const companyId = parseInt(companyIdStr);
    if (!companyId) throw new ForbiddenException('companyId обязателен');

    const [pending, done, failed] = await Promise.all([
      this.prisma.doorCommand.count({ where: { status: 'pending', door: { companyId } } }),
      this.prisma.doorCommand.count({ where: { status: 'done', door: { companyId } } }),
      this.prisma.doorCommand.count({ where: { status: 'failed', door: { companyId } } }),
    ]);

    return { pending, done, failed };
  }

  /**
   * POST /api/agent/ping
   * Агент вызывает каждые N секунд — фиксируем время последней активности.
   */
  @Post('ping')
  agentPing(
    @Headers('x-agent-token') token: string,
    @Body() body: { companyId: number },
  ) {
    this.checkToken(token);
    const cid = Number(body.companyId);
    if (cid) this.heartbeats.set(cid, new Date());
    return { ok: true };
  }

  /**
   * GET /api/agent/public-status?companyId=X
   * Для фронтенда (JWT) — статус relay-агента компании.
   */
  @UseGuards(JwtAuthGuard)
  @Get('public-status')
  async getPublicStatus(
    @Query('companyId') companyIdStr: string,
    @Request() req: any,
  ) {
    const user = req.user;
    const companyId = user.isHoldingAdmin
      ? parseInt(companyIdStr)
      : user.companyId;

    if (!companyId) return { online: false, secondsAgo: null, pendingCommands: 0 };

    const lastPing = this.heartbeats.get(companyId);
    const secondsAgo = lastPing
      ? Math.floor((Date.now() - lastPing.getTime()) / 1000)
      : null;
    const online = secondsAgo !== null && secondsAgo < 120;

    const pendingCommands = await this.prisma.hikvisionCommand.count({
      where: { status: { in: ['pending', 'processing'] }, device: { companyId } },
    });

    return { online, secondsAgo, pendingCommands, lastPingAt: lastPing ?? null };
  }
}
