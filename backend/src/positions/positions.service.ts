import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Position, Prisma } from '@prisma/client';

@Injectable()
export class PositionsService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.PositionCreateInput): Promise<Position> {
    return this.prisma.position.create({ data });
  }

  async findAll(): Promise<Position[]> {
    return this.prisma.position.findMany();
  }

  async findOne(id: number): Promise<Position | null> {
    return this.prisma.position.findUnique({ where: { id } });
  }

  async update(id: number, data: Prisma.PositionUpdateInput): Promise<Position> {
    return this.prisma.position.update({ where: { id }, data });
  }

  async remove(id: number): Promise<Position> {
    return this.prisma.position.delete({ where: { id } });
  }
}
