import { Injectable, ForbiddenException } from '@nestjs/common';
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
      // Обычный пользователь видит только свою компанию
      if (!user.companyId) {
        return [];
      }
      return this.prisma.company.findMany({
        where: { id: user.companyId },
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
      orderBy: { name: 'asc' },
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

  async remove(id: number, user?: RequestUser): Promise<Company> {
    // Только суперадмин может удалять компании
    if (user && !user.isHoldingAdmin) {
      throw new ForbiddenException('Only holding admins can delete companies');
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
        orderBy: { name: 'asc' },
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
