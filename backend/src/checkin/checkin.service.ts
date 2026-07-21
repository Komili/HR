import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { TelegramService } from '../telegram/telegram.service';

const WINDOW_MS = 5 * 60 * 1000;   // окно QR-токена — 5 минут
const COOLDOWN_MS = 5 * 60 * 1000; // минимум между событиями одного сотрудника

@Injectable()
export class CheckinService {
  constructor(
    private prisma: PrismaService,
    private attendanceService: AttendanceService,
    private telegramService: TelegramService,
  ) {}

  private timeWindow(): number {
    return Math.floor(Date.now() / WINDOW_MS);
  }

  private makeToken(officeId: number, window: number): string {
    const secret = process.env.JWT_SECRET ?? 'secret';
    return crypto
      .createHmac('sha256', secret)
      .update(`checkin:${officeId}:${window}`)
      .digest('hex')
      .slice(0, 16);
  }

  generateToken(officeId: number): string {
    return this.makeToken(officeId, this.timeWindow());
  }

  validateToken(officeId: number, token: string): boolean {
    const w = this.timeWindow();
    return [w, w - 1].some(
      (win) => this.makeToken(officeId, win) === token,
    );
  }

  // Для отображения QR в админке
  getQrInfo(officeId: number) {
    const token = this.generateToken(officeId);
    const w = this.timeWindow();
    const expiresIn = Math.ceil(((w + 1) * WINDOW_MS - Date.now()) / 1000); // секунды
    return { token, expiresIn };
  }

  // Публичный — проверить токен и вернуть список сотрудников
  async getEmployees(officeId: number, token: string) {
    if (!this.validateToken(officeId, token)) {
      throw new BadRequestException('QR-код устарел. Попросите обновить страницу на входе.');
    }
    const office = await this.prisma.office.findUnique({ where: { id: officeId } });
    if (!office) throw new NotFoundException('Офис не найден');

    const employees = await this.prisma.employee.findMany({
      where: { companyId: office.companyId, status: { not: 'Уволен' } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return {
      office: { id: office.id, name: office.name },
      employees,
    };
  }

  // Публичный — записать событие + сохранить селфи
  async recordEvent(
    officeId: number,
    token: string,
    employeeId: number,
    direction: 'IN' | 'OUT',
    selfieBase64?: string,
  ) {
    if (!this.validateToken(officeId, token)) {
      throw new BadRequestException('QR-код устарел. Отсканируйте заново.');
    }

    const [office, employee] = await Promise.all([
      this.prisma.office.findUnique({ where: { id: officeId } }),
      this.prisma.employee.findUnique({ where: { id: employeeId } }),
    ]);
    if (!office) throw new NotFoundException('Офис не найден');
    if (!employee) throw new NotFoundException('Сотрудник не найден');

    let selfiePath: string | null = null;
    if (selfieBase64) {
      const now0 = new Date();
      const dateStr = `${now0.getFullYear()}-${String(now0.getMonth()+1).padStart(2,'0')}-${String(now0.getDate()).padStart(2,'0')}`;
      const dir = path.join('storage', 'checkin-selfies', dateStr);
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${employeeId}_${Date.now()}.jpg`;
      const filePath = path.join(dir, filename);
      const base64Data = selfieBase64.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      selfiePath = filePath;
    }

    const now = new Date();
    await this.prisma.attendanceEvent.create({
      data: {
        employeeId,
        companyId: employee.companyId,
        officeId,
        timestamp: now,
        direction,
        deviceName: `QR: ${office.name}`,
        source: 'QR_CHECKIN',
        selfiePath,
      },
    });

    return {
      ok: true,
      direction,
      employeeName: `${employee.lastName} ${employee.firstName}`,
      timestamp: now.toISOString(), // форматируем на клиенте в его часовом поясе
    };
  }

  // Поиск сотрудника по номеру телефона (без создания события)
  async lookupByPhone(phone: string) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9) throw new BadRequestException('Неверный формат номера телефона');

    const phoneVariants = [
      `+${digits}`,
      digits,
      digits.length >= 12 ? `+${digits.slice(-9)}` : null,
      digits.slice(-9),
      `+992${digits.slice(-9)}`,
    ].filter(Boolean) as string[];

    const employee = await this.prisma.employee.findFirst({
      where: { phone: { in: phoneVariants }, status: { not: 'Уволен' } },
      include: {
        company: { select: { name: true, shortName: true } },
        position: { select: { name: true } },
      },
    });

    if (!employee) throw new NotFoundException('Сотрудник с таким номером не найден');

    return {
      firstName: employee.firstName,
      lastName: employee.lastName,
      position: (employee.position as any)?.name || '',
      companyName: (employee.company as any)?.shortName || (employee.company as any)?.name || '',
    };
  }

  // Публичный чекин по номеру телефона
  async phoneCheckin(phone: string, photoFile?: Express.Multer.File, note?: string) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9) throw new BadRequestException('Неверный формат номера телефона');

    const phoneVariants = [
      `+${digits}`,
      digits,
      digits.length >= 12 ? `+${digits.slice(-9)}` : null,
      digits.slice(-9),
      `+992${digits.slice(-9)}`,
    ].filter(Boolean) as string[];

    const employee = await this.prisma.employee.findFirst({
      where: {
        phone: { in: phoneVariants },
        status: { not: 'Уволен' },
      },
      include: {
        company: { select: { name: true, shortName: true } },
        position: { select: { name: true } },
      },
    });

    if (!employee) throw new NotFoundException('Сотрудник с таким номером не найден');

    // Cooldown: не чаще раза в 5 минут
    const cooldownSince = new Date(Date.now() - COOLDOWN_MS);
    const recentEvent = await this.prisma.attendanceEvent.findFirst({
      where: {
        employeeId: employee.id,
        timestamp: { gte: cooldownSince },
        source: 'QR_CHECKIN',
      },
      orderBy: { timestamp: 'desc' },
    });
    if (recentEvent) {
      const readyAt = new Date(recentEvent.timestamp.getTime() + COOLDOWN_MS);
      const minLeft = Math.ceil((readyAt.getTime() - Date.now()) / 60000);
      throw new HttpException(
        `Вы уже отметились. Следующая отметка доступна через ${minLeft} мин.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const now = new Date();
    // Today in Dushanbe timezone (UTC+5)
    const tzOffset = 5 * 60 * 60 * 1000;
    const localNow = new Date(now.getTime() + tzOffset);
    const todayStart = this.attendanceService.getDayStart(now);

    // First event of the day (по любому источнику/устройству/компании) → IN, любое последующее → OUT
    const direction = await this.attendanceService.resolveAutoDirection(employee.id, now);

    // Save selfie photo
    let selfiePath: string | null = null;
    if (photoFile) {
      const dateStr = localNow.toISOString().slice(0, 10);
      const dir = path.join('storage', 'checkin-selfies', dateStr);
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${employee.id}_${Date.now()}.jpg`;
      const targetPath = path.join(dir, filename);
      try {
        fs.renameSync(photoFile.path, targetPath);
        selfiePath = targetPath;
      } catch {
        try { fs.unlinkSync(photoFile.path); } catch {}
      }
    }

    // Find first IN today for worked hours calculation
    let firstInToday: Date | null = null;
    if (direction === 'OUT') {
      const firstIn = await this.prisma.attendanceEvent.findFirst({
        where: {
          employeeId: employee.id,
          direction: 'IN',
          timestamp: { gte: todayStart },
        },
        orderBy: { timestamp: 'asc' },
      });
      firstInToday = firstIn?.timestamp || null;
    }

    // Create event
    await this.prisma.attendanceEvent.create({
      data: {
        employeeId: employee.id,
        companyId: employee.companyId,
        timestamp: now,
        direction,
        deviceName: 'Мобильный чекин',
        source: 'QR_CHECKIN',
        selfiePath,
        note: note || null,
      },
    });

    // Recalculate attendance day
    await this.attendanceService.recalculateDay(employee.id, now);

    // Calculate worked minutes
    let workedMinutes: number | null = null;
    if (direction === 'OUT' && firstInToday) {
      workedMinutes = Math.floor((now.getTime() - firstInToday.getTime()) / 60000);
    }

    const timeStr = now.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Dushanbe',
    });

    const fullName = `${employee.lastName} ${employee.firstName}`;
    const isIn = direction === 'IN';
    const positionName = (employee.position as any)?.name || '';
    const companyName = (employee.company as any)?.shortName || (employee.company as any)?.name || '';

    // Telegram notification
    const workedLine = !isIn && workedMinutes
      ? `⏱ Отработано: ${Math.floor(workedMinutes / 60)} ч ${workedMinutes % 60} мин`
      : null;
    const caption = [
      `${isIn ? '🟢' : '🔴'} <b>${isIn ? 'Вход' : 'Выход'}</b> · 📱 Мобильный чекин`,
      ``,
      `👤 <b>${fullName}</b>`,
      positionName ? `   ${positionName}` : null,
      ``,
      `🏢 ${companyName}`,
      `⏰ ${timeStr}`,
      note ? `📍 ${note}` : null,
      workedLine,
    ].filter(s => s !== null).join('\n');

    // Send selfie if available, else stored photo
    const checkinCompanyId = (employee as any).companyId as number | undefined;
    if (selfiePath && fs.existsSync(selfiePath)) {
      try {
        const photo = fs.readFileSync(selfiePath);
        await this.telegramService.sendAttendancePhoto(photo, caption, checkinCompanyId);
      } catch {
        await this.telegramService.sendAttendance(caption, checkinCompanyId);
      }
    } else if (employee.photoPath) {
      try {
        const normPath = (employee.photoPath as string).replace(/photo\.jpg$/, 'photo_norm.jpg');
        const absPath = path.resolve(fs.existsSync(normPath) ? normPath : employee.photoPath as string);
        if (fs.existsSync(absPath)) {
          await this.telegramService.sendAttendancePhoto(fs.readFileSync(absPath), caption, checkinCompanyId);
        } else {
          await this.telegramService.sendAttendance(caption, checkinCompanyId);
        }
      } catch {
        await this.telegramService.sendAttendance(caption, checkinCompanyId);
      }
    } else {
      await this.telegramService.sendAttendance(caption, checkinCompanyId);
    }

    return {
      type: direction === 'IN' ? 'in' : 'out',
      employeeName: fullName,
      firstName: employee.firstName,
      time: timeStr,
      workedMinutes,
      companyName,
      position: positionName,
      note: note || null,
    };
  }
}
