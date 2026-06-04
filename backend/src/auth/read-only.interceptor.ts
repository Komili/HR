import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Глобальный перехватчик: роль «Директор» (CEO холдинга) — только просмотр.
 * Любые операции записи (POST/PATCH/PUT/DELETE) блокируются для этой роли,
 * независимо от контроллера. Read-доступ ко всем компаниям обеспечивает isHoldingAdmin.
 *
 * Интерсептор выполняется ПОСЛЕ guard-ов, поэтому req.user уже заполнен JwtAuthGuard.
 */
@Injectable()
export class ReadOnlyInterceptor implements NestInterceptor {
  private static readonly READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    const method = (req?.method || 'GET').toUpperCase();

    if (user?.role === 'Директор' && !ReadOnlyInterceptor.READ_METHODS.has(method)) {
      throw new ForbiddenException('Директор холдинга имеет доступ только для просмотра');
    }

    return next.handle();
  }
}
