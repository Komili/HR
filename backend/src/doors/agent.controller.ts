import {
  Controller, Get, Patch, Post, Param, ParseIntPipe,
  Body, Query, Headers, UnauthorizedException, ForbiddenException,
  StreamableFile, NotFoundException,
} from '@nestjs/common';
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
          `❌ *Ошибка СКУД — не удалось ${actionText}*\n` +
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
        `🟢 *Устройство ВОССТАНОВЛЕНО*\n` +
        `🚪 Дверь: *${body.doorName}* [${body.label}]\n` +
        `🏢 Компания: ${companyName}\n` +
        `📡 Адрес: ${body.ip}:${body.port}\n` +
        `⏰ Связь восстановлена`,
      );
    } else {
      await this.telegram.sendMessage(
        `🔴 *УСТРОЙСТВО НЕДОСТУПНО*\n` +
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
            lastSeenIp: true, login: true, password: true,
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
        device: { select: { officeName: true, direction: true } },
        employee: { select: { firstName: true, lastName: true } },
      },
    });

    const updated = await this.prisma.hikvisionCommand.update({
      where: { id },
      data: { status: body.status, error: body.error ?? null },
    });

    if (cmd) {
      const empName = `${cmd.employee.lastName} ${cmd.employee.firstName}`;
      const devLabel = `${cmd.device.officeName} (${cmd.device.direction === 'IN' ? 'Вход' : 'Выход'})`;
      if (body.status === 'done') {
        const actionText = cmd.action === 'grant' ? '✅ Face ID добавлен на устройство' : '✅ Face ID удалён с устройства';
        this.telegram.sendMessage(
          `${actionText}\n👤 Сотрудник: ${empName}\n🚪 Устройство: ${devLabel}\n🤖 Выполнено relay-агентом`,
        ).catch(() => {});
      } else {
        const actionText = cmd.action === 'grant' ? 'добавить Face ID' : 'удалить Face ID';
        this.telegram.sendMessage(
          `❌ Ошибка — не удалось ${actionText}\n👤 Сотрудник: ${empName}\n🚪 Устройство: ${devLabel}\n⚠️ ${body.error || 'неизвестно'}`,
        ).catch(() => {});
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
}
