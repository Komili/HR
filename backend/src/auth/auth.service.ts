import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(email);
    if (user && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role.name,
      companyId: user.companyId,
      companyName: user.company?.name || null,
      isHoldingAdmin: user.isHoldingAdmin || false,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.name,
        companyId: user.companyId,
        companyName: user.company?.name || null,
        isHoldingAdmin: user.isHoldingAdmin || false,
      },
    };
  }

  async register(data: Prisma.UserCreateInput) {
    const existingUser = await this.usersService.findOne(data.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }
    if (!data.role) {
      data.role = { connect: { id: 5 } }; // ID 5 - Сотрудник
    }

    return this.usersService.create(data);
  }
}
