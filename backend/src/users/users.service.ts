import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOne(email: string): Promise<(User & { role: { name: string } }) | null> {
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