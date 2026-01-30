import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

type EmployeeWithRelations = Prisma.EmployeeGetPayload<{
  include: { department: true; position: true };
}>;

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.EmployeeCreateInput): Promise<EmployeeWithRelations> {
    return this.prisma.employee.create({
      data,
      include: {
        department: true,
        position: true,
      },
    });
  }

  async findAll(
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
        },
      }),
      this.prisma.employee.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: number): Promise<EmployeeWithRelations | null> {
    return this.prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        position: true,
      },
    });
  }

  async update(id: number, data: Prisma.EmployeeUpdateInput): Promise<EmployeeWithRelations> {
    return this.prisma.employee.update({
      where: { id },
      data,
      include: {
        department: true,
        position: true,
      },
    });
  }

  async remove(id: number): Promise<EmployeeWithRelations> {
    return this.prisma.employee.delete({
      where: { id },
      include: {
        department: true,
        position: true,
      },
    });
  }
}
