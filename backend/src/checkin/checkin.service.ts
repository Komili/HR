import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

const WINDOW_MS = 5 * 60 * 1000; // 5 минут

@Injectable()
export class CheckinService {
  constructor(private prisma: PrismaService) {}

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
}
