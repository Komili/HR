import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { IpLockoutService } from './ip-lockout.service';

/** Отсекает заблокированный IP до обращения к БД/bcrypt (LocalStrategy). */
@Injectable()
export class IpLockoutGuard implements CanActivate {
  constructor(private readonly ipLockout: IpLockoutService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const minutesLeft = this.ipLockout.getLockRemainingMinutes(req.ip);
    if (minutesLeft !== null) {
      throw new ForbiddenException(
        `Слишком много неудачных попыток входа с вашего IP. Повторите через ${minutesLeft} мин.`,
      );
    }
    return true;
  }
}
