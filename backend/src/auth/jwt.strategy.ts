import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { jwtConstants } from './constants';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  companyId: number | null;
  companyName: string | null;
  isHoldingAdmin: boolean;
}

export interface RequestUser {
  userId: number;
  email: string;
  role: string;
  companyId: number | null;
  companyName: string | null;
  isHoldingAdmin: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId,
      companyName: payload.companyName,
      isHoldingAdmin: payload.isHoldingAdmin,
    };
  }
}
