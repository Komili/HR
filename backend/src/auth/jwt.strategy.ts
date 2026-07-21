import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { jwtConstants } from './constants';
import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  companyId: number | null;
  companyName: string | null;
  isHoldingAdmin: boolean;
  companyIds?: number[]; // Все разрешённые компании (мультидоступ)
}

export interface RequestUser {
  userId: number;
  email: string;
  role: string;
  companyId: number | null;
  companyName: string | null;
  isHoldingAdmin: boolean;
  companyIds?: number[]; // Все разрешённые компании (мультидоступ)
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    // Проверяем текущий статус пользователя в БД — деактивированный (уволенный)
    // сотрудник теряет доступ немедленно, не дожидаясь истечения токена (до 60 мин).
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Учётная запись деактивирована');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId,
      companyName: payload.companyName,
      isHoldingAdmin: payload.isHoldingAdmin,
      companyIds: payload.companyIds,
    };
  }
}
