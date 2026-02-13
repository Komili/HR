import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { RequestUser } from '../auth/jwt.strategy';

type UserWithRelations = User & { role: { name: string }; company: { id: number; name: string; shortName: string | null } | null };

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private readonly userInclude = {
    role: { select: { name: true } },
    company: { select: { id: true, name: true, shortName: true } },
  };

  async findOne(email: string): Promise<UserWithRelations | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: this.userInclude,
    });
  }

  async findById(id: number): Promise<UserWithRelations | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: this.userInclude,
    });
  }

  async findAll(requestUser: RequestUser): Promise<Omit<UserWithRelations, 'password'>[]> {
    if (!requestUser.isHoldingAdmin) {
      throw new ForbiddenException('Только суперадмин может управлять пользователями');
    }

    const users = await this.prisma.user.findMany({
      include: this.userInclude,
      orderBy: { id: 'asc' },
    });

    return users.map(({ password, ...rest }) => rest) as any;
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(data.password, saltRounds);

    return this.prisma.user.create({
      data: { ...data, password: hashedPassword },
    });
  }

  async createUser(
    userData: { email: string; password: string; firstName?: string; lastName?: string; roleId: number; companyId?: number },
    requestUser: RequestUser,
  ): Promise<Omit<UserWithRelations, 'password'>> {
    if (!requestUser.isHoldingAdmin) {
      throw new ForbiddenException('Только суперадмин может создавать пользователей');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: userData.email } });
    if (existing) throw new BadRequestException('Пользователь с таким email уже существует');

    const role = await this.prisma.role.findUnique({ where: { id: userData.roleId } });
    if (!role) throw new BadRequestException('Роль не найдена');

    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const isHoldingAdmin = role.name === 'Суперадмин';

    const user = await this.prisma.user.create({
      data: {
        email: userData.email,
        password: hashedPassword,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        role: { connect: { id: userData.roleId } },
        company: userData.companyId ? { connect: { id: userData.companyId } } : undefined,
        isHoldingAdmin,
      },
      include: this.userInclude,
    });

    const { password, ...rest } = user;
    return rest as any;
  }

  async updateUser(
    id: number,
    data: { email?: string; firstName?: string; lastName?: string; roleId?: number; companyId?: number | null; isActive?: boolean },
    requestUser: RequestUser,
  ): Promise<Omit<UserWithRelations, 'password'>> {
    if (!requestUser.isHoldingAdmin) {
      throw new ForbiddenException('Только суперадмин может редактировать пользователей');
    }

    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Пользователь не найден');

    // Проверяем уникальность email при смене
    if (data.email !== undefined && data.email !== existing.email) {
      const dup = await this.prisma.user.findUnique({ where: { email: data.email } });
      if (dup) throw new BadRequestException('Пользователь с таким email уже существует');
    }

    const updateData: any = {};
    if (data.email !== undefined) updateData.email = data.email;
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    if (data.roleId !== undefined) {
      const role = await this.prisma.role.findUnique({ where: { id: data.roleId } });
      if (!role) throw new BadRequestException('Роль не найдена');
      updateData.role = { connect: { id: data.roleId } };
      updateData.isHoldingAdmin = role.name === 'Суперадмин';
    }

    if (data.companyId !== undefined) {
      if (data.companyId === null) {
        updateData.company = { disconnect: true };
      } else {
        updateData.company = { connect: { id: data.companyId } };
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: this.userInclude,
    });

    const { password, ...rest } = user;
    return rest as any;
  }

  async deleteUser(id: number, requestUser: RequestUser): Promise<void> {
    if (!requestUser.isHoldingAdmin) {
      throw new ForbiddenException('Только суперадмин может удалять пользователей');
    }

    // Нельзя удалить себя
    if (id === requestUser.userId) {
      throw new BadRequestException('Нельзя удалить свою учётную запись');
    }

    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Пользователь не найден');

    await this.prisma.user.delete({ where: { id } });
  }

  async changePassword(
    id: number,
    newPassword: string,
    requestUser: RequestUser,
  ): Promise<void> {
    // Суперадмин может менять любой пароль, пользователь — только свой
    if (!requestUser.isHoldingAdmin && requestUser.userId !== id) {
      throw new ForbiddenException('Нет доступа для смены пароля');
    }

    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Пользователь не найден');

    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('Пароль должен быть не менее 6 символов');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { password: hashed },
    });
  }

  async getRoles() {
    return this.prisma.role.findMany({ orderBy: { id: 'asc' } });
  }
}
