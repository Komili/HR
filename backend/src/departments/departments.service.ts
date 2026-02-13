import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { RequestUser } from '../auth/jwt.strategy';

type DepartmentWithCompany = Prisma.DepartmentGetPayload<{
  include: { company: true };
}>;

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  private getCompanyFilter(user: RequestUser, requestedCompanyId?: number): number | undefined {
    if (user.isHoldingAdmin) {
      return requestedCompanyId || undefined;
    }
    if (!user.companyId) {
      throw new ForbiddenException('User is not assigned to any company');
    }
    return user.companyId;
  }

  async create(data: Prisma.DepartmentCreateInput): Promise<DepartmentWithCompany> {
    return this.prisma.department.create({
      data,
      include: { company: true },
    });
  }

  async findAll(user?: RequestUser, requestedCompanyId?: number): Promise<DepartmentWithCompany[]> {
    const where: Prisma.DepartmentWhereInput = {};

    if (user) {
      const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
      if (companyFilter) {
        where.companyId = companyFilter;
      }
    }

    return this.prisma.department.findMany({
      where,
      include: { company: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number, user?: RequestUser): Promise<DepartmentWithCompany | null> {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: { company: true },
    });

    if (department && user && !user.isHoldingAdmin) {
      if (department.companyId !== user.companyId) {
        throw new ForbiddenException('Access denied to this department');
      }
    }

    return department;
  }

  async update(id: number, data: Prisma.DepartmentUpdateInput, user?: RequestUser): Promise<DepartmentWithCompany> {
    if (user) {
      await this.findOne(id, user);
    }

    return this.prisma.department.update({
      where: { id },
      data,
      include: { company: true },
    });
  }

  async remove(id: number, user?: RequestUser): Promise<DepartmentWithCompany> {
    if (user) {
      await this.findOne(id, user);
    }

    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { employees: true } } },
    });
    if (!dept) throw new NotFoundException('Отдел не найден');

    if ((dept as any)._count.employees > 0) {
      throw new BadRequestException(
        `Невозможно удалить отдел "${dept.name}": в нём ${(dept as any)._count.employees} сотрудников. Сначала переведите их в другой отдел.`,
      );
    }

    return this.prisma.department.delete({
      where: { id },
      include: { company: true },
    });
  }
}
