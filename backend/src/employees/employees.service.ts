import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import * as path from 'path';
import { RequestUser } from '../auth/jwt.strategy';

type EmployeeWithRelations = Prisma.EmployeeGetPayload<{
  include: { department: true; position: true; company: true };
}>;

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  private getCompanyFilter(user: RequestUser, requestedCompanyId?: number): number | undefined {
    // Суперадмин холдинга может выбрать любую компанию или видеть все
    if (user.isHoldingAdmin) {
      return requestedCompanyId || undefined;
    }
    // Обычный пользователь видит только свою компанию
    if (!user.companyId) {
      throw new ForbiddenException('User is not assigned to any company');
    }
    return user.companyId;
  }

  async create(data: Prisma.EmployeeCreateInput, user: RequestUser): Promise<EmployeeWithRelations> {
    // Проверяем, что пользователь имеет право создавать сотрудников
    const companyId = this.getCompanyFilter(user);

    if (!companyId && !user.isHoldingAdmin) {
      throw new ForbiddenException('Cannot create employee without company context');
    }

    const employee = await this.prisma.employee.create({
      data,
      include: {
        department: true,
        position: true,
        company: true,
      },
    });

    // Создаём папку для документов сотрудника
    await this.createEmployeeFolder(employee);

    return employee;
  }

  private async createEmployeeFolder(employee: EmployeeWithRelations): Promise<string> {
    const sanitizedFirstName = this.sanitize(employee.latinFirstName || 'unknown');
    const sanitizedLastName = this.sanitize(employee.latinLastName || 'unknown');
    const companyFolder = this.sanitize(employee.company?.name || 'unknown');
    const employeeDir = `${sanitizedFirstName}_${sanitizedLastName}_${employee.id}`;
    const targetDir = path.join('storage', 'companies', companyFolder, 'employees', employeeDir, 'docs');

    await fs.mkdir(targetDir, { recursive: true });

    return targetDir;
  }

  private sanitize(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\s+/g, '_');
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    user?: RequestUser,
    requestedCompanyId?: number,
  ): Promise<{ data: EmployeeWithRelations[]; total: number }> {
    const where: Prisma.EmployeeWhereInput = {};

    // Фильтрация по компании
    if (user) {
      const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
      if (companyFilter) {
        where.companyId = companyFilter;
      }
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { patronymic: { contains: search } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          department: true,
          position: true,
          company: true,
        },
        orderBy: { id: 'desc' },
      }),
      this.prisma.employee.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: number, user?: RequestUser): Promise<EmployeeWithRelations | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        position: true,
        company: true,
      },
    });

    // Проверяем доступ к сотруднику
    if (employee && user && !user.isHoldingAdmin) {
      if (employee.companyId !== user.companyId) {
        throw new ForbiddenException('Access denied to this employee');
      }
    }

    return employee;
  }

  async update(id: number, data: Prisma.EmployeeUpdateInput, user?: RequestUser): Promise<EmployeeWithRelations> {
    // Проверяем, что пользователь имеет доступ к этому сотруднику
    if (user) {
      await this.findOne(id, user); // Это выбросит ошибку если нет доступа
    }

    return this.prisma.employee.update({
      where: { id },
      data,
      include: {
        department: true,
        position: true,
        company: true,
      },
    });
  }

  async remove(id: number, user?: RequestUser): Promise<EmployeeWithRelations> {
    // Проверяем, что пользователь имеет доступ к этому сотруднику
    if (user) {
      await this.findOne(id, user); // Это выбросит ошибку если нет доступа
    }

    return this.prisma.employee.delete({
      where: { id },
      include: {
        department: true,
        position: true,
        company: true,
      },
    });
  }

  async uploadPhoto(id: number, file: Express.Multer.File, user: RequestUser) {
    const employee = await this.findOne(id, user);
    if (!employee) throw new NotFoundException('Сотрудник не найден');

    // Создаём целевую папку
    const companyFolder = this.sanitize(employee.company?.name || 'unknown');
    const employeeDir = `${this.sanitize(employee.latinFirstName || 'unknown')}_${this.sanitize(employee.latinLastName || 'unknown')}_${employee.id}`;
    const targetDir = path.join('storage', 'companies', companyFolder, 'employees', employeeDir);
    await fs.mkdir(targetDir, { recursive: true });

    // Удаляем старое фото если есть
    if (employee.photoPath) {
      try { await fs.unlink(employee.photoPath); } catch {}
    }

    // Перемещаем файл из tmp
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const photoFileName = `photo${ext}`;
    const targetPath = path.join(targetDir, photoFileName);
    await fs.rename(file.path, targetPath);

    // Обновляем запись
    return this.prisma.employee.update({
      where: { id },
      data: { photoPath: targetPath },
      include: { department: true, position: true, company: true },
    });
  }

  async getPhotoStream(id: number): Promise<{ stream: import('fs').ReadStream; mimeType: string }> {
    const employee = await this.prisma.employee.findUnique({ where: { id }, select: { photoPath: true } });
    if (!employee?.photoPath || !existsSync(employee.photoPath)) {
      throw new NotFoundException('Фото не найдено');
    }

    const ext = path.extname(employee.photoPath).toLowerCase();
    const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    const mimeType = mimeMap[ext] || 'image/jpeg';

    return { stream: createReadStream(employee.photoPath), mimeType };
  }

  // Метод для получения всех сотрудников всех компаний (только для суперадминов)
  async findAllForHolding(
    page: number = 1,
    limit: number = 10,
    search?: string,
  ): Promise<{ data: EmployeeWithRelations[]; total: number }> {
    const where: Prisma.EmployeeWhereInput = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { patronymic: { contains: search } },
        { company: { name: { contains: search } } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          department: true,
          position: true,
          company: true,
        },
        orderBy: { id: 'desc' },
      }),
      this.prisma.employee.count({ where }),
    ]);

    return { data, total };
  }
}
