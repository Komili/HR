import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as crypto from 'crypto';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import sharp = require('sharp');
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { TelegramService } from '../telegram/telegram.service';
import { HikvisionIsupService } from './hikvision-isup.service';
import { RequestUser } from '../auth/jwt.strategy';
import { toFolderName } from '../common/transliterate';

// Устройство считается офлайн если нет heartbeat дольше этого времени
const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 минут
// Как часто проверять доступность устройств
const CHECK_INTERVAL_MS = 2 * 60 * 1000; // каждые 2 минуты

@Injectable()
export class HikvisionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HikvisionService.name);
  // MAC → true (онлайн) | false (офлайн) | undefined (первый запуск)
  private readonly deviceOnlineState = new Map<string, boolean>();
  private readonly agentOnlineState = new Map<string, boolean>();
  private monitorTimer: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private attendanceService: AttendanceService,
    private telegramService: TelegramService,
    private isup: HikvisionIsupService,
  ) {}

  onModuleInit() {
    // Первая проверка через 1 минуту после старта (чтобы БД успела подняться)
    this.monitorTimer = setTimeout(() => this.runMonitorLoop(), 60_000);
  }

  onModuleDestroy() {
    if (this.monitorTimer) clearTimeout(this.monitorTimer);
  }

  private async runMonitorLoop() {
    try {
      await this.checkDeviceAvailability();
    } catch (e) {
      this.logger.error(`Ошибка мониторинга устройств: ${e.message}`);
    }
    try {
      await this.checkAgentAvailability();
    } catch (e) {
      this.logger.error(`Ошибка мониторинга агентов: ${e.message}`);
    }
    this.monitorTimer = setTimeout(() => this.runMonitorLoop(), CHECK_INTERVAL_MS);
  }

  private async checkAgentAvailability() {
    // Агент пингует каждые 5 секунд — если нет сигнала 3 минуты, считаем офлайн
    const AGENT_OFFLINE_MS = 3 * 60 * 1000;
    const agents = await this.prisma.agent.findMany();
    const now = Date.now();

    for (const agent of agents) {
      const lastSeen = agent.lastSeenAt ? new Date(agent.lastSeenAt).getTime() : 0;
      const isOnline = lastSeen > 0 && (now - lastSeen) < AGENT_OFFLINE_MS;
      const prev = this.agentOnlineState.get(agent.agentId);

      if (prev === undefined) {
        this.agentOnlineState.set(agent.agentId, isOnline);
        this.logger.log(`[monitor] Агент "${agent.name}" — ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
        continue;
      }

      if (prev === isOnline) continue;

      this.agentOnlineState.set(agent.agentId, isOnline);
      const minsAgo = lastSeen ? Math.floor((now - lastSeen) / 60000) : null;

      if (isOnline) {
        this.logger.log(`🟢 Агент восстановлен: "${agent.name}"`);
        this.telegramService.sendMessage(
          `🟢 <b>Агент восстановлен</b>\n` +
          `🖥 Имя: ${agent.name}\n` +
          `✅ Связь восстановлена`,
        ).catch(() => {});
      } else {
        this.logger.warn(`🔴 Агент недоступен: "${agent.name}", последний сигнал ${minsAgo} мин назад`);
        this.telegramService.sendMessage(
          `🔴 <b>Агент недоступен</b>\n` +
          `🖥 Имя: ${agent.name}\n` +
          `⏰ Последний сигнал: ${minsAgo !== null ? `${minsAgo} мин назад` : 'никогда'}\n` +
          `⚠️ Проверь компьютер с агентом`,
        ).catch(() => {});
      }
    }
  }

  private async checkDeviceAvailability() {
    const devices = await this.prisma.hikvisionDevice.findMany({
      where: { status: 'active' },
      include: { company: { select: { shortName: true, name: true } } },
    });

    const now = Date.now();

    for (const device of devices) {
      const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
      const isOnline = lastSeen > 0 && (now - lastSeen) < OFFLINE_THRESHOLD_MS;
      const prevState = this.deviceOnlineState.get(device.macAddress);

      // Первый запуск — просто запоминаем состояние без уведомления
      if (prevState === undefined) {
        this.deviceOnlineState.set(device.macAddress, isOnline);
        continue;
      }

      if (prevState === isOnline) continue; // состояние не изменилось

      this.deviceOnlineState.set(device.macAddress, isOnline);
      const companyName = (device as any).company?.shortName || (device as any).company?.name || '—';
      const minsAgo = lastSeen ? Math.floor((now - lastSeen) / 60000) : null;

      if (isOnline) {
        this.logger.log(`🟢 Устройство восстановлено: ${device.officeName} (${device.macAddress})`);
        this.telegramService.sendMessage(
          `🟢 <b>Устройство восстановлено</b>\n` +
          `🏛 Офис: ${device.officeName} (${device.direction === 'IN' ? 'Вход' : 'Выход'})\n` +
          `🏢 Компания: ${companyName}\n` +
          `📟 MAC: ${device.macAddress}\n` +
          `🏠 IP: ${device.lastSeenIp}\n` +
          `✅ Связь восстановлена`,
        ).catch(() => {});
      } else {
        this.logger.warn(`🔴 Устройство недоступно: ${device.officeName} (${device.macAddress}), последний сигнал ${minsAgo} мин назад`);
        this.telegramService.sendMessage(
          `🔴 <b>Устройство недоступно</b>\n` +
          `🏛 Офис: ${device.officeName} (${device.direction === 'IN' ? 'Вход' : 'Выход'})\n` +
          `🏢 Компания: ${companyName}\n` +
          `📟 MAC: ${device.macAddress}\n` +
          `🏠 IP: ${device.lastSeenIp}\n` +
          `⏰ Последний сигнал: ${minsAgo !== null ? `${minsAgo} мин назад` : 'никогда'}\n` +
          `⚠️ Проверь питание и сеть устройства`,
        ).catch(() => {});
      }
    }
  }

  // ─────────── обработка входящего события ───────────

  async handleEvent(rawBody: Buffer | string, externalIp?: string): Promise<void> {
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const jsonStr = this.extractJson(bodyStr);
    if (!jsonStr) {
      this.logger.debug('Не удалось извлечь JSON из тела запроса Hikvision');
      return;
    }

    let eventData: any;
    try {
      eventData = JSON.parse(jsonStr);
    } catch (e) {
      this.logger.warn(`JSON parse error (body ${bodyStr.length} chars, jsonStr ${jsonStr.length} chars): ${e.message}`);
      return;
    }

    const ipAddress: string = eventData.ipAddress;
    const macAddress: string | null = eventData.macAddress || null;
    const eventType: string = eventData.eventType || '';
    const accessEvent = eventData.AccessControllerEvent;

    if (!ipAddress) {
      this.logger.debug('Событие без ipAddress — пропускаем');
      return;
    }

    // Автообнаружение / обновление устройства по MAC (для любого события, включая heartBeat)
    const device = macAddress ? await this.upsertDevice(macAddress, ipAddress, eventData, externalIp) : null;

    // HeartBeat и прочие служебные события — только обновляем IP, дальше не обрабатываем
    if (!accessEvent) {
      this.logger.debug(`Событие "${eventType}" от ${ipAddress} (MAC: ${macAddress || '?'}) — не AccessControllerEvent, пропускаем`);
      return;
    }

    // Удалённое открытие двери через админку Hikvision
    if (accessEvent.majorEventType === 3 && accessEvent.subEventType === 1024) {
      const timeStr = (eventData.dateTime ? new Date(eventData.dateTime) : new Date())
        .toLocaleString('ru-RU', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          timeZone: 'Asia/Dushanbe',
        });

      let msg: string;
      if (device?.status === 'active' && device.officeName) {
        // Привязанное устройство
        msg = [
          `🔓 Дверь открыта удалённо`,
          ``,
          `🏢 Офис: ${device.officeName}`,
          `🚪 Направление: ${device.direction === 'IN' ? 'Вход (IN)' : device.direction === 'OUT' ? 'Выход (OUT)' : '—'}`,
          `🏛 Компания: ID ${device.companyId}`,
          `📟 MAC: ${macAddress || '—'}`,
          `🏠 Внутренний IP: ${device.lastSeenIp}`,
          device.externalIp ? `🌐 Внешний IP: ${device.externalIp}` : null,
          `⏰ Время: ${timeStr}`,
        ].filter(Boolean).join('\n');
      } else {
        // Непривязанное устройство
        msg = [
          `🔓 Дверь открыта удалённо`,
          ``,
          `⚠️ Устройство НЕ привязано к компании`,
          ``,
          `📟 MAC: ${macAddress || '—'}`,
          `🏠 Внутренний IP: ${ipAddress}`,
          device?.externalIp ? `🌐 Внешний IP: ${device.externalIp}` : externalIp ? `🌐 Внешний IP: ${externalIp}` : null,
          device?.deviceName ? `📛 Имя устройства: ${device.deviceName}` : null,
          `🔴 Статус: Ожидает привязки (pending)`,
          `⏰ Время: ${timeStr}`,
          ``,
          `👉 Привяжите устройство в разделе «Управление дверями»`,
        ].filter(Boolean).join('\n');
      }

      await this.telegramService.sendMessage(msg);
      await this.telegramService.sendAttendance(msg);
      this.logger.log(`Удалённое открытие двери: ${device?.officeName || ipAddress}`);
      return;
    }

    // Фото лица извлекаем в самом начале — нужно для любого события (в т.ч. неизвестных лиц)
    const facePhoto = this.extractJpegFromMultipart(
      typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody,
    );
    this.logger.debug(`facePhoto extracted: ${facePhoto ? facePhoto.length + ' bytes' : 'null'}`);

    // DS-K series uses "employeeNoString", older devices use "employeeNo"
    const employeeNo = accessEvent.employeeNoString
      ? String(accessEvent.employeeNoString)
      : accessEvent.employeeNo
        ? String(accessEvent.employeeNo)
        : null;

    // Определяем офис и направление по устройству в БД или .env
    let officeName: string | null = null;
    let direction: 'IN' | 'OUT' | null = null;

    if (device?.status === 'active' && device.officeName && device.direction) {
      officeName = device.officeName;
      direction = device.direction as 'IN' | 'OUT';
    } else {
      try {
        const envDevices: Array<{ ip: string; officeName: string; direction: string }> =
          JSON.parse(process.env.HIKVISION_DEVICES || '[]');
        const envDevice = envDevices.find((d) => d.ip === ipAddress);
        if (envDevice) {
          officeName = envDevice.officeName;
          direction = envDevice.direction as 'IN' | 'OUT';
        }
      } catch {}
    }

    const timestamp = eventData.dateTime ? new Date(eventData.dateTime) : new Date();
    const timeStr = timestamp.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Asia/Dushanbe',
    });

    // Незарегистрированное лицо — устройство не смогло определить ID
    if (!employeeNo) {
      if (facePhoto && facePhoto.length > 1000) {
        await this.recordUnknownFace({
          reason: 'no_id',
          timestamp, facePhoto, ipAddress, macAddress,
          officeName, direction,
          companyId: device?.status === 'active' ? device.companyId ?? null : null,
          rawEmployeeNo: null,
        });
        this.logger.warn(`Незарегистрированное лицо зафиксировано (IP ${ipAddress})`);

        const caption = [
          `⚠️ <b>Незарегистрированное лицо</b>`,
          ``,
          officeName ? `🏢 ${officeName} (${direction === 'IN' ? 'Вход' : 'Выход'})` : `🏠 IP: ${ipAddress}`,
          `⏰ ${timeStr}`,
        ].join('\n');
        await this.telegramService.sendAttendancePhoto(facePhoto, caption);
      } else {
        this.logger.debug('Событие без employeeNo и без фото — пропускаем');
      }
      return;
    }

    if (!officeName || !direction) {
      this.logger.warn(`Устройство IP=${ipAddress} MAC=${macAddress || '?'} не привязано к компании — пропускаем`);
      return;
    }

    // Отказ в доступе от устройства: лицо не распознано / нет прав
    // subEventType: 16=нет прав, 76=Face ID не совпал, 25=не авторизован
    const DENIED_SUBTYPES = new Set([16, 25, 76]);
    const subType: number = accessEvent.subEventType ?? -1;
    const isDenied = DENIED_SUBTYPES.has(subType);

    if (isDenied) {
      this.logger.warn(`Отказ в доступе: СКУД №${employeeNo} subType=${subType} (${officeName})`);
      await this.recordUnknownFace({
        reason: 'face_not_matched',
        timestamp, facePhoto, ipAddress, macAddress,
        officeName, direction,
        companyId: device?.status === 'active' ? device.companyId ?? null : null,
        rawEmployeeNo: employeeNo,
      });
      const caption = [
        `🚫 <b>Отказ в доступе</b>`,
        ``,
        `🔢 СКУД №: ${employeeNo}`,
        `🏢 ${officeName} (${direction === 'IN' ? 'Вход' : 'Выход'})`,
        `⏰ ${timeStr}`,
        subType === 76 ? `❌ Причина: лицо не распознано` :
        subType === 16 ? `❌ Причина: нет прав доступа` :
                         `❌ Причина: отказ устройства (${subType})`,
      ].join('\n');

      if (facePhoto && facePhoto.length > 1000) {
        await this.telegramService.sendAttendancePhoto(facePhoto, caption);
      } else {
        await this.telegramService.sendAttendance(caption);
      }
      return;
    }

    // Ищем сотрудника: по skudId, по id, по номеру телефона (формат 992xxxxxxxxx)
    const numericId = parseInt(employeeNo) || 0;
    const phoneVariants = employeeNo.length >= 9
      ? [`+${employeeNo}`, employeeNo, `+${employeeNo.slice(-9)}`, employeeNo.slice(-9)]
      : [];
    const employee = await this.prisma.employee.findFirst({
      where: {
        OR: [
          { skudId: employeeNo },
          { id: numericId },
          ...(phoneVariants.length ? [{ phone: { in: phoneVariants } }] : []),
        ],
      },
      include: {
        company: { select: { name: true } },
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
    });

    if (!employee) {
      this.logger.warn(`Сотрудник не найден по СКУД ID: ${employeeNo} (IP: ${ipAddress})`);
      await this.recordUnknownFace({
        reason: 'unknown_employee',
        timestamp, facePhoto, ipAddress, macAddress,
        officeName, direction,
        companyId: device?.status === 'active' ? device.companyId ?? null : null,
        rawEmployeeNo: employeeNo,
      });
      const caption = [
        `⚠️ <b>Неизвестный сотрудник</b>`,
        ``,
        `🔢 СКУД №: ${employeeNo}`,
        `🏢 ${officeName} (${direction === 'IN' ? 'Вход' : 'Выход'})`,
        `🏠 IP: ${ipAddress}`,
        `⏰ ${timeStr}`,
      ].join('\n');

      if (facePhoto && facePhoto.length > 1000) {
        await this.telegramService.sendAttendancePhoto(facePhoto, caption);
      } else {
        await this.telegramService.sendAttendance(caption);
      }
      return;
    }

    const office = await this.prisma.office.findFirst({
      where: { name: officeName, companyId: employee.companyId },
    });

    const selfiePath = (facePhoto && facePhoto.length > 1000)
      ? await this.saveSelfieToStorage(employee, timestamp, facePhoto)
      : null;

    await this.prisma.attendanceEvent.create({
      data: {
        employeeId: employee.id,
        companyId: employee.companyId,
        timestamp,
        direction,
        deviceName: device?.officeName || device?.deviceName || `Hikvision ${ipAddress}`,
        officeId: office?.id || null,
        source: 'HIKVISION',
        selfiePath,
      },
    });

    await this.attendanceService.recalculateDay(employee.id, timestamp);

    const fullName = `${employee.lastName} ${employee.firstName}${employee.patronymic ? ' ' + employee.patronymic : ''}`;
    const isIn = direction === 'IN';

    const caption = [
      `${isIn ? '🟢' : '🔴'} <b>${isIn ? 'Вход' : 'Выход'}</b>`,
      ``,
      `👤 <b>${fullName}</b>`,
      employee.position?.name || employee.department?.name
        ? `   ${[employee.position?.name, employee.department?.name].filter(Boolean).join(' · ')}`
        : null,
      ``,
      `🏢 ${officeName}${employee.company?.name ? ` · ${employee.company.name}` : ''}`,
      `⏰ ${timeStr}`,
    ].filter(s => s !== null).join('\n');

    if (facePhoto && facePhoto.length > 1000) {
      await this.telegramService.sendAttendancePhoto(facePhoto, caption, employee.companyId);
    } else if (employee.photoPath) {
      // Устройство не прислало фото — отправляем нормализованное фото из хранилища
      try {
        const normPath = employee.photoPath.replace(/photo\.jpg$/, 'photo_norm.jpg');
        const absPath = path.resolve(fs.existsSync(normPath) ? normPath : employee.photoPath);
        if (fs.existsSync(absPath)) {
          const storedPhoto = fs.readFileSync(absPath);
          await this.telegramService.sendAttendancePhoto(storedPhoto, caption, employee.companyId);
        } else {
          await this.telegramService.sendAttendance(caption, employee.companyId);
        }
      } catch {
        await this.telegramService.sendAttendance(caption, employee.companyId);
      }
    } else {
      await this.telegramService.sendAttendance(caption, employee.companyId);
    }
    this.logger.log(`${isIn ? 'Вход' : 'Выход'}: ${fullName} — ${officeName} (${timeStr})`);
  }

  // ─────────── автообнаружение устройства ───────────

  private extractDeviceInfo(eventData: any) {
    const acc = eventData.AccessControllerEvent || {};
    return {
      deviceName: acc.deviceName || acc.channelName || eventData.deviceName || eventData.channelName || null,
      serialNo:   acc.serialNo || eventData.serialNo || null,
      model:      acc.model    || eventData.model    || null,
      firmware:   acc.firmwareVersion || eventData.firmwareVersion || null,
    };
  }

  private async upsertDevice(macAddress: string, ip: string, eventData: any, externalIp?: string) {
    const existing = await this.prisma.hikvisionDevice.findUnique({
      where: { macAddress },
    });

    const { deviceName } = this.extractDeviceInfo(eventData);

    if (existing) {
      const updates: any = { lastSeenAt: new Date() };
      if (existing.lastSeenIp !== ip) {
        this.logger.log(`Hikvision MAC=${macAddress}: внутренний IP изменился ${existing.lastSeenIp} → ${ip}`);
        updates.lastSeenIp = ip;
      }
      if (externalIp && existing.externalIp !== externalIp) {
        this.logger.log(`Hikvision MAC=${macAddress}: внешний IP изменился ${existing.externalIp} → ${externalIp}`);
        updates.externalIp = externalIp;
      }
      // Обновляем имя если оно ещё не было известно
      if (!existing.deviceName && deviceName) {
        this.logger.log(`Hikvision MAC=${macAddress}: имя устройства определено → ${deviceName}`);
        updates.deviceName = deviceName;
      }
      await this.prisma.hikvisionDevice.update({ where: { macAddress }, data: updates });
      return { ...existing, ...updates };
    }

    // Новое устройство — создаём как pending
    const { serialNo, model, firmware } = this.extractDeviceInfo(eventData);
    const eventType = eventData.eventType || null;

    const newDevice = await this.prisma.hikvisionDevice.create({
      data: { macAddress, lastSeenIp: ip, externalIp: externalIp || null, deviceName, status: 'pending' },
    });

    this.logger.log(`🆕 Новое Hikvision устройство: MAC=${macAddress} IP=${ip}${deviceName ? ` (${deviceName})` : ''}`);

    const lines = [
      `🆕 <b>Обнаружено новое устройство Hikvision</b>`,
      ``,
      `📟 MAC: \`${macAddress}\``,
      `🏠 Внутренний IP: ${ip}`,
      externalIp  ? `🌐 Внешний IP: ${externalIp}` : null,
      deviceName  ? `📛 Имя устройства: ${deviceName}` : `📛 Имя устройства: определится при следующем событии`,
      serialNo    ? `🔢 Серийный номер: ${serialNo}` : null,
      model       ? `📦 Модель: ${model}` : null,
      firmware    ? `⚙️ Прошивка: ${firmware}` : null,
      eventType   ? `📡 Тип события: ${eventType}` : null,
      ``,
      `🔴 Статус: ожидает привязки`,
      ``,
      `👉 Привяжите устройство в разделе «Управление дверями»`,
    ].filter(Boolean).join('\n');

    await this.telegramService.sendMessage(lines);

    return newDevice;
  }

  // ─────────── управление устройствами ───────────

  async getDevices(user: RequestUser) {
    if (!user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');
    return this.prisma.hikvisionDevice.findMany({
      include: { company: { select: { id: true, name: true, shortName: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getActiveDevicesForCompany(companyId: number, user: RequestUser) {
    const targetCompanyId = user.isHoldingAdmin ? companyId : (user.companyId ?? companyId);
    return this.prisma.hikvisionDevice.findMany({
      where: { companyId: targetCompanyId, status: 'active' },
      orderBy: [{ officeName: 'asc' }, { direction: 'asc' }],
    });
  }

  async bindDevice(
    id: number,
    data: { companyId: number; officeName: string; direction: 'IN' | 'OUT'; login?: string; password?: string; directPort?: number; externalIp?: string },
    user: RequestUser,
  ) {
    if (!user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');
    const device = await this.prisma.hikvisionDevice.findUnique({ where: { id } });
    if (!device) throw new NotFoundException(`Устройство #${id} не найдено`);

    const company = await this.prisma.company.findUnique({
      where: { id: data.companyId },
      select: { name: true, shortName: true },
    });

    const updated = await this.prisma.hikvisionDevice.update({
      where: { id },
      data: {
        companyId: data.companyId,
        officeName: data.officeName,
        direction: data.direction,
        login: data.login ?? 'admin',
        password: data.password ?? null,
        directPort: data.directPort ?? null,
        ...(data.externalIp !== undefined ? { externalIp: data.externalIp || null } : {}),
        status: 'active',
      },
      include: { company: { select: { id: true, name: true, shortName: true } } },
    });

    const companyName = company?.shortName || company?.name || `ID ${data.companyId}`;
    this.telegramService.sendMessage(
      `🔗 <b>Устройство привязано</b>\n` +
      `📟 MAC: ${device.macAddress}\n` +
      `🏠 Внутренний IP: ${device.lastSeenIp}\n` +
      (device.externalIp ? `🌐 Внешний IP: ${device.externalIp}\n` : '') +
      `🏢 Компания: ${companyName}\n` +
      `🏛 Офис: ${data.officeName}\n` +
      `🚪 Направление: ${data.direction === 'IN' ? 'Вход (IN)' : 'Выход (OUT)'}\n` +
      `👤 Привязал: ${user.email}`,
    ).catch(() => {});

    return updated;
  }

  async unbindDevice(id: number, user: RequestUser) {
    if (!user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');
    const device = await this.prisma.hikvisionDevice.findUnique({
      where: { id },
      include: { company: { select: { name: true, shortName: true } } },
    });
    if (!device) throw new NotFoundException(`Устройство #${id} не найдено`);

    const updated = await this.prisma.hikvisionDevice.update({
      where: { id },
      data: { companyId: null, officeName: null, direction: null, status: 'pending' },
    });

    const companyName = (device as any).company?.shortName || (device as any).company?.name || '—';
    this.telegramService.sendMessage(
      `🔌 <b>Устройство отвязано</b>\n` +
      `📟 MAC: ${device.macAddress}\n` +
      `🏠 Внутренний IP: ${device.lastSeenIp}\n` +
      (device.externalIp ? `🌐 Внешний IP: ${device.externalIp}\n` : '') +
      `🏛 Было: ${device.officeName || '—'} (${companyName})\n` +
      `👤 Отвязал: ${user.email}`,
    ).catch(() => {});

    return updated;
  }

  async deleteDevice(id: number, user: RequestUser) {
    if (!user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');
    const device = await this.prisma.hikvisionDevice.findUnique({
      where: { id },
      include: { company: { select: { name: true, shortName: true } } },
    });
    if (!device) throw new NotFoundException(`Устройство #${id} не найдено`);

    await this.prisma.hikvisionDevice.delete({ where: { id } });

    const companyName = (device as any).company?.shortName || (device as any).company?.name || '—';
    this.telegramService.sendMessage(
      `🗑 <b>Устройство удалено из системы</b>\n` +
      `📟 MAC: ${device.macAddress}\n` +
      `🏠 Внутренний IP: ${device.lastSeenIp}\n` +
      (device.externalIp ? `🌐 Внешний IP: ${device.externalIp}\n` : '') +
      `🏛 Офис: ${device.officeName || '—'} (${companyName})\n` +
      `👤 Удалил: ${user.email}`,
    ).catch(() => {});

    return { ok: true };
  }

  async assignAgentToDevice(id: number, agentId: number | null, user: RequestUser) {
    if (!user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');
    const device = await this.prisma.hikvisionDevice.findUnique({ where: { id } });
    if (!device) throw new NotFoundException(`Устройство #${id} не найдено`);
    return this.prisma.hikvisionDevice.update({
      where: { id },
      data: { agentId: agentId ?? null },
      include: { agent: { select: { id: true, name: true } } },
    });
  }

  // ─────────── управление доступом сотрудников ───────────

  async getEmployeeDevices(employeeId: number, user: RequestUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Сотрудник не найден');

    if (!user.isHoldingAdmin && user.companyId !== employee.companyId) {
      throw new ForbiddenException('Нет доступа');
    }

    const devicesWhere: any = user.isHoldingAdmin
      ? { status: 'active' }
      : { companyId: employee.companyId, status: 'active' };

    const devices = await this.prisma.hikvisionDevice.findMany({
      where: devicesWhere,
      include: { company: { select: { id: true, name: true, shortName: true } } },
      orderBy: [{ companyId: 'asc' }, { officeName: 'asc' }, { direction: 'asc' }],
    });

    const accesses = await this.prisma.hikvisionAccess.findMany({
      where: { employeeId },
      select: { deviceId: true, grantedBy: true, createdAt: true },
    });
    const accessMap = new Map(accesses.map((a) => [a.deviceId, a]));

    return devices.map((d) => ({
      ...d,
      password: undefined,
      hasAccess: accessMap.has(d.id),
      grantedBy: accessMap.get(d.id)?.grantedBy ?? null,
      grantedAt: accessMap.get(d.id)?.createdAt ?? null,
    }));
  }

  /**
   * Формирует подробное Telegram-сообщение о выдаче/отзыве доступа к двери.
   * Включает: сотрудника (должность, отдел), компанию, устройство (направление, IP),
   * способ записи, инициатора и время.
   */
  private buildDoorAccessMessage(
    action: 'grant' | 'revoke',
    employee: { firstName: string; lastName: string; position?: { name: string } | null; department?: { name: string } | null },
    device: { id: number; deviceName?: string | null; officeName?: string | null; direction?: string | null; lastSeenIp?: string | null; externalIp?: string | null; directPort?: number | null; company?: { name: string; shortName: string | null } | null },
    initiator: { firstName?: string | null; lastName?: string | null; email: string } | null,
    initiatorEmail: string,
    via: string,
  ): string {
    const empName = `${employee.lastName} ${employee.firstName}`;
    const empInfo = [employee.position?.name, employee.department?.name].filter(Boolean).join(' · ');
    const companyName = device.company?.shortName || device.company?.name || '';
    const devName = device.deviceName || device.officeName || `Устройство #${device.id}`;
    const dirLabel = device.direction === 'IN' ? 'Вход ↑' : device.direction === 'OUT' ? 'Выход ↓' : '—';
    const ipLabel = device.directPort ? `${device.lastSeenIp}:${device.directPort}` : device.lastSeenIp;
    const now = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Dushanbe', hour12: false });
    const initiatorName = initiator
      ? [initiator.lastName, initiator.firstName].filter(Boolean).join(' ') || initiator.email
      : initiatorEmail;

    const header = action === 'grant' ? '🔑 <b>Выдан доступ к двери</b>' : '🔒 <b>Отозван доступ к двери</b>';
    const lines = [header, '', `👤 <b>${empName}</b>`];
    if (empInfo) lines.push(`   ${empInfo}`);
    if (companyName) lines.push(`   🏢 ${companyName}`);
    lines.push('', `🚪 <b>${devName}</b>  ·  ${dirLabel}`);
    if (ipLabel) lines.push(`   🔗 <code>${ipLabel}</code>`);
    if (device.externalIp) lines.push(`   🌐 <code>${device.externalIp}</code>`);
    lines.push('', via, `👮 Инициатор: ${initiatorName}`);
    if (initiator && initiatorName !== initiator.email) lines.push(`   ✉️ ${initiator.email}`);
    lines.push(`🕐 ${now}`);
    return lines.join('\n');
  }

  async grantAccess(deviceId: number, employeeId: number, user: RequestUser) {
    const [device, employee, initiator] = await Promise.all([
      this.prisma.hikvisionDevice.findUnique({
        where: { id: deviceId },
        include: { company: { select: { name: true, shortName: true } } },
      }),
      this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          id: true, firstName: true, lastName: true, photoPath: true, companyId: true,
          position: { select: { name: true } },
          department: { select: { name: true } },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { firstName: true, lastName: true, email: true },
      }),
    ]);
    if (!device) throw new NotFoundException('Устройство не найдено');
    if (!employee) throw new NotFoundException('Сотрудник не найден');
    if (!user.isHoldingAdmin && user.companyId !== device.companyId) {
      throw new ForbiddenException('Доступ только к устройствам своей компании');
    }

    await this.prisma.hikvisionAccess.upsert({
      where: { deviceId_employeeId: { deviceId, employeeId } },
      create: { deviceId, employeeId, grantedBy: user.email },
      update: { grantedBy: user.email },
    });

    // Telegram-уведомление о фактической записи на устройство.
    // Отправляем ТОЛЬКО после успешной записи, а не сразу после upsert.
    const notifyGranted = (via: string) => {
      this.telegramService.notify(
        'door_access',
        this.buildDoorAccessMessage('grant', employee, device, initiator, user.email, via),
        { companyId: device.companyId },
      ).catch(() => { /* не критично */ });
    };

    // Пробуем отправить через ISUP напрямую
    const isupResult = await this.tryIsupGrant(device, employee);
    if (isupResult.sent) {
      notifyGranted('🤖 Записан через ISUP');
      return { ok: true, message: isupResult.message };
    }

    // Пробуем через port forwarding (externalIp:directPort → устройство:80)
    if (device.externalIp && (device as any).directPort) {
      try {
        const warn = await this.pushToDevice(
          { lastSeenIp: device.externalIp, login: device.login, password: device.password, directPort: (device as any).directPort },
          employee, 'grant',
        );
        notifyGranted('🌐 Записан напрямую (port forwarding)');
        return { ok: true, message: `✅ Записан на устройство напрямую (port forwarding)${warn ? '. ' + warn : ''}` };
      } catch (e) {
        this.logger.warn(`Port-forward grant failed: ${e.message}`);
      }
    }

    // Fallback: очередь команды для relay-агента.
    // Здесь НЕ шлём уведомление — оно придёт из updateHikCommand,
    // когда relay-агент реально запишет сотрудника и отчитается о выполнении.
    await this.prisma.hikvisionCommand.create({
      data: { deviceId, employeeId, action: 'grant', initiatedById: user.userId },
    });
    return { ok: true, message: 'Доступ выдан. Relay-агент запишет сотрудника на устройство.' };
  }

  async grantAllEmployees(deviceId: number, user: RequestUser) {
    const device = await this.prisma.hikvisionDevice.findUnique({
      where: { id: deviceId },
      include: { company: { select: { name: true, shortName: true } } },
    });
    if (!device) throw new NotFoundException('Устройство не найдено');
    if (device.status !== 'active') throw new ForbiddenException('Устройство не привязано к компании');
    if (!user.isHoldingAdmin && user.companyId !== device.companyId) {
      throw new ForbiddenException('Доступ только к устройствам своей компании');
    }

    const companyId = device.companyId!;

    // Все активные сотрудники компании (не уволены, не в декрете и т.д.)
    const employees = await this.prisma.employee.findMany({
      where: {
        companyId,
        status: { notIn: ['Уволен', 'Декрет', 'В отпуске', 'Больничный', 'Ожидает', 'Отклонён'] },
      },
      select: { id: true, firstName: true, lastName: true, photoPath: true },
    });

    if (employees.length === 0) {
      return { granted: 0, skipped: 0, message: 'Нет активных сотрудников в компании' };
    }

    // Уже имеющие доступ
    const existing = await this.prisma.hikvisionAccess.findMany({
      where: { deviceId, employeeId: { in: employees.map(e => e.id) } },
      select: { employeeId: true },
    });
    const existingIds = new Set(existing.map(a => a.employeeId));

    const toGrant = employees.filter(e => !existingIds.has(e.id));
    const skipped = employees.length - toGrant.length;

    if (toGrant.length === 0) {
      return { granted: 0, skipped, message: `Все ${skipped} сотрудников уже имеют доступ` };
    }

    // Записываем доступы и команды
    await this.prisma.hikvisionAccess.createMany({
      data: toGrant.map(e => ({ deviceId, employeeId: e.id, grantedBy: user.email })),
      skipDuplicates: true,
    });
    await this.prisma.hikvisionCommand.createMany({
      data: toGrant.map(e => ({ deviceId, employeeId: e.id, action: 'grant', initiatedById: user.userId })),
    });

    const companyName = (device as any).company?.shortName || (device as any).company?.name || '';
    const devLabel = `${device.deviceName || device.officeName} (${device.direction === 'IN' ? 'Вход' : 'Выход'})`;

    this.telegramService.sendMessage(
      `👥 <b>Массовая выдача Face ID</b>\n\n` +
      `🚪 ${devLabel}${companyName ? ` · ${companyName}` : ''}\n` +
      `✅ Выдано: <b>${toGrant.length}</b> сотрудников\n` +
      (skipped ? `⏭ Уже имели доступ: ${skipped}\n` : '') +
      `\n🤖 Relay-агент запишет всех при следующем подключении\n` +
      `👮 Инициатор: ${user.email}`,
    ).catch(() => {});

    this.logger.log(`Массовая выдача: ${toGrant.length} сотрудников на устройство #${deviceId} (${devLabel})`);

    return {
      granted: toGrant.length,
      skipped,
      message: `Выдано ${toGrant.length} сотрудникам. Relay-агент запишет их на устройство.`,
    };
  }

  async revokeAllEmployees(deviceId: number, user: RequestUser) {
    if (!user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');
    const device = await this.prisma.hikvisionDevice.findUnique({
      where: { id: deviceId },
      include: { company: { select: { name: true, shortName: true } } },
    });
    if (!device) throw new NotFoundException('Устройство не найдено');

    const accesses = await this.prisma.hikvisionAccess.findMany({
      where: { deviceId },
      select: { employeeId: true },
    });

    if (accesses.length === 0) {
      return { revoked: 0, message: 'Нет сотрудников с доступом' };
    }

    await this.prisma.hikvisionCommand.createMany({
      data: accesses.map(a => ({ deviceId, employeeId: a.employeeId, action: 'revoke', initiatedById: user.userId })),
    });
    await this.prisma.hikvisionAccess.deleteMany({ where: { deviceId } });

    const companyName = (device as any).company?.shortName || (device as any).company?.name || '';
    const devLabel = `${device.deviceName || device.officeName} (${device.direction === 'IN' ? 'Вход' : 'Выход'})`;
    this.telegramService.sendMessage(
      `🗑 <b>Массовое удаление Face ID</b>\n\n` +
      `🚪 ${devLabel}${companyName ? ` · ${companyName}` : ''}\n` +
      `❌ Удалено: <b>${accesses.length}</b> сотрудников\n` +
      `👮 Инициатор: ${user.email}`,
    ).catch(() => {});

    return { revoked: accesses.length, message: `Удалено ${accesses.length} сотрудников с устройства. Relay-агент выполнит удаление.` };
  }

  async revokeAccess(deviceId: number, employeeId: number, user: RequestUser) {
    const [device, employee, initiator] = await Promise.all([
      this.prisma.hikvisionDevice.findUnique({
        where: { id: deviceId },
        include: { company: { select: { name: true, shortName: true } } },
      }),
      this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          id: true, firstName: true, lastName: true, companyId: true,
          position: { select: { name: true } },
          department: { select: { name: true } },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { firstName: true, lastName: true, email: true },
      }),
    ]);
    if (!device) throw new NotFoundException('Устройство не найдено');
    if (!employee) throw new NotFoundException('Сотрудник не найден');
    if (!user.isHoldingAdmin && user.companyId !== device.companyId) {
      throw new ForbiddenException('Доступ только к устройствам своей компании');
    }

    await this.prisma.hikvisionAccess.deleteMany({ where: { deviceId, employeeId } });

    // Telegram-уведомление об отзыве доступа (категория door_access).
    // Отправляем ТОЛЬКО после фактического удаления с устройства, а не сразу после deleteMany.
    const notifyRevoked = (via: string) => {
      this.telegramService.notify(
        'door_access',
        this.buildDoorAccessMessage('revoke', employee, device, initiator, user.email, via),
        { companyId: device.companyId },
      ).catch(() => { /* не критично */ });
    };

    // Пробуем отправить через ISUP напрямую
    const isupResult = await this.tryIsupRevoke(device, employee);
    if (isupResult.sent) {
      notifyRevoked('🤖 Удалён через ISUP');
      return { ok: true, message: isupResult.message };
    }

    // Пробуем через port forwarding
    if (device.externalIp && (device as any).directPort) {
      try {
        await this.pushToDevice(
          { lastSeenIp: device.externalIp, login: device.login, password: device.password, directPort: (device as any).directPort },
          employee, 'revoke',
        );
        notifyRevoked('🌐 Удалён напрямую (port forwarding)');
        return { ok: true, message: '✅ Удалён с устройства напрямую (port forwarding)' };
      } catch (e) {
        this.logger.warn(`Port-forward revoke failed: ${e.message}`);
      }
    }

    // Fallback: очередь команды для relay-агента.
    // Здесь НЕ шлём уведомление — оно придёт из updateHikCommand,
    // когда relay-агент реально удалит сотрудника и отчитается о выполнении.
    await this.prisma.hikvisionCommand.create({
      data: { deviceId, employeeId, action: 'revoke', initiatedById: user.userId },
    });
    return { ok: true, message: 'Доступ закрыт. Relay-агент удалит сотрудника с устройства.' };
  }

  // ─────────── ISUP прямые команды ───────────

  private async tryIsupGrant(
    device: { id: number; macAddress: string; officeName: string | null },
    employee: { id: number; firstName: string; lastName: string; photoPath?: string | null },
  ): Promise<{ sent: boolean; message: string }> {
    const mac = device.macAddress;
    if (!this.isup.isConnected(mac)) {
      return { sent: false, message: 'ISUP не подключён' };
    }

    try {
      const empNo = String(employee.id);
      const name  = `${employee.lastName} ${employee.firstName}`.substring(0, 32);

      // Удаляем старую запись (на случай если уже был добавлен)
      try {
        const delBody = JSON.stringify({ UserInfoDelCond: { EmployeeNoList: [{ employeeNo: empNo }] } });
        await this.isup.sendIsapi(mac, 'PUT', 'ISAPI/AccessControl/UserInfo/Delete?format=json', delBody);
      } catch { /* не страшно — значит пользователя не было */ }

      // Добавляем пользователя
      const userBody = JSON.stringify({
        UserInfo: {
          employeeNo: empNo, name, userType: 'normal',
          Valid: { enable: true, beginTime: '2020-01-01T00:00:00', endTime: '2099-12-31T23:59:59' },
          doorRight: '1',
          RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
        },
      });
      await this.isup.sendIsapi(mac, 'POST', 'ISAPI/AccessControl/UserInfo/Record?format=json', userBody);
      this.logger.log(`ISUP: пользователь добавлен на ${device.officeName} (${mac})`);

      // Загружаем фото (не критично)
      let photoNote = '';
      if (employee.photoPath) {
        photoNote = await this.isupUploadFace(mac, empNo, employee.photoPath);
      }

      return { sent: true, message: `✅ Записан на устройство напрямую (ISUP)${photoNote}` };
    } catch (e) {
      this.logger.warn(`ISUP grant failed for ${mac}: ${e.message}`);
      return { sent: false, message: e.message };
    }
  }

  private async tryIsupRevoke(
    device: { id: number; macAddress: string; officeName: string | null },
    employee: { id: number },
  ): Promise<{ sent: boolean; message: string }> {
    const mac = device.macAddress;
    if (!this.isup.isConnected(mac)) {
      return { sent: false, message: 'ISUP не подключён' };
    }

    try {
      const delBody = JSON.stringify({ UserInfoDelCond: { EmployeeNoList: [{ employeeNo: String(employee.id) }] } });
      await this.isup.sendIsapi(mac, 'PUT', 'ISAPI/AccessControl/UserInfo/Delete?format=json', delBody);
      this.logger.log(`ISUP: пользователь удалён с ${device.officeName} (${mac})`);
      return { sent: true, message: '✅ Удалён с устройства напрямую (ISUP)' };
    } catch (e) {
      this.logger.warn(`ISUP revoke failed for ${mac}: ${e.message}`);
      return { sent: false, message: e.message };
    }
  }

  private async isupUploadFace(mac: string, empNo: string, photoPath: string): Promise<string> {
    try {
      const absPath = path.resolve(photoPath);
      if (!fs.existsSync(absPath)) return '';

      const sharp = require('sharp');
      const imgBuf = await sharp(absPath)
        .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 }).toBuffer();

      const boundary = `----FormBoundary${crypto.randomBytes(8).toString('hex')}`;
      const jsonPart = JSON.stringify({ faceLibType: 'blackFD', FDID: '1', FPID: empNo });
      const faceBody = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="FaceDataRecord"\r\nContent-Type: application/json\r\n\r\n${jsonPart}\r\n--${boundary}\r\nContent-Disposition: form-data; name="img"; filename="face.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
        imgBuf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      // Для multipart через ISUP нам нужен другой Content-Type — временно используем raw Buffer
      // Это продвинутый сценарий, пропускаем если не работает
      await this.isup.sendIsapi(mac, 'POST',
        'ISAPI/Intelligent/FDLib/FaceDataRecord?format=json',
        faceBody.toString('binary'), // упрощённо для ISUP
      );
      return ' + фото Face ID загружено';
    } catch (e) {
      this.logger.warn(`ISUP face upload: ${e.message}`);
      return ' (фото не загружено)';
    }
  }

  async pingDevice(deviceId: number, user: RequestUser) {
    if (!user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');
    const device = await this.prisma.hikvisionDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Устройство не найдено');

    const lastSeen = (device as any).lastSeenAt as Date | null;
    const secondsAgo = lastSeen
      ? Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000)
      : null;

    const online = secondsAgo !== null && secondsAgo < 120; // онлайн если heartbeat < 2 минут назад

    const formatAgo = (s: number) => {
      if (s < 60) return `${s} сек назад`;
      if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
      return `${Math.floor(s / 3600)} ч назад`;
    };

    return {
      online,
      lastSeenAt: lastSeen,
      secondsAgo,
      message: lastSeen
        ? `Последний сигнал: ${formatAgo(secondsAgo!)} (${new Date(lastSeen).toLocaleString('ru-RU', { timeZone: 'Asia/Dushanbe', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })})`
        : 'Сигнал не получен',
    };
  }

  async checkAccess(deviceId: number, employeeId: number, user: RequestUser) {
    const [device, employee, access, lastCmd] = await Promise.all([
      this.prisma.hikvisionDevice.findUnique({ where: { id: deviceId } }),
      this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, firstName: true, lastName: true, companyId: true },
      }),
      this.prisma.hikvisionAccess.findUnique({
        where: { deviceId_employeeId: { deviceId, employeeId } },
      }),
      this.prisma.hikvisionCommand.findFirst({
        where: { deviceId, employeeId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (!device) throw new NotFoundException('Устройство не найдено');
    if (!employee) throw new NotFoundException('Сотрудник не найден');
    if (!user.isHoldingAdmin && user.companyId !== device.companyId) {
      throw new ForbiddenException('Доступ только к устройствам своей компании');
    }

    const lastSeen = (device as any).lastSeenAt as Date | null;
    const secondsAgo = lastSeen
      ? Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000)
      : null;
    const deviceOnline = secondsAgo !== null && secondsAgo < 120;

    return {
      checked: true,
      hasAccess: !!access,
      grantedBy: access?.grantedBy ?? null,
      grantedAt: access?.createdAt ?? null,
      deviceOnline,
      lastSeenAt: lastSeen,
      secondsAgo,
      isupConnected: this.isup.isConnected(device.macAddress),
      // Статус синхронизации через relay-агент
      syncStatus: lastCmd?.status ?? null,   // pending | processing | done | failed | null
      syncAction: lastCmd?.action ?? null,    // grant | revoke
      syncError: lastCmd?.error ?? null,
      syncAt: lastCmd?.updatedAt ?? null,
    };
  }

  // ─────────── журнал неизвестных лиц ───────────

  async getUnknownFaces(date: string | undefined, user: RequestUser, requestedCompanyId?: number) {
    // Диапазон одного дня (по таджикскому времени UTC+5)
    const base = date ? new Date(`${date}T00:00:00+05:00`) : new Date();
    if (!date) {
      // сегодня в Душанбе
      const tz = 5 * 60 * 60 * 1000;
      const local = new Date(Date.now() + tz);
      base.setTime(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - tz);
    }
    const dayStart = base;
    const dayEnd = new Date(base.getTime() + 24 * 60 * 60 * 1000);

    // Фильтр по компании: суперадмин видит всё (или выбранную компанию), остальные — только свою
    const where: any = { timestamp: { gte: dayStart, lt: dayEnd } };
    if (user.isHoldingAdmin) {
      if (requestedCompanyId) where.companyId = requestedCompanyId;
    } else {
      where.companyId = user.companyId ?? -1;
    }

    const items = await this.prisma.unknownFace.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      include: { company: { select: { shortName: true, name: true } } },
    });

    return items.map((u) => ({
      id: u.id,
      timestamp: u.timestamp.toISOString(),
      reason: u.reason,
      rawEmployeeNo: u.rawEmployeeNo,
      officeName: u.officeName,
      direction: u.direction,
      deviceMac: u.deviceMac,
      deviceIp: u.deviceIp,
      companyName: (u as any).company?.shortName || (u as any).company?.name || null,
      hasPhoto: !!u.photoPath,
      reviewed: u.reviewed,
    }));
  }

  async getUnknownFacePhoto(id: number, user: RequestUser): Promise<{ buffer: Buffer; mimeType: string }> {
    const item = await this.prisma.unknownFace.findUnique({
      where: { id },
      select: { photoPath: true, companyId: true },
    });
    if (!item || !item.photoPath) throw new NotFoundException('Фото не найдено');
    if (!user.isHoldingAdmin && item.companyId !== user.companyId) {
      throw new ForbiddenException('Нет доступа');
    }
    const fullPath = item.photoPath.startsWith('storage')
      ? item.photoPath
      : path.join('storage', item.photoPath);
    if (!fs.existsSync(fullPath)) throw new NotFoundException('Файл не найден');
    return { buffer: fs.readFileSync(fullPath), mimeType: 'image/jpeg' };
  }

  async markUnknownReviewed(id: number, reviewed: boolean, user: RequestUser) {
    const item = await this.prisma.unknownFace.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Запись не найдена');
    if (!user.isHoldingAdmin && item.companyId !== user.companyId) {
      throw new ForbiddenException('Нет доступа');
    }
    await this.prisma.unknownFace.update({ where: { id }, data: { reviewed } });
    return { ok: true, reviewed };
  }

  // ─────────── Hikvision ISAPI helpers ───────────

  private async pushToDevice(
    device: { lastSeenIp: string; login: string | null; password: string | null; directPort?: number | null },
    employee: { id: number; firstName: string; lastName: string; photoPath?: string | null },
    action: 'grant' | 'revoke',
  ): Promise<string | undefined> {
    const employeeNo = String(employee.id);
    const fullName = `${employee.lastName} ${employee.firstName}`.substring(0, 32);

    if (action === 'revoke') {
      const body = JSON.stringify({ UserInfoDelCond: { EmployeeNoList: [{ employeeNo }] } });
      await this.hikRequest(device, 'PUT', '/ISAPI/AccessControl/UserInfo/Delete?format=json', body, 'application/json');
      return undefined;
    }

    // grant: create user
    const userBody = JSON.stringify({
      UserInfo: {
        employeeNo, name: fullName, userType: 'normal',
        Valid: { enable: true, beginTime: '2020-01-01T00:00:00', endTime: '2037-12-31T23:59:59' },
        doorRight: '1',
        RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
      },
    });
    try {
      await this.hikRequest(device, 'POST', '/ISAPI/AccessControl/UserInfo/Record?format=json', userBody, 'application/json');
    } catch (err) {
      if (err.message?.includes('employeeNoAlreadyExist')) {
        const delBody = JSON.stringify({ UserInfoDelCond: { EmployeeNoList: [{ employeeNo }] } });
        await this.hikRequest(device, 'PUT', '/ISAPI/AccessControl/UserInfo/Delete?format=json', delBody, 'application/json');
        await this.hikRequest(device, 'POST', '/ISAPI/AccessControl/UserInfo/Record?format=json', userBody, 'application/json');
      } else {
        throw err;
      }
    }

    // upload face (not critical)
    if (employee.photoPath) {
      try {
        const photoAbs = path.resolve(employee.photoPath);
        if (fs.existsSync(photoAbs)) {
          const imgBuf = await sharp(photoAbs)
            .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 }).toBuffer();
          const boundary = `----FormBoundary${crypto.randomBytes(8).toString('hex')}`;
          const jsonPart = JSON.stringify({ faceLibType: 'blackFD', FDID: '1', FPID: employeeNo });
          const faceBody = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="FaceDataRecord"\r\nContent-Type: application/json\r\n\r\n${jsonPart}\r\n--${boundary}\r\nContent-Disposition: form-data; name="img"; filename="face.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
            imgBuf,
            Buffer.from(`\r\n--${boundary}--\r\n`),
          ]);
          await this.hikRequest(device, 'POST',
            '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json', faceBody, `multipart/form-data; boundary=${boundary}`);
        }
      } catch (err) {
        this.logger.warn(`Face upload warning: ${err.message}`);
        return `Пользователь добавлен, но фото не загружено: ${err.message.includes('SubpicAnalysisModelingError') ? 'устройство не распознало лицо (проверьте фото)' : err.message}`;
      }
    }
    return undefined;
  }

  private async hikRequest(
    device: { lastSeenIp: string; login: string | null; password: string | null; directPort?: number | null },
    method: string, urlPath: string, body: string | Buffer, contentType: string,
  ): Promise<string> {
    const login = device.login ?? 'admin';
    const password = device.password ?? '';
    const ip = device.lastSeenIp;
    const port = device.directPort ?? 80;

    const first = await this.rawHikRequest({ ip, port }, method, urlPath, body, contentType, null);
    if (first.status !== 401) {
      if (first.status >= 400) throw new Error(`HTTP ${first.status}: ${first.body}`);
      return first.body;
    }

    const auth = this.buildHikDigest(first.headers['www-authenticate'] || '', method, urlPath, login, password);
    const second = await this.rawHikRequest({ ip, port }, method, urlPath, body, contentType, auth);
    if (second.status !== 401) {
      if (second.status >= 400) throw new Error(`HTTP ${second.status}: ${second.body}`);
      return second.body;
    }
    // Nonce устарел или использован параллельным запросом — повторяем с новым nonce
    const retryAuth = this.buildHikDigest(second.headers['www-authenticate'] || '', method, urlPath, login, password);
    const third = await this.rawHikRequest({ ip, port }, method, urlPath, body, contentType, retryAuth);
    if (third.status === 401) throw new Error(`Неверный логин или пароль для устройства ${ip}`);
    if (third.status >= 400) throw new Error(`HTTP ${third.status}: ${third.body}`);
    return third.body;
  }

  private buildHikDigest(wwwAuth: string, method: string, uri: string, username: string, password: string): string {
    const realm = this.extractHikParam(wwwAuth, 'realm');
    const nonce = this.extractHikParam(wwwAuth, 'nonce');
    const qop = this.extractHikParam(wwwAuth, 'qop');
    const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
    if (qop === 'auth') {
      const nc = '00000001';
      const cnonce = crypto.randomBytes(8).toString('hex');
      const response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`).digest('hex');
      return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=auth, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
    }
    const response = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
    return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  }

  private extractHikParam(header: string, param: string): string {
    const match = header.match(new RegExp(`${param}="([^"]+)"`));
    return match ? match[1] : '';
  }

  private rawHikRequest(
    device: { ip: string; port: number },
    method: string, urlPath: string, body: string | Buffer, contentType: string, authorization: string | null,
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    return new Promise((resolve, reject) => {
      const buf = typeof body === 'string' ? Buffer.from(body) : body;
      const req = http.request({
        hostname: device.ip, port: device.port, path: urlPath, method,
        headers: {
          'Content-Type': contentType,
          'Content-Length': buf.length,
          ...(authorization ? { Authorization: authorization } : {}),
        },
        timeout: 15_000,
      }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string>, body: data }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout connecting to ${device.ip}`)); });
      req.write(buf);
      req.end();
    });
  }

  // ─────────── тест ───────────

  async sendTestMessage(): Promise<string> {
    const now = new Date().toLocaleString('ru-RU', {
      timeZone: 'Asia/Dushanbe',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    const devices = await this.prisma.hikvisionDevice.findMany({
      include: { company: { select: { shortName: true, name: true } } },
    });

    const devicesInfo = devices.length > 0
      ? devices.map((d, i) => [
          `${i + 1}. ${d.status === 'active' ? '🟢' : '🟡'} ${d.status === 'active' ? `${d.officeName} — ${d.direction === 'IN' ? 'Вход' : 'Выход'}` : 'Не привязан'}`,
          `   📟 MAC: ${d.macAddress}`,
          `   🏠 Внутренний IP: ${d.lastSeenIp}`,
          d.externalIp ? `   🌐 Внешний IP: ${d.externalIp}` : null,
        ].filter(Boolean).join('\n')).join('\n\n')
      : '  ⚠️ Устройства ещё не обнаружены';

    const message = [
      `📊 Статус системы КАДРЫ`,
      `⏰ ${now}`,
      ``,
      `📡 Устройства Hikvision (${devices.length}):`,
      ``,
      devicesInfo,
      ``,
      `✅ Система работает нормально`,
    ].join('\n');

    await this.telegramService.sendMessage(message);
    return message;
  }

  // Сохранить фото неизвестного лица в storage/unknown + запись в журнал UnknownFace
  private async recordUnknownFace(params: {
    reason: 'no_id' | 'face_not_matched' | 'unknown_employee';
    timestamp: Date;
    facePhoto: Buffer | null;
    ipAddress: string;
    macAddress: string | null;
    officeName: string | null;
    direction: 'IN' | 'OUT' | null;
    companyId: number | null;
    rawEmployeeNo: string | null;
  }): Promise<void> {
    let photoPath: string | null = null;
    if (params.facePhoto && params.facePhoto.length > 1000) {
      try {
        const pad = (n: number) => String(n).padStart(2, '0');
        const t = params.timestamp;
        const dateFolder = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
        const timeLabel = `${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`;
        const safeIp = (params.ipAddress || 'na').replace(/\./g, '-');
        const dir = path.join('storage', 'unknown', dateFolder);
        await fs.promises.mkdir(dir, { recursive: true });
        const filename = `${timeLabel}_${params.reason}_${safeIp}.jpg`;
        await fs.promises.writeFile(path.join(dir, filename), params.facePhoto);
        photoPath = path.join('unknown', dateFolder, filename);
      } catch (e) {
        this.logger.error(`Не удалось сохранить фото неизвестного лица: ${e.message}`);
      }
    }
    try {
      await this.prisma.unknownFace.create({
        data: {
          timestamp: params.timestamp,
          reason: params.reason,
          photoPath,
          rawEmployeeNo: params.rawEmployeeNo,
          deviceMac: params.macAddress,
          deviceIp: params.ipAddress,
          officeName: params.officeName,
          direction: params.direction,
          companyId: params.companyId,
        },
      });
    } catch (e) {
      this.logger.error(`Не удалось записать UnknownFace: ${e.message}`);
    }

    // Telegram-уведомление о неизвестном лице (категория unknown_face)
    try {
      const reasonLabel: Record<string, string> = {
        no_id: 'нет ID-карты',
        face_not_matched: 'лицо не распознано',
        unknown_employee: 'неизвестный сотрудник',
      };
      const dirLabel = params.direction === 'IN' ? '🟢 Вход' : params.direction === 'OUT' ? '🔴 Выход' : '—';
      const timeStr = params.timestamp.toLocaleString('ru-RU', {
        timeZone: 'Asia/Dushanbe', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
      const caption =
        `⚠️ <b>Неизвестное лицо</b>\n` +
        `📋 Причина: <b>${reasonLabel[params.reason] || params.reason}</b>\n` +
        `🏢 Офис: ${params.officeName || '—'}\n` +
        `🚪 ${dirLabel}\n` +
        (params.rawEmployeeNo ? `🆔 СКУД №: ${params.rawEmployeeNo}\n` : '') +
        `⏰ ${timeStr}`;
      const hasPhoto = params.facePhoto && params.facePhoto.length > 1000;
      await this.telegramService.notify('unknown_face', caption, {
        companyId: params.companyId,
        ...(hasPhoto ? { photo: params.facePhoto as Buffer, caption } : {}),
      });
    } catch (e) {
      this.logger.error(`Не удалось отправить TG (unknown_face): ${e.message}`);
    }
  }

  private async saveSelfieToStorage(
    employee: { id: number; lastName: string; firstName: string; company: { name: string } },
    timestamp: Date,
    jpeg: Buffer,
  ): Promise<string | null> {
    try {
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateFolder = `${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}`;
      const timeLabel = `${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}`;
      const safeName = `${employee.lastName}_${employee.firstName}`.replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]/g, '');
      const filename = `${timeLabel}_${employee.id}_${safeName}.jpg`;
      const dir = path.join('storage', 'snapshots', dateFolder);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, filename), jpeg);
      return path.join('snapshots', dateFolder, filename);
    } catch (e) {
      this.logger.error(`Не удалось сохранить фото посещаемости: ${e.message}`);
      return null;
    }
  }

  // Extract face JPEG from Hikvision multipart event body.
  // The device sends: --boundary / JSON part / --boundary / JPEG part / --boundary--
  private extractJpegFromMultipart(raw: Buffer): Buffer | null {
    try {
      // Find JPEG content-type header
      const jpegHeader = Buffer.from('Content-Type: image/jpeg');
      const hPos = raw.indexOf(jpegHeader);
      if (hPos === -1) return null;

      // Find double CRLF = end of part headers
      const crlf2 = Buffer.from('\r\n\r\n');
      const dataStart = raw.indexOf(crlf2, hPos);
      if (dataStart === -1) return null;
      const imgStart = dataStart + 4;

      // Find boundary at the beginning of the body (first line)
      const firstCrlf = raw.indexOf(Buffer.from('\r\n'));
      if (firstCrlf === -1) return null;
      const boundary = raw.slice(0, firstCrlf); // e.g. "--MIME_boundary"

      // Find the closing boundary after the image data
      const endMarker = Buffer.concat([Buffer.from('\r\n'), boundary]);
      const imgEnd = raw.indexOf(endMarker, imgStart);

      return imgEnd === -1
        ? raw.slice(imgStart)
        : raw.slice(imgStart, imgEnd);
    } catch {
      return null;
    }
  }

  private extractJson(body: string): string | null {
    const start = body.indexOf('{');
    if (start === -1) return null;

    // Count braces properly instead of lastIndexOf — needed when body contains
    // binary JPEG data (multipart with face photo) that may contain '}' bytes.
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < body.length; i++) {
      const ch = body[i];
      if (escaped)            { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true;  continue; }
      if (ch === '"')         { inString = !inString; continue; }
      if (inString)           { continue; }
      if (ch === '{')         { depth++; }
      else if (ch === '}')    { depth--; if (depth === 0) return body.substring(start, i + 1); }
    }
    return null;
  }
}
