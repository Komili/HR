import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Company, Prisma } from '@prisma/client';
import { RequestUser } from '../auth/jwt.strategy';

type CompanyWithStats = Company & {
  _count?: {
    employees: number;
    departments: number;
    positions: number;
    users: number;
  };
};

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.CompanyCreateInput): Promise<Company> {
    return this.prisma.company.create({ data });
  }

  async findAll(user?: RequestUser): Promise<CompanyWithStats[]> {
    // Только суперадмины могут видеть все компании
    if (user && !user.isHoldingAdmin) {
      // Пользователь видит только свои компании (основная + дополнительные)
      const allowedIds = user.companyIds && user.companyIds.length > 0
        ? user.companyIds
        : user.companyId ? [user.companyId] : [];
      if (allowedIds.length === 0) {
        return [];
      }
      return this.prisma.company.findMany({
        where: { id: { in: allowedIds } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          _count: {
            select: {
              employees: true,
              departments: true,
              positions: true,
              users: true,
            },
          },
        },
      });
    }

    // Суперадмин видит все компании
    return this.prisma.company.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            employees: true,
            departments: true,
            positions: true,
            users: true,
          },
        },
      },
    });
  }

  async reorder(items: { id: number; sortOrder: number }[]): Promise<void> {
    await this.prisma.$transaction(
      items.map(({ id, sortOrder }) =>
        this.prisma.company.update({ where: { id }, data: { sortOrder } }),
      ),
    );
  }

  async findOne(id: number, user?: RequestUser): Promise<CompanyWithStats | null> {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            employees: true,
            departments: true,
            positions: true,
            users: true,
          },
        },
      },
    });

    // Проверка доступа
    if (company && user && !user.isHoldingAdmin) {
      if (company.id !== user.companyId) {
        throw new ForbiddenException('Access denied to this company');
      }
    }

    return company;
  }

  async update(id: number, data: Prisma.CompanyUpdateInput, user?: RequestUser): Promise<Company> {
    // Только суперадмин может обновлять компании
    if (user && !user.isHoldingAdmin) {
      throw new ForbiddenException('Only holding admins can update companies');
    }

    return this.prisma.company.update({
      where: { id },
      data,
    });
  }

  async updateSchedule(
    id: number,
    data: { lunchBreakStart?: string; lunchBreakEnd?: string; workDayStart?: string; workDayEnd?: string; workDays?: string },
    user: RequestUser,
  ): Promise<Company> {
    // Только суперадмин может менять расписание
    if (!user.isHoldingAdmin) {
      throw new ForbiddenException('Only holding admins can update company schedule');
    }

    return this.prisma.company.update({
      where: { id },
      data,
    });
  }

  async remove(id: number, user?: RequestUser): Promise<Company> {
    // Только суперадмин может удалять компании
    if (user && !user.isHoldingAdmin) {
      throw new ForbiddenException('Только суперадмин может удалять компании');
    }

    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { _count: { select: { employees: true, users: true, departments: true } } },
    });
    if (!company) throw new NotFoundException('Компания не найдена');

    // Проверяем, есть ли связанные данные
    const counts = (company as any)._count;
    if (counts.employees > 0 || counts.users > 0 || counts.departments > 0) {
      throw new BadRequestException(
        `Невозможно удалить компанию "${company.name}": есть связанные данные (сотрудников: ${counts.employees}, пользователей: ${counts.users}, отделов: ${counts.departments}). Сначала удалите или перенесите все данные.`,
      );
    }

    return this.prisma.company.delete({
      where: { id },
    });
  }

  // Получить статистику холдинга (для дашборда суперадмина)
  async getHoldingStats(): Promise<{
    totalCompanies: number;
    totalEmployees: number;
    totalDepartments: number;
    totalPositions: number;
    companiesStats: Array<{
      id: number;
      name: string;
      shortName: string | null;
      employeesCount: number;
      departmentsCount: number;
    }>;
  }> {
    const [
      totalCompanies,
      totalEmployees,
      totalDepartments,
      totalPositions,
      companies,
    ] = await this.prisma.$transaction([
      this.prisma.company.count(),
      this.prisma.employee.count(),
      this.prisma.department.count(),
      this.prisma.position.count(),
      this.prisma.company.findMany({
        include: {
          _count: {
            select: {
              employees: true,
              departments: true,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return {
      totalCompanies,
      totalEmployees,
      totalDepartments,
      totalPositions,
      companiesStats: companies.map((c) => ({
        id: c.id,
        name: c.name,
        shortName: c.shortName,
        employeesCount: c._count.employees,
        departmentsCount: c._count.departments,
      })),
    };
  }
}
