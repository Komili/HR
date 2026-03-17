import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import sharp = require('sharp');
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { RequestUser } from '../auth/jwt.strategy';
import { CreateDoorDto, UpdateDoorDto } from './dto/door.dto';

@Injectable()
export class DoorsService {
  private readonly logger = new Logger(DoorsService.name);

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  // ─────────── access guards ───────────

  private guardSuperAdmin(user: RequestUser) {
    if (!user.isHoldingAdmin) throw new ForbiddenException('Только суперадмин');
  }

  private guardCompany(user: RequestUser, companyId: number) {
    if (!user.isHoldingAdmin && user.companyId !== companyId) {
      throw new ForbiddenException('Доступ только к дверям своей компании');
    }
  }

  // ─────────── CRUD doors ───────────

  async findAll(user: RequestUser, companyId?: number) {
    const where: any = {};
    if (user.isHoldingAdmin) {
      if (companyId) where.companyId = companyId;
    } else {
      where.companyId = user.companyId;
    }
    return this.prisma.door.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, shortName: true } },
        _count: { select: { accesses: true } },
      },
      orderBy: [{ companyId: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateDoorDto, user: RequestUser) {
    this.guardSuperAdmin(user);
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
      select: { name: true, shortName: true },
    });
    const door = await this.prisma.door.create({
      data: {
        name: dto.name,
        companyId: dto.companyId,
        inDeviceIp: dto.inDeviceIp,
        inDevicePort: dto.inDevicePort ?? 80,
        outDeviceIp: dto.outDeviceIp,
        outDevicePort: dto.outDevicePort ?? 80,
        login: dto.login ?? 'admin',
        password: dto.password,
        isActive: dto.isActive ?? true,
      },
    });
    const companyName = company?.shortName || company?.name || `ID ${dto.companyId}`;
    this.telegram.sendMessage(
      `🚪 *Новая дверь добавлена*\n` +
      `📍 Дверь: *${door.name}*\n` +
      `🏢 Компания: ${companyName}\n` +
      `📡 IN: ${door.inDeviceIp}:${door.inDevicePort}\n` +
      `📡 OUT: ${door.outDeviceIp}:${door.outDevicePort}\n` +
      `👤 Добавил: ${user.email}`,
    ).catch(() => {});
    return door;
  }

  async update(id: number, dto: UpdateDoorDto, user: RequestUser) {
    this.guardSuperAdmin(user);
    const door = await this.prisma.door.findUnique({ where: { id } });
    if (!door) throw new NotFoundException('Дверь не найдена');
    const updated = await this.prisma.door.update({ where: { id }, data: dto });
    if (dto.isActive !== undefined) {
      const status = dto.isActive ? '✅ Включена' : '🔴 Отключена';
      this.telegram.sendMessage(
        `⚙️ *Дверь изменена*\n` +
        `📍 Дверь: *${door.name}*\n` +
        `${status}\n` +
        `👤 Изменил: ${user.email}`,
      ).catch(() => {});
    }
    return updated;
  }

  async remove(id: number, user: RequestUser) {
    this.guardSuperAdmin(user);
    const door = await this.prisma.door.findUnique({ where: { id } });
    if (!door) throw new NotFoundException('Дверь не найдена');
    await this.prisma.door.delete({ where: { id } });
    this.telegram.sendMessage(
      `🗑 *Дверь удалена*\n` +
      `📍 Дверь: *${door.name}*\n` +
      `👤 Удалил: ${user.email}`,
    ).catch(() => {});
    return { ok: true };
  }

  // ─────────── employee door access ───────────

  async getEmployeeDoors(employeeId: number, user: RequestUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Сотрудник не найден');
    this.guardCompany(user, employee.companyId);

    // Все двери компании (суперадмин видит все)
    const doorsWhere: any = user.isHoldingAdmin ? {} : { companyId: employee.companyId };
    const allDoors = await this.prisma.door.findMany({
      where: doorsWhere,
      include: { company: { select: { id: true, name: true, shortName: true } } },
      orderBy: [{ companyId: 'asc' }, { name: 'asc' }],
    });

    const accesses = await this.prisma.doorAccess.findMany({
      where: { employeeId },
      select: { doorId: true, grantedBy: true, createdAt: true },
    });

    const accessMap = new Map(accesses.map((a) => [a.doorId, a]));

    return allDoors.map((door) => ({
      ...door,
      password: undefined, // не отдаём пароль
      hasAccess: accessMap.has(door.id),
      grantedBy: accessMap.get(door.id)?.grantedBy || null,
      grantedAt: accessMap.get(door.id)?.createdAt || null,
    }));
  }

  async grantAccess(doorId: number, employeeId: number, user: RequestUser) {
    const [door, employee] = await Promise.all([
      this.prisma.door.findUnique({ where: { id: doorId } }),
      this.prisma.employee.findUnique({ where: { id: employeeId } }),
    ]);
    if (!door) throw new NotFoundException('Дверь не найдена');
    if (!employee) throw new NotFoundException('Сотрудник не найден');

    if (!user.isHoldingAdmin && user.companyId !== door.companyId) {
      throw new ForbiddenException('Доступ только к дверям своей компании');
    }

    const existing = await this.prisma.doorAccess.findUnique({
      where: { doorId_employeeId: { doorId, employeeId } },
    });
    if (existing) throw new BadRequestException('Доступ уже выдан');

    // Создаём запись доступа + команду для relay-агента
    const [access] = await Promise.all([
      this.prisma.doorAccess.create({
        data: { doorId, employeeId, grantedBy: user.email },
      }),
      this.prisma.doorCommand.create({
        data: { doorId, employeeId, action: 'grant', status: 'pending' },
      }),
    ]);

    const empName = `${employee.lastName} ${employee.firstName}`;
    this.telegram.sendMessage(
      `🟢 *Доступ к двери ВЫДАН*\n` +
      `👤 Сотрудник: *${empName}*\n` +
      `🚪 Дверь: *${door.name}*\n` +
      `⏳ Статус: ожидает выполнения агентом\n` +
      `👮 Выдал: ${user.email}`,
    ).catch(() => {});

    this.logger.log(`✅ Доступ выдан: сотрудник ${employeeId} → дверь ${door.name}. Команда поставлена в очередь для агента.`);
    return access;
  }

  async revokeAccess(doorId: number, employeeId: number, user: RequestUser) {
    const [door, employee] = await Promise.all([
      this.prisma.door.findUnique({ where: { id: doorId } }),
      this.prisma.employee.findUnique({ where: { id: employeeId } }),
    ]);
    if (!door) throw new NotFoundException('Дверь не найдена');
    if (!employee) throw new NotFoundException('Сотрудник не найден');

    if (!user.isHoldingAdmin && user.companyId !== door.companyId) {
      throw new ForbiddenException('Доступ только к дверям своей компании');
    }

    // Создаём команду для агента + удаляем доступ из БД
    await Promise.all([
      this.prisma.doorAccess.deleteMany({ where: { doorId, employeeId } }),
      this.prisma.doorCommand.create({
        data: { doorId, employeeId, action: 'revoke', status: 'pending' },
      }),
    ]);

    const empName = `${employee.lastName} ${employee.firstName}`;
    this.telegram.sendMessage(
      `🔴 *Доступ к двери ОТОЗВАН*\n` +
      `👤 Сотрудник: *${empName}*\n` +
      `🚪 Дверь: *${door.name}*\n` +
      `⏳ Статус: ожидает выполнения агентом\n` +
      `👮 Отозвал: ${user.email}`,
    ).catch(() => {});

    this.logger.log(`🚫 Доступ отозван: сотрудник ${employeeId} → дверь ${door.name}. Команда поставлена в очередь для агента.`);
    return { ok: true };
  }

  // ─────────── Direct sync (без relay-агента) ───────────

  async directSync(doorId: number, employeeId: number, action: 'grant' | 'revoke', user: RequestUser) {
    const [door, employee] = await Promise.all([
      this.prisma.door.findUnique({ where: { id: doorId } }),
      this.prisma.employee.findUnique({ where: { id: employeeId } }),
    ]);
    if (!door) throw new NotFoundException('Дверь не найдена');
    if (!employee) throw new NotFoundException('Сотрудник не найден');

    if (!user.isHoldingAdmin && user.companyId !== door.companyId) {
      throw new ForbiddenException('Доступ только к дверям своей компании');
    }

    const { faceWarning } = await this.pushEmployeeToDevice(door, employee, action);

    const empName = `${employee.lastName} ${employee.firstName}`;
    const actionText = action === 'grant'
      ? (faceWarning ? '⚠️ Добавлен без фото на устройство' : '✅ Лицо добавлено на устройство')
      : '✅ Удалён с устройства';
    this.telegram.sendMessage(
      `${actionText}\n` +
      `👤 Сотрудник: *${empName}*\n` +
      `🚪 Дверь: *${door.name}*\n` +
      (faceWarning ? `⚠️ ${faceWarning}\n` : '') +
      `👮 Выполнил: ${user.email}`,
    ).catch(() => {});

    if (faceWarning) {
      return { ok: true, message: faceWarning };
    }
    return { ok: true, message: action === 'grant' ? 'Сотрудник и фото загружены на устройство' : 'Сотрудник удалён с устройства' };
  }

  async syncAll(doorId: number, user: RequestUser) {
    const door = await this.prisma.door.findUnique({ where: { id: doorId } });
    if (!door) throw new NotFoundException('Дверь не найдена');

    if (!user.isHoldingAdmin && user.companyId !== door.companyId) {
      throw new ForbiddenException('Доступ только к дверям своей компании');
    }

    const employees = await this.prisma.employee.findMany({
      where: { companyId: door.companyId, status: { not: 'Уволен' } },
      select: { id: true, firstName: true, lastName: true, photoPath: true },
    });

    const results = { success: 0, noPhoto: 0, faceError: 0, failed: 0, errors: [] as string[] };

    for (const employee of employees) {
      try {
        const { faceWarning } = await this.pushEmployeeToDevice(door, employee, 'grant');
        if (faceWarning) {
          results.faceError++;
          results.errors.push(`${employee.lastName} ${employee.firstName}: фото не принято устройством`);
        } else if (!employee.photoPath) {
          results.noPhoto++;
        } else {
          results.success++;
        }
      } catch (err) {
        results.failed++;
        results.errors.push(`${employee.lastName} ${employee.firstName}: ${err.message}`);
        this.logger.error(`syncAll error [${employee.id}]: ${err.message}`);
      }
    }

    const summary =
      `📋 Массовая синхронизация с устройством\n` +
      `🚪 Дверь: *${door.name}*\n` +
      `✅ Успешно: ${results.success}\n` +
      `📷 Ошибка фото: ${results.faceError}\n` +
      `🚫 Без фото: ${results.noPhoto}\n` +
      `❌ Ошибок: ${results.failed}\n` +
      `👮 Запустил: ${user.email}`;
    this.telegram.sendMessage(summary).catch(() => {});

    return { total: employees.length, ...results };
  }

  // ─────────── Check employee on device ───────────

  async checkEmployeeOnDevice(doorId: number, employeeId: number, user: RequestUser) {
    const [door, employee] = await Promise.all([
      this.prisma.door.findUnique({ where: { id: doorId } }),
      this.prisma.employee.findUnique({ where: { id: employeeId } }),
    ]);
    if (!door) throw new NotFoundException('Дверь не найдена');
    if (!employee) throw new NotFoundException('Сотрудник не найден');

    if (!user.isHoldingAdmin && user.companyId !== door.companyId) {
      throw new ForbiddenException('Доступ только к дверям своей компании');
    }

    const employeeNo = String(employee.id);
    const searchBody = JSON.stringify({
      UserInfoSearchCond: {
        searchID: '1',
        searchResultPosition: 0,
        maxResults: 1,
        EmployeeNoList: [{ employeeNo }],
      },
    });

    const devices = [
      { ip: door.inDeviceIp, port: door.inDevicePort },
      { ip: door.outDeviceIp, port: door.outDevicePort },
    ];

    // Убираем дубли если IP одинаковый
    const uniqueDevices = devices.filter(
      (d, i, arr) => arr.findIndex(x => x.ip === d.ip && x.port === d.port) === i,
    );

    const deviceResults = await Promise.all(
      uniqueDevices.map(async (device) => {
        let userFound = false;
        let faceFound = false;
        let userName: string | null = null;
        let error: string | undefined;

        try {
          const responseBody = await this.hikvisionRequest(
            device, door, 'POST',
            '/ISAPI/AccessControl/UserInfo/Search?format=json',
            searchBody, 'application/json',
          );
          const data = JSON.parse(responseBody);
          const search = data?.UserInfoSearch;
          userFound = (search?.numOfMatches ?? 0) > 0;
          if (userFound && Array.isArray(search?.UserInfo)) {
            userName = search.UserInfo[0]?.name ?? null;
          }

          // Проверяем наличие фото
          if (userFound) {
            try {
              const faceBody = JSON.stringify({
                searchResultPosition: 0,
                maxResults: 1,
                faceLibType: 'blackFD',
                FDID: '1',
                FPID: employeeNo,
              });
              const faceResp = await this.hikvisionRequest(
                device, door, 'POST',
                '/ISAPI/Intelligent/FDLib/FDSearch?format=json&FDID=1',
                faceBody, 'application/json',
              );
              const faceData = JSON.parse(faceResp);
              const numFaces =
                faceData?.numOfMatches ??
                faceData?.FaceDataInfo?.numOfMatches ??
                (Array.isArray(faceData?.FaceInfo) ? faceData.FaceInfo.length : 0);
              faceFound = numFaces > 0;
            } catch {
              // не критично — face check failure
            }
          }
        } catch (err) {
          error = err.message;
        }

        return { ip: device.ip, port: device.port, userFound, faceFound, userName, error };
      }),
    );

    return { employeeNo, doorName: door.name, deviceResults };
  }

  // ─────────── Hikvision ISAPI ───────────

  private async pushEmployeeToDevice(
    door: any,
    employee: any,
    action: 'grant' | 'revoke',
  ): Promise<{ faceWarning?: string }> {
    const devices = [
      { ip: door.inDeviceIp, port: door.inDevicePort },
      { ip: door.outDeviceIp, port: door.outDevicePort },
    ];

    let faceWarning: string | undefined;

    for (const device of devices) {
      if (action === 'grant') {
        // Сначала создаём пользователя — это критично
        try {
          await this.hikvisionCreateUser(device, door, employee);
        } catch (err) {
          this.logger.error(`Hikvision createUser error [${device.ip}:${device.port}]: ${err.message}`);
          throw new BadRequestException(
            `Ошибка связи с устройством ${device.ip}:${device.port} — ${err.message}`,
          );
        }
        // Загрузка лица — не критично, ошибку только логируем
        try {
          await this.hikvisionUploadFace(device, door, employee);
        } catch (err) {
          this.logger.warn(`Hikvision uploadFace warning [${device.ip}:${device.port}]: ${err.message}`);
          faceWarning = `Пользователь добавлен на устройство, но фото не загружено — ${err.message.includes('SubpicAnalysisModelingError') || err.message.includes('saveFacePic') ? 'устройство не распознало лицо на фото (проверьте качество фото сотрудника)' : err.message}`;
        }
      } else {
        try {
          await this.hikvisionDeleteUser(device, door, employee);
        } catch (err) {
          this.logger.error(`Hikvision deleteUser error [${device.ip}:${device.port}]: ${err.message}`);
          throw new BadRequestException(
            `Ошибка связи с устройством ${device.ip}:${device.port} — ${err.message}`,
          );
        }
      }
    }

    return { faceWarning };
  }

  private async hikvisionCreateUser(
    device: { ip: string; port: number },
    door: any,
    employee: any,
  ) {
    const employeeNo = String(employee.id);
    const fullName = `${employee.lastName} ${employee.firstName}`.substring(0, 32);

    const body = JSON.stringify({
      UserInfo: {
        employeeNo,
        name: fullName,
        userType: 'normal',
        Valid: {
          enable: true,
          beginTime: '2020-01-01T00:00:00',
          endTime: '2037-12-31T23:59:59',
        },
        doorRight: '1',
        RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
      },
    });

    try {
      await this.hikvisionRequest(
        device, door, 'POST',
        '/ISAPI/AccessControl/UserInfo/Record?format=json',
        body, 'application/json',
      );
    } catch (err) {
      // Пользователь уже существует — удаляем и создаём заново
      if (err.message?.includes('employeeNoAlreadyExist')) {
        await this.hikvisionDeleteUser(device, door, employee);
        await this.hikvisionRequest(
          device, door, 'POST',
          '/ISAPI/AccessControl/UserInfo/Record?format=json',
          body, 'application/json',
        );
      } else {
        throw err;
      }
    }
  }

  private async hikvisionDeleteUser(
    device: { ip: string; port: number },
    door: any,
    employee: any,
  ) {
    const body = JSON.stringify({
      UserInfoDelCond: {
        EmployeeNoList: [{ employeeNo: String(employee.id) }],
      },
    });

    await this.hikvisionRequest(
      device, door, 'PUT',
      '/ISAPI/AccessControl/UserInfo/Delete?format=json',
      body, 'application/json',
    );
  }

  private async hikvisionUploadFace(
    device: { ip: string; port: number },
    door: any,
    employee: any,
  ) {
    if (!employee.photoPath) {
      this.logger.warn(`Сотрудник ${employee.id} без фото — face не загружен`);
      return;
    }

    const photoAbsPath = path.resolve(employee.photoPath);
    if (!fs.existsSync(photoAbsPath)) {
      this.logger.warn(`Фото не найдено: ${photoAbsPath}`);
      return;
    }

    // Сжимаем фото: Hikvision принимает max ~200KB, JPEG, до 1080px
    const imageBuffer = await sharp(photoAbsPath)
      .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    this.logger.log(`Фото сжато: ${imageBuffer.length} байт для сотрудника ${employee.id}`);
    const boundary = `----FormBoundary${crypto.randomBytes(8).toString('hex')}`;

    const employeeNo = String(employee.id);
    const jsonPart = JSON.stringify({
      faceLibType: 'blackFD',
      FDID: '1',
      FPID: employeeNo,
    });

    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="FaceDataRecord"\r\nContent-Type: application/json\r\n\r\n${jsonPart}\r\n--${boundary}\r\nContent-Disposition: form-data; name="img"; filename="face.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      imageBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    await this.hikvisionRequest(
      device, door, 'POST',
      '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json',
      body, `multipart/form-data; boundary=${boundary}`,
    );
  }

  // ─────────── Digest auth HTTP helper ───────────

  private async hikvisionRequest(
    device: { ip: string; port: number },
    door: { login: string; password: string },
    method: string,
    urlPath: string,
    body: string | Buffer,
    contentType: string,
  ): Promise<string> {
    // Первый запрос — получаем WWW-Authenticate
    const firstRes = await this.rawRequest(device, method, urlPath, body, contentType, null);

    if (firstRes.status !== 401) {
      if (firstRes.status >= 400) {
        throw new Error(`HTTP ${firstRes.status}: ${firstRes.body}`);
      }
      return firstRes.body;
    }

    // Парсим Digest challenge
    const authHeader = firstRes.headers['www-authenticate'] || '';
    const digestAuth = this.buildDigestAuth(
      authHeader, method, urlPath, door.login, door.password,
    );

    // Второй запрос с авторизацией
    const secondRes = await this.rawRequest(device, method, urlPath, body, contentType, digestAuth);
    if (secondRes.status === 401) {
      throw new Error(`Неверный логин или пароль для устройства ${device.ip} (проверьте настройки двери)`);
    }
    if (secondRes.status >= 400) {
      throw new Error(`HTTP ${secondRes.status}: ${secondRes.body}`);
    }
    return secondRes.body;
  }

  private buildDigestAuth(
    wwwAuth: string,
    method: string,
    uri: string,
    username: string,
    password: string,
  ): string {
    const realm = this.extractParam(wwwAuth, 'realm');
    const nonce = this.extractParam(wwwAuth, 'nonce');
    const qop = this.extractParam(wwwAuth, 'qop');

    const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');

    let response: string;
    let authStr: string;

    if (qop === 'auth') {
      const nc = '00000001';
      const cnonce = crypto.randomBytes(8).toString('hex');
      response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`).digest('hex');
      authStr = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=auth, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
    } else {
      response = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
      authStr = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
    }

    return authStr;
  }

  private extractParam(header: string, param: string): string {
    const match = header.match(new RegExp(`${param}="([^"]+)"`));
    return match ? match[1] : '';
  }

  private rawRequest(
    device: { ip: string; port: number },
    method: string,
    urlPath: string,
    body: string | Buffer,
    contentType: string,
    authorization: string | null,
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    return new Promise((resolve, reject) => {
      const bodyBuffer = typeof body === 'string' ? Buffer.from(body) : body;
      const options: http.RequestOptions = {
        hostname: device.ip,
        port: device.port,
        path: urlPath,
        method,
        headers: {
          'Content-Type': contentType,
          'Content-Length': bodyBuffer.length,
          ...(authorization ? { Authorization: authorization } : {}),
        },
        timeout: 30_000,
      };

      // Используем http (большинство Hikvision на http)
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string>,
            body: data,
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(bodyBuffer);
      req.end();
    });
  }
}
