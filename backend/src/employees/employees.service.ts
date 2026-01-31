import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';

type EmployeeWithRelations = Prisma.EmployeeGetPayload<{
  include: { department: true; position: true };
}>;

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.EmployeeCreateInput): Promise<EmployeeWithRelations> {
    const employee = await this.prisma.employee.create({
      data,
      include: {
        department: true,
        position: true,
      },
    });

    // Создаём папку для документов сотрудника
    await this.createEmployeeFolder(employee);

    return employee;
  }

  private async createEmployeeFolder(employee: EmployeeWithRelations): Promise<string> {
    const sanitizedFirstName = this.sanitize(employee.latinFirstName || 'unknown');
    const sanitizedLastName = this.sanitize(employee.latinLastName || 'unknown');
    const employeeDir = `${sanitizedFirstName}_${sanitizedLastName}_${employee.id}`;
    const targetDir = path.join('storage', 'employees', employeeDir, 'docs');

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
