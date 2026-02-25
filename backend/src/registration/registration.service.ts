import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SelfRegisterDto } from './dto/self-register.dto';
import { transliterate } from './utils/transliterate';
import { RequestUser } from '../auth/jwt.strategy';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp = require('sharp');

@Injectable()
export class RegistrationService {
  constructor(private prisma: PrismaService) {}

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

    const latinFirstName = transliterate(dto.firstName);
    const latinLastName = transliterate(dto.lastName);

    // Создаём сотрудника со статусом "Ожидает"
    const employee = await this.prisma.employee.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        patronymic: dto.patronymic || null,
        latinFirstName,
        latinLastName,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        phone: dto.phone || null,
        email: dto.email || null,
        address: dto.address || null,
        passportSerial: dto.passportSerial || null,
        passportNumber: dto.passportNumber || null,
        passportIssuedBy: dto.passportIssuedBy || null,
        passportIssueDate: dto.passportIssueDate ? new Date(dto.passportIssueDate) : null,
        inn: dto.inn || null,
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

    return { success: true, message: 'Заявка успешно отправлена' };
  }

  private async processAndSavePhoto(
    employee: { id: number; latinFirstName: string; latinLastName: string },
    photo: Express.Multer.File,
    companyName: string,
  ) {
    const companyFolder = companyName.replace(/[^a-zA-Z0-9а-яА-ЯёЁғӣҷӯҳқ_-]/g, '_');
    const employeeDir = `${this.sanitize(employee.latinFirstName)}_${this.sanitize(employee.latinLastName)}_${employee.id}`;
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

  private sanitize(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\s+/g, '_');
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
      if (!user.companyId) return [];
      where.companyId = user.companyId;
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

    // Проверка доступа
    if (!user.isHoldingAdmin && token.companyId !== user.companyId) {
      throw new BadRequestException('Нет доступа к этому токену');
    }

    return this.prisma.registrationToken.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
