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
 * AgentController — API для relay-агентов в офисах.
 * Агент аутентифицируется по X-Agent-Token + идентифицируется по X-Agent-Id (UUID).
 *
 * Один агент может обслуживать одну компанию или весь холдинг (companyId = null).
 * При companyId = null — возвращаются команды всех компаний.
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
    if (!token) throw new UnauthorizedException('Неверный токен агента');
    let valid = false;
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(expected);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch { valid = false; }
    if (!valid) throw new UnauthorizedException('Неверный токен агента');
  }

  /** Получить companyId агента по его UUID из БД */
  private async getAgentCompanyId(agentId: string | undefined): Promise<number | null> {
    if (!agentId) return null;
    const agent = await this.prisma.agent.findUnique({
      where: { agentId },
      select: { companyId: true },
    });
    return agent?.companyId ?? null;
  }

  // ─────────────────────────────────────────────────────────────
  //  Регистрация и heartbeat
  // ─────────────────────────────────────────────────────────────

  /**
   * POST /api/agent/register
   * Агент регистрируется при старте. Создаёт или обновляет запись.
   * Body: { agentId, name, version? }
   * Returns: { id, name, companyId }
   */
  @Post('register')
  async registerAgent(
    @Headers('x-agent-token') token: string,
    @Body() body: { agentId: string; name: string; version?: string },
  ) {
    this.checkToken(token);
    if (!body.agentId || !body.name) throw new ForbiddenException('agentId и name обязательны');

    const agent = await this.prisma.agent.upsert({
      where: { agentId: body.agentId },
      create: {
        agentId: body.agentId,
        name: body.name,
        version: body.version ?? null,
        lastSeenAt: new Date(),
      },
      update: {
        name: body.name,
        version: body.version ?? null,
        lastSeenAt: new Date(),
      },
      select: { id: true, name: true, companyId: true },
    });

    return agent;
  }

  /**
   * POST /api/agent/ping
   * Heartbeat — обновляет lastSeenAt в БД.
   * Body: { agentId? } — для backwards compatibility принимаем и старый companyId
   */
  @Post('ping')
  async agentPing(
    @Headers('x-agent-token') token: string,
    @Headers('x-agent-id') agentId: string | undefined,
    @Body() body: { agentId?: string; companyId?: number },
  ) {
    this.checkToken(token);
    const aid = agentId || body.agentId;
    if (aid) {
      await this.prisma.agent.updateMany({
        where: { agentId: aid },
        data: { lastSeenAt: new Date() },
      });
    }
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────
  //  Команды для агента
  // ─────────────────────────────────────────────────────────────

  /**
   * GET /api/agent/commands
   * Pending Door-команды. Фильтр по companyId агента (null = все компании).
   */
  @Get('commands')
  async getPendingCommands(
    @Headers('x-agent-token') token: string,
    @Headers('x-agent-id') agentIdHeader: string | undefined,
    @Query('companyId') companyIdStr?: string,
  ) {
    this.checkToken(token);
    // companyId: из agentId (DB) > query param > null (all)
    const companyId = agentIdHeader
      ? await this.getAgentCompanyId(agentIdHeader)
      : (companyIdStr ? parseInt(companyIdStr) : null);

    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
    await this.prisma.doorCommand.updateMany({
      where: {
        status: 'processing',
        updatedAt: { lt: staleThreshold },
        ...(companyId ? { door: { companyId } } : {}),
      },
      data: { status: 'pending' },
    });

    const commands = await this.prisma.doorCommand.findMany({
      where: {
        status: 'pending',
        ...(companyId ? { door: { companyId } } : {}),
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
        employee: { select: { id: true, firstName: true, lastName: true, photoPath: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

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
    if (cmd) {
      const empName = `${cmd.employee.lastName} ${cmd.employee.firstName}`;
      const doorName = cmd.door.name;
      if (body.status === 'done') {
        const actionText = cmd.action === 'grant' ? '✅ Доступ добавлен на устройство' : '✅ Доступ удалён с устройства';
        this.telegram.sendMessage(`${actionText}\n👤 Сотрудник: *${empName}*\n🚪 Дверь: *${doorName}*\n🤖 Выполнено агентом`).catch(() => {});
      } else {
        const actionText = cmd.action === 'grant' ? 'добавить доступ' : 'удалить доступ';
        this.telegram.sendMessage(`❌ <b>Ошибка СКУД — не удалось ${actionText}</b>\n👤 Сотрудник: *${empName}*\n🚪 Дверь: *${doorName}*\n⚠️ Ошибка: ${body.error || 'неизвестно'}`).catch(() => {});
      }
    }
    return updated;
  }

  /**
   * GET /api/agent/photo/:employeeId
   */
  @Get('photo/:employeeId')
  async getPhoto(
    @Headers('x-agent-token') token: string,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    this.checkToken(token);
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { photoPath: true } });
    if (!emp?.photoPath) throw new NotFoundException('Фото не найдено');
    // Используем photo_norm.jpg (800px, ~50-100KB) — Hikvision отклоняет файлы > ~1MB
    const normPath = emp.photoPath.replace(/photo\.jpg$/, 'photo_norm.jpg');
    const absPath = path.resolve(fs.existsSync(normPath) ? normPath : emp.photoPath);
    if (!fs.existsSync(absPath)) throw new NotFoundException('Файл фото не найден');
    return new StreamableFile(fs.createReadStream(absPath), { type: 'image/jpeg' });
  }

  /**
   * GET /api/agent/doors
   * Список дверей для мониторинга. companyId агента → только его двери; null → все.
   */
  @Get('doors')
  async getDoors(
    @Headers('x-agent-token') token: string,
    @Headers('x-agent-id') agentIdHeader: string | undefined,
    @Query('companyId') companyIdStr?: string,
  ) {
    this.checkToken(token);
    const companyId = agentIdHeader
      ? await this.getAgentCompanyId(agentIdHeader)
      : (companyIdStr ? parseInt(companyIdStr) : null);

    return this.prisma.door.findMany({
      where: companyId ? { companyId } : {},
      select: {
        id: true, name: true, isActive: true,
        inDeviceIp: true, inDevicePort: true,
        outDeviceIp: true, outDevicePort: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * POST /api/agent/device-alert
   * Агент сообщает об изменении состояния устройства.
   */
  @Post('device-alert')
  async deviceAlert(
    @Headers('x-agent-token') token: string,
    @Body() body: { doorId?: number; companyId?: number; ip: string; port: number; doorName: string; label: string; online: boolean },
  ) {
    this.checkToken(token);

    let companyId = body.companyId ?? null;
    if (!companyId && body.doorId) {
      const door = await this.prisma.door.findUnique({ where: { id: body.doorId }, select: { companyId: true } });
      companyId = door?.companyId ?? null;
    }
    const company = companyId
      ? await this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true, shortName: true } })
      : null;
    const companyName = company?.shortName || company?.name || '';

    const msg = body.online
      ? `🟢 <b>Устройство ВОССТАНОВЛЕНО</b>\n🚪 Дверь: *${body.doorName}* [${body.label}]\n${companyName ? `🏢 Компания: ${companyName}\n` : ''}📡 Адрес: ${body.ip}:${body.port}\n⏰ Связь восстановлена`
      : `🔴 <b>УСТРОЙСТВО НЕДОСТУПНО</b>\n🚪 Дверь: *${body.doorName}* [${body.label}]\n${companyName ? `🏢 Компания: ${companyName}\n` : ''}📡 Адрес: ${body.ip}:${body.port}\n⚠️ Нет ответа — проверь питание и сеть`;

    await this.telegram.sendMessage(msg);
    return { ok: true };
  }

  /**
   * GET /api/agent/hik-commands
   * Pending HikvisionCommand. Фильтр по companyId агента (null = все).
   */
  @Get('hik-commands')
  async getHikCommands(
    @Headers('x-agent-token') token: string,
    @Headers('x-agent-id') agentIdHeader: string | undefined,
    @Query('companyId') companyIdStr?: string,
  ) {
    this.checkToken(token);

    // Получаем DB-запись агента для фильтрации по agentId
    let agentDbId: number | null = null;
    let companyId: number | null = null;
    if (agentIdHeader) {
      const agent = await this.prisma.agent.findUnique({
        where: { agentId: agentIdHeader },
        select: { id: true, companyId: true },
      });
      agentDbId = agent?.id ?? null;
      companyId = agent?.companyId ?? null;
    } else if (companyIdStr) {
      companyId = parseInt(companyIdStr);
    }

    // Фильтр: устройства привязанные к этому агенту ИЛИ (не привязанные ни к кому + совпадает companyId)
    const deviceFilter = agentDbId
      ? { OR: [{ agentId: agentDbId }, { agentId: null, ...(companyId ? { companyId } : {}) }] }
      : companyId
        ? { companyId }
        : {};

    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
    await this.prisma.hikvisionCommand.updateMany({
      where: {
        status: 'processing',
        updatedAt: { lt: staleThreshold },
        device: deviceFilter,
      },
      data: { status: 'pending' },
    });

    const commands = await this.prisma.hikvisionCommand.findMany({
      where: {
        status: 'pending',
        device: deviceFilter,
      },
      include: {
        device: {
          select: {
            id: true, officeName: true, direction: true, companyId: true,
            lastSeenIp: true, directPort: true, login: true, password: true,
          },
        },
        employee: { select: { id: true, firstName: true, lastName: true, photoPath: true, phone: true } },
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
        phone: c.employee.phone ?? null,
      },
    }));
  }

  /**
   * PATCH /api/agent/hik-commands/:id
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
        initiatedBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    const updated = await this.prisma.hikvisionCommand.update({
      where: { id },
      data: { status: body.status, error: body.error ?? null },
    });

    if (cmd) {
      const empName = `${cmd.employee.lastName} ${cmd.employee.firstName}`;
      const empInfo = [cmd.employee.position?.name, cmd.employee.department?.name].filter(Boolean).join(' · ');
      const devName = cmd.device.deviceName || cmd.device.officeName || 'Устройство';
      const dirLabel = cmd.device.direction === 'IN' ? 'Вход ↑' : 'Выход ↓';
      const ipLabel = cmd.device.directPort ? `${cmd.device.lastSeenIp}:${cmd.device.directPort}` : cmd.device.lastSeenIp;
      const companyName = cmd.device.company?.shortName || cmd.device.company?.name || '';
      const now = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Dushanbe', hour12: false });
      const initiator = cmd.initiatedBy
        ? [cmd.initiatedBy.lastName, cmd.initiatedBy.firstName].filter(Boolean).join(' ') || cmd.initiatedBy.email
        : 'Система';

      if (body.status === 'done') {
        const header = cmd.action === 'grant' ? '✅ <b>Face ID добавлен</b>' : '🗑 <b>Face ID удалён</b>';
        const lines = [header, '', `👤 <b>${empName}</b>`];
        if (empInfo) lines.push(`   ${empInfo}`);
        if (companyName) lines.push(`   ${companyName}`);
        lines.push('', `🚪 <b>${devName}</b>  ·  ${dirLabel}`, `   🔗 <code>${ipLabel}</code>`);
        if (cmd.device.externalIp) lines.push(`   🌐 <code>${cmd.device.externalIp}</code>`);
        lines.push('', `👮 ${initiator}`, `🕐 ${now}  ·  Relay-агент`);
        this.telegram.sendMessage(lines.join('\n')).catch(() => {});
      } else {
        const actionText = cmd.action === 'grant' ? 'добавить Face ID' : 'удалить Face ID';
        const lines = [`❌ <b>Ошибка — не удалось ${actionText}</b>`, '', `👤 <b>${empName}</b>`];
        if (empInfo) lines.push(`   ${empInfo}`);
        if (companyName) lines.push(`   ${companyName}`);
        lines.push('', `🚪 <b>${devName}</b>  ·  ${dirLabel}`, `   🔗 <code>${ipLabel}</code>`);
        if (cmd.device.externalIp) lines.push(`   🌐 <code>${cmd.device.externalIp}</code>`);
        lines.push('', `⚠️ ${body.error || 'неизвестно'}`, `👮 ${initiator}`, `🕐 ${now}`);
        this.telegram.sendMessage(lines.join('\n')).catch(() => {});
      }
    }
    return updated;
  }

  /**
   * GET /api/agent/status
   * Статистика команд (для агента при старте).
   */
  @Get('status')
  async getStatus(
    @Headers('x-agent-token') token: string,
    @Headers('x-agent-id') agentIdHeader: string | undefined,
    @Query('companyId') companyIdStr?: string,
  ) {
    this.checkToken(token);
    const companyId = agentIdHeader
      ? await this.getAgentCompanyId(agentIdHeader)
      : (companyIdStr ? parseInt(companyIdStr) : null);
    const doorFilter = companyId ? { door: { companyId } } : {};

    const [pending, done, failed] = await Promise.all([
      this.prisma.doorCommand.count({ where: { status: 'pending', ...doorFilter } }),
      this.prisma.doorCommand.count({ where: { status: 'done', ...doorFilter } }),
      this.prisma.doorCommand.count({ where: { status: 'failed', ...doorFilter } }),
    ]);
    return { pending, done, failed };
  }

  // ─────────────────────────────────────────────────────────────
  //  Управление агентами (JWT — суперадмин)
  // ─────────────────────────────────────────────────────────────

  /**
   * GET /api/agent/agents
   * Список всех зарегистрированных агентов с онлайн-статусом.
   */
  @UseGuards(JwtAuthGuard)
  @Get('agents')
  async listAgents(@Request() req: any) {
    if (!req.user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');

    const agents = await this.prisma.agent.findMany({
      include: { company: { select: { id: true, name: true, shortName: true } } },
      orderBy: { name: 'asc' },
    });

    const now = Date.now();
    return agents.map(a => {
      const secondsAgo = a.lastSeenAt
        ? Math.floor((now - a.lastSeenAt.getTime()) / 1000)
        : null;
      return {
        id: a.id,
        agentId: a.agentId,
        name: a.name,
        version: a.version,
        companyId: a.companyId,
        company: a.company,
        lastSeenAt: a.lastSeenAt,
        secondsAgo,
        online: secondsAgo !== null && secondsAgo < 120,
      };
    });
  }

  /**
   * PATCH /api/agent/agents/:id/assign
   * Назначить компанию агенту (или убрать привязку: companyId = null).
   */
  @UseGuards(JwtAuthGuard)
  @Patch('agents/:id/assign')
  async assignAgent(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { companyId: number | null },
  ) {
    if (!req.user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');
    return this.prisma.agent.update({
      where: { id },
      data: { companyId: body.companyId ?? null },
      include: { company: { select: { id: true, name: true, shortName: true } } },
    });
  }

  /**
   * DELETE /api/agent/agents/:id
   * Удалить агент (например, если ПК заменили и UUID изменился).
   */
  @UseGuards(JwtAuthGuard)
  @Patch('agents/:id/delete')
  async deleteAgent(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    if (!req.user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');
    await this.prisma.agent.delete({ where: { id } });
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────
  //  Статус для фронтенда (JWT — любой пользователь)
  // ─────────────────────────────────────────────────────────────

  /**
   * GET /api/agent/public-status[?companyId=X]
   * Статус relay-агента для компании. Использует БД — стабильно после рестарта сервера.
   * Агент онлайн если:
   *   - есть агент с companyId=X и lastSeenAt < 2 мин назад
   *   - ИЛИ есть агент без companyId (глобальный) и lastSeenAt < 2 мин назад
   */
  @UseGuards(JwtAuthGuard)
  @Get('public-status')
  async getPublicStatus(
    @Query('companyId') companyIdStr: string,
    @Request() req: any,
  ) {
    const user = req.user;
    const companyId = user.isHoldingAdmin ? parseInt(companyIdStr) : user.companyId;
    if (!companyId) return { online: false, secondsAgo: null, pendingCommands: 0 };

    const twoMinAgo = new Date(Date.now() - 120_000);

    // Ищем онлайн-агент для этой компании или глобальный (без привязки)
    const onlineAgent = await this.prisma.agent.findFirst({
      where: {
        lastSeenAt: { gt: twoMinAgo },
        OR: [{ companyId }, { companyId: null }],
      },
      orderBy: { lastSeenAt: 'desc' },
      select: { lastSeenAt: true, name: true },
    });

    const secondsAgo = onlineAgent?.lastSeenAt
      ? Math.floor((Date.now() - onlineAgent.lastSeenAt.getTime()) / 1000)
      : null;

    const pendingCommands = await this.prisma.hikvisionCommand.count({
      where: { status: { in: ['pending', 'processing'] }, device: { companyId } },
    });

    return {
      online: !!onlineAgent,
      secondsAgo,
      pendingCommands,
      agentName: onlineAgent?.name ?? null,
    };
  }
}
