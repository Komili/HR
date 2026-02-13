import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/jwt.strategy';

@Injectable()
export class OfficesService {
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

  async findAll(user: RequestUser, requestedCompanyId?: number) {
    const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
    const where = companyFilter ? { companyId: companyFilter } : {};

    return this.prisma.office.findMany({
      where,
      include: { company: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number, user: RequestUser) {
    const office = await this.prisma.office.findUnique({
      where: { id },
      include: { company: { select: { id: true, name: true } } },
    });

    if (!office) {
      throw new NotFoundException(`Office with ID ${id} not found`);
    }

    if (!user.isHoldingAdmin && office.companyId !== user.companyId) {
      throw new ForbiddenException('Access denied to this office');
    }

    return office;
  }

  async create(data: { name: string; address?: string; companyId?: number }, user: RequestUser) {
    const targetCompanyId = user.isHoldingAdmin && data.companyId
      ? data.companyId
      : user.companyId;

    if (!targetCompanyId) {
      throw new ForbiddenException('Company ID is required');
    }

    return this.prisma.office.create({
      data: {
        name: data.name,
        address: data.address || null,
        companyId: targetCompanyId,
      },
      include: { company: { select: { id: true, name: true } } },
    });
  }

  async update(id: number, data: { name?: string; address?: string }, user: RequestUser) {
    await this.findOne(id, user);

    return this.prisma.office.update({
      where: { id },
      data,
      include: { company: { select: { id: true, name: true } } },
    });
  }

  async remove(id: number, user: RequestUser) {
    await this.findOne(id, user);

    const eventsCount = await this.prisma.attendanceEvent.count({ where: { officeId: id } });
    if (eventsCount > 0) {
      throw new BadRequestException(
        `Невозможно удалить офис: к нему привязаны ${eventsCount} записей посещаемости.`,
      );
    }

    return this.prisma.office.delete({ where: { id } });
  }
}
