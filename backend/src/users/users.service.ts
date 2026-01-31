import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOne(email: string): Promise<(User & { role: { name: string }; company: { id: number; name: string; shortName: string | null } | null }) | null> {
    return this.prisma.user.findUnique({
      where: {
        email,
      },
      include: {
        role: {
          select: {
            name: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
      },
    });
  }

  async findById(id: number): Promise<(User & { role: { name: string }; company: { id: number; name: string; shortName: string | null } | null }) | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: {
          select: {
            name: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
      },
    });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(data.password, saltRounds);

    const userData: Prisma.UserCreateInput = {
      ...data,
      password: hashedPassword,
    };

    return this.prisma.user.create({
      data: userData,
    });
  }
}
