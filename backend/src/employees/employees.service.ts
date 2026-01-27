import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Employee, Prisma } from '@prisma/client';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.EmployeeCreateInput): Promise<Employee> {
    return this.prisma.employee.create({ data });
  }

  async findAll(): Promise<Employee[]> {
    return this.prisma.employee.findMany();
  }

  async findOne(id: number): Promise<Employee | null> {
    return this.prisma.employee.findUnique({ where: { id } });
  }

  async update(id: number, data: Prisma.EmployeeUpdateInput): Promise<Employee> {
    return this.prisma.employee.update({
      where: { id },
      data,
    });
  }

  async remove(id: number): Promise<Employee> {
    return this.prisma.employee.delete({ where: { id } });
  }
}