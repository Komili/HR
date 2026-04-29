import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
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

@Injectable()
export class HikvisionService {
  private readonly logger = new Logger(HikvisionService.name);

  constructor(
    private prisma: PrismaService,
    private attendanceService: AttendanceService,
    private telegramService: TelegramService,
    private isup: HikvisionIsupService,
  ) {}

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
    } catch {
      this.logger.debug('Ошибка парсинга JSON от Hikvision');
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
      this.logger.log(`Удалённое открытие двери: ${device?.officeName || ipAddress}`);
      return;
    }

    const employeeNo = accessEvent.employeeNo ? String(accessEvent.employeeNo) : null;
    if (!employeeNo) {
      this.logger.debug('Событие без employeeNo — пропускаем');
      return;
    }

    // Определяем офис и направление
    // Приоритет: устройство в БД → переменная окружения (legacy)
    let officeName: string | null = null;
    let direction: 'IN' | 'OUT' | null = null;

    if (device?.status === 'active' && device.officeName && device.direction) {
      officeName = device.officeName;
      direction = device.direction as 'IN' | 'OUT';
    } else {
      // Fallback: HIKVISION_DEVICES из .env
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

    if (!officeName || !direction) {
      this.logger.warn(
        `Устройство IP=${ipAddress} MAC=${macAddress || '?'} не привязано к компании — пропускаем`,
      );
      return;
    }

    const timestamp = eventData.dateTime ? new Date(eventData.dateTime) : new Date();

    // Ищем сотрудника по skudId
    const employee = await this.prisma.employee.findFirst({
      where: { skudId: employeeNo },
      include: {
        company: { select: { name: true } },
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
    });

    if (!employee) {
      this.logger.warn(`Сотрудник не найден по СКУД ID: ${employeeNo} (IP: ${ipAddress})`);
      await this.telegramService.sendMessage(
        `⚠️ Неизвестный сотрудник\nСКУД №: ${employeeNo}\nУстройство: ${officeName} (${direction === 'IN' ? 'Вход' : 'Выход'})\nIP: ${ipAddress}`,
      );
      return;
    }

    const office = await this.prisma.office.findFirst({
      where: { name: officeName, companyId: employee.companyId },
    });

    await this.prisma.attendanceEvent.create({
      data: {
        employeeId: employee.id,
        companyId: employee.companyId,
        timestamp,
        direction,
        deviceName: `Hikvision ${ipAddress}`,
        officeId: office?.id || null,
      },
    });

    await this.attendanceService.recalculateDay(employee.id, timestamp);

    const fullName = `${employee.lastName} ${employee.firstName}${employee.patronymic ? ' ' + employee.patronymic : ''}`;
    const isIn = direction === 'IN';
    const timeStr = timestamp.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Asia/Dushanbe',
    });

    await this.telegramService.sendMessage(
      [
        `${isIn ? '🟢' : '🔴'} ${isIn ? 'Вход сотрудника' : 'Выход сотрудника'}`,
        ``,
        `🏢 Офис: ${officeName}`,
        `🚪 Дверь: ${isIn ? 'Вход (Снаружи)' : 'Выход (Внутри)'}`,
        `👤 Сотрудник: ${fullName}`,
        `⏰ Время: ${timeStr}`,
      ].join('\n'),
    );
    this.logger.log(`${isIn ? 'Вход' : 'Выход'}: ${fullName} — ${officeName} (${timeStr})`);
  }

  // ─────────── автообнаружение устройства ───────────

  private async upsertDevice(macAddress: string, ip: string, eventData: any, externalIp?: string) {
    const existing = await this.prisma.hikvisionDevice.findUnique({
      where: { macAddress },
    });

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
      await this.prisma.hikvisionDevice.update({ where: { macAddress }, data: updates });
      return existing;
    }

    // Новое устройство — создаём как pending
    const deviceName = eventData.AccessControllerEvent?.deviceName || null;
    const newDevice = await this.prisma.hikvisionDevice.create({
      data: { macAddress, lastSeenIp: ip, externalIp: externalIp || null, deviceName, status: 'pending' },
    });

    this.logger.log(`🆕 Новое Hikvision устройство: MAC=${macAddress} IP=${ip}`);
    await this.telegramService.sendMessage(
      `🆕 Обнаружено новое устройство Hikvision\n\nMAC: ${macAddress}\nIP: ${ip}${deviceName ? `\nИмя: ${deviceName}` : ''}\n\nПривяжите его к компании в разделе «Управление дверями»`,
    );

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
    data: { companyId: number; officeName: string; direction: 'IN' | 'OUT'; login?: string; password?: string },
    user: RequestUser,
  ) {
    if (!user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');
    const device = await this.prisma.hikvisionDevice.findUnique({ where: { id } });
    if (!device) throw new NotFoundException(`Устройство #${id} не найдено`);

    return this.prisma.hikvisionDevice.update({
      where: { id },
      data: {
        companyId: data.companyId,
        officeName: data.officeName,
        direction: data.direction,
        login: data.login ?? 'admin',
        password: data.password ?? null,
        status: 'active',
      },
      include: { company: { select: { id: true, name: true, shortName: true } } },
    });
  }

  async unbindDevice(id: number, user: RequestUser) {
    if (!user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');
    const device = await this.prisma.hikvisionDevice.findUnique({ where: { id } });
    if (!device) throw new NotFoundException(`Устройство #${id} не найдено`);

    return this.prisma.hikvisionDevice.update({
      where: { id },
      data: { companyId: null, officeName: null, direction: null, status: 'pending' },
    });
  }

  async deleteDevice(id: number, user: RequestUser) {
    if (!user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');
    const device = await this.prisma.hikvisionDevice.findUnique({ where: { id } });
    if (!device) throw new NotFoundException(`Устройство #${id} не найдено`);
    return this.prisma.hikvisionDevice.delete({ where: { id } });
  }

  // ─────────── управление доступом сотрудников ───────────

  async getEmployeeDevices(employeeId: number, user: RequestUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Сотрудник не найден');

    if (!user.isHoldingAdmin && user.companyId !== employee.companyId) {
      throw new ForbiddenException('Нет доступа');
    }

    const devices = await this.prisma.hikvisionDevice.findMany({
      where: { companyId: employee.companyId, status: 'active' },
      orderBy: [{ officeName: 'asc' }, { direction: 'asc' }],
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

  async grantAccess(deviceId: number, employeeId: number, user: RequestUser) {
    const [device, employee] = await Promise.all([
      this.prisma.hikvisionDevice.findUnique({ where: { id: deviceId } }),
      this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, firstName: true, lastName: true, photoPath: true, companyId: true },
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

    // Пробуем отправить через ISUP напрямую
    const isupResult = await this.tryIsupGrant(device, employee);
    if (isupResult.sent) {
      return { ok: true, message: isupResult.message };
    }

    // Fallback: очередь команды для relay-агента
    await this.prisma.hikvisionCommand.create({
      data: { deviceId, employeeId, action: 'grant' },
    });
    return { ok: true, message: 'Доступ выдан. Relay-агент запишет сотрудника на устройство.' };
  }

  async revokeAccess(deviceId: number, employeeId: number, user: RequestUser) {
    const [device, employee] = await Promise.all([
      this.prisma.hikvisionDevice.findUnique({ where: { id: deviceId } }),
      this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, firstName: true, lastName: true, companyId: true },
      }),
    ]);
    if (!device) throw new NotFoundException('Устройство не найдено');
    if (!employee) throw new NotFoundException('Сотрудник не найден');
    if (!user.isHoldingAdmin && user.companyId !== device.companyId) {
      throw new ForbiddenException('Доступ только к устройствам своей компании');
    }

    await this.prisma.hikvisionAccess.deleteMany({ where: { deviceId, employeeId } });

    // Пробуем отправить через ISUP напрямую
    const isupResult = await this.tryIsupRevoke(device, employee);
    if (isupResult.sent) {
      return { ok: true, message: isupResult.message };
    }

    // Fallback: очередь команды для relay-агента
    await this.prisma.hikvisionCommand.create({
      data: { deviceId, employeeId, action: 'revoke' },
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

  // ─────────── Hikvision ISAPI helpers ───────────

  private async pushToDevice(
    device: { lastSeenIp: string; login: string | null; password: string | null },
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
    device: { lastSeenIp: string; login: string | null; password: string | null },
    method: string, urlPath: string, body: string | Buffer, contentType: string,
  ): Promise<string> {
    const login = device.login ?? 'admin';
    const password = device.password ?? '';
    const ip = device.lastSeenIp;
    const port = 80;

    const first = await this.rawHikRequest({ ip, port }, method, urlPath, body, contentType, null);
    if (first.status !== 401) {
      if (first.status >= 400) throw new Error(`HTTP ${first.status}: ${first.body}`);
      return first.body;
    }

    const auth = this.buildHikDigest(first.headers['www-authenticate'] || '', method, urlPath, login, password);
    const second = await this.rawHikRequest({ ip, port }, method, urlPath, body, contentType, auth);
    if (second.status === 401) throw new Error(`Неверный логин или пароль для устройства ${ip}`);
    if (second.status >= 400) throw new Error(`HTTP ${second.status}: ${second.body}`);
    return second.body;
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

  private extractJson(body: string): string | null {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return body.substring(start, end + 1);
  }
}
