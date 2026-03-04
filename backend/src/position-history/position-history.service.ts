import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/jwt.strategy';

@Injectable()
export class PositionHistoryService {
  constructor(private prisma: PrismaService) {}

  async findByEmployee(employeeId: number, user: RequestUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Сотрудник не найден');
    if (!user.isHoldingAdmin && employee.companyId !== user.companyId) {
      throw new ForbiddenException();
    }
    return this.prisma.positionHistory.findMany({
      where: { employeeId },
      orderBy: { startDate: 'desc' },
    });
  }

  async create(employeeId: number, data: {
    departmentName?: string;
    positionName?: string;
    startDate: string;
    endDate?: string;
    note?: string;
  }, user: RequestUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Сотрудник не найден');
    if (!user.isHoldingAdmin && employee.companyId !== user.companyId) {
      throw new ForbiddenException();
    }
    return this.prisma.positionHistory.create({
      data: {
        employeeId,
        companyId: employee.companyId,
        departmentName: data.departmentName || null,
        positionName: data.positionName || null,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        note: data.note || null,
      },
    });
  }

  async update(id: number, data: {
    departmentName?: string;
    positionName?: string;
    startDate?: string;
    endDate?: string;
    note?: string;
  }, user: RequestUser) {
    const entry = await this.prisma.positionHistory.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Запись не найдена');
    if (!user.isHoldingAdmin && entry.companyId !== user.companyId) {
      throw new ForbiddenException();
    }
    return this.prisma.positionHistory.update({
      where: { id },
      data: {
        ...(data.departmentName !== undefined ? { departmentName: data.departmentName || null } : {}),
        ...(data.positionName !== undefined ? { positionName: data.positionName || null } : {}),
        ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
        ...(data.note !== undefined ? { note: data.note || null } : {}),
      },
    });
  }

  async remove(id: number, user: RequestUser) {
    const entry = await this.prisma.positionHistory.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Запись не найдена');
    if (!user.isHoldingAdmin && entry.companyId !== user.companyId) {
      throw new ForbiddenException();
    }
    await this.prisma.positionHistory.delete({ where: { id } });
    return { message: 'Удалено' };
  }
}
