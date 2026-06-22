import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeesService } from '../employees/employees.service';
import { TelegramService } from '../telegram/telegram.service';
import { SelfRegisterDto } from './dto/self-register.dto';
import { getCompanyFilter as sharedGetCompanyFilter, isAuthorizedForCompany, getAllowedCompanyIds } from '../common/company-filter';
import { RequestUser } from '../auth/jwt.strategy';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp = require('sharp');

@Injectable()
export class RegistrationService {
  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  async validateToken(token: string) {
    const regToken = await this.prisma.registrationToken.findUnique({
      where: { token },
      include: { company: { select: { id: true, name: true, shortName: true } } },
    });

    if (!regToken || !regToken.isActive) {
      throw new NotFoundException('Токен недействителен или отозван');
    }

    return {
      valid: true,
      companyId: regToken.company.id,
      companyName: regToken.company.shortName || regToken.company.name,
    };
  }

  async submitRegistration(dto: SelfRegisterDto, photo?: Express.Multer.File) {
    // Проверяем токен
    const regToken = await this.prisma.registrationToken.findUnique({
      where: { token: dto.token },
      include: { company: true },
    });

    if (!regToken || !regToken.isActive) {
      throw new BadRequestException('Токен недействителен или отозван');
    }

    // Создаём сотрудника со статусом "Ожидает"
    const employee = await this.prisma.employee.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        patronymic: dto.patronymic || null,
        phone: dto.phone || null,
        email: dto.email || null,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        status: 'Ожидает',
        company: { connect: { id: regToken.companyId } },
      },
      include: { company: true, department: true, position: true },
    });

    // Обрабатываем фото если есть
    if (photo) {
      await this.processAndSavePhoto(employee, photo, regToken.company.name);
    }

    // Увеличиваем счётчик использования токена
    await this.prisma.registrationToken.update({
      where: { id: regToken.id },
      data: { usageCount: { increment: 1 } },
    });

    // Telegram уведомление кадровику
    const companyName = regToken.company.shortName || regToken.company.name;
    this.telegram.notify(
      'registration',
      `📋 <b>Новая заявка на регистрацию</b>\n\n` +
      `👤 ${dto.lastName} ${dto.firstName}${dto.patronymic ? ' ' + dto.patronymic : ''}\n` +
      `🏢 Компания: ${companyName}\n` +
      `📞 Телефон: ${dto.phone || '—'}\n` +
      `📧 Email: ${dto.email || '—'}\n` +
      `🎂 Дата рождения: ${dto.birthDate ? new Date(dto.birthDate).toLocaleDateString('ru-RU') : '—'}\n\n` +
      `👉 Войдите в систему → Регистрации → Заявки`,
      { companyId: regToken.companyId },
    ).catch(() => {});

    return { success: true, message: 'Заявка успешно отправлена' };
  }

  private async processAndSavePhoto(
    employee: { id: number; firstName: string; lastName: string },
    photo: Express.Multer.File,
    companyName: string,
  ) {
    const companyFolder = EmployeesService.sanitizeCompany(companyName);
    const employeeDir = EmployeesService.employeeDirName(employee);
    const targetDir = path.join('storage', 'companies', companyFolder, 'employees', employeeDir);
    await fs.mkdir(targetDir, { recursive: true });

    const targetPath = path.join(targetDir, 'photo.jpg');

    // Обрабатываем через sharp: resize, EXIF rotation, JPEG quality
    const metadata = await sharp(photo.path).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    // Минимальный размер для FaceID: 300x400
    if (width < 200 || height < 200) {
      // Слишком маленькое фото, но всё равно сохраняем
    }

    await sharp(photo.path)
      .rotate() // Авто-поворот по EXIF
      .resize(800, 1000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(targetPath);

    // Удаляем временный файл
    try { await fs.unlink(photo.path); } catch {}

    // Обновляем путь к фото
    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { photoPath: targetPath },
    });
  }


  // ===== Админские методы для токенов =====

  async createToken(companyId: number, user: RequestUser) {
    const token = crypto.randomBytes(16).toString('hex');

    return this.prisma.registrationToken.create({
      data: {
        token,
        companyId,
        createdBy: user.email,
      },
      include: { company: { select: { id: true, name: true, shortName: true } } },
    });
  }

  async getTokens(user: RequestUser, requestedCompanyId?: number) {
    const where: any = {};

    if (user.isHoldingAdmin) {
      if (requestedCompanyId) where.companyId = requestedCompanyId;
    } else {
      const allowed = getAllowedCompanyIds(user);
      if (allowed.length === 0) return [];
      where.companyId = allowed.length === 1 ? allowed[0] : { in: allowed };
    }

    return this.prisma.registrationToken.findMany({
      where,
      include: { company: { select: { id: true, name: true, shortName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeToken(id: number, user: RequestUser) {
    const token = await this.prisma.registrationToken.findUnique({
      where: { id },
    });

    if (!token) throw new NotFoundException('Токен не найден');

    if (!isAuthorizedForCompany(user, token.companyId)) {
      throw new BadRequestException('Нет доступа к этому токену');
    }

    await this.prisma.registrationToken.delete({ where: { id } });
  }
}
