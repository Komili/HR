import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { RequestUser } from '../auth/jwt.strategy';

type PositionWithCompany = Prisma.PositionGetPayload<{
  include: { company: true };
}>;

@Injectable()
export class PositionsService {
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

  async create(data: Prisma.PositionCreateInput): Promise<PositionWithCompany> {
    return this.prisma.position.create({
      data,
      include: { company: true },
    });
  }

  async findAll(user?: RequestUser, requestedCompanyId?: number): Promise<PositionWithCompany[]> {
    const where: Prisma.PositionWhereInput = {};

    if (user) {
      const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
      if (companyFilter) {
        where.companyId = companyFilter;
      }
    }

    return this.prisma.position.findMany({
      where,
      include: { company: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number, user?: RequestUser): Promise<PositionWithCompany | null> {
    const position = await this.prisma.position.findUnique({
      where: { id },
      include: { company: true },
    });

    if (position && user && !user.isHoldingAdmin) {
      if (position.companyId !== user.companyId) {
        throw new ForbiddenException('Access denied to this position');
      }
    }

    return position;
  }

  async update(id: number, data: Prisma.PositionUpdateInput, user?: RequestUser): Promise<PositionWithCompany> {
    if (user) {
      await this.findOne(id, user);
    }

    return this.prisma.position.update({
      where: { id },
      data,
      include: { company: true },
    });
  }

  async remove(id: number, user?: RequestUser): Promise<PositionWithCompany> {
    if (user) {
      await this.findOne(id, user);
    }

    const pos = await this.prisma.position.findUnique({
      where: { id },
      include: { _count: { select: { employees: true } } },
    });
    if (!pos) throw new NotFoundException('Должность не найдена');

    if ((pos as any)._count.employees > 0) {
      throw new BadRequestException(
        `Невозможно удалить должность "${pos.name}": на ней ${(pos as any)._count.employees} сотрудников. Сначала переведите их на другую должность.`,
      );
    }

    return this.prisma.position.delete({
      where: { id },
      include: { company: true },
    });
  }
}
