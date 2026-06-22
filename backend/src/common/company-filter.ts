import { ForbiddenException } from '@nestjs/common';

interface UserLike {
  isHoldingAdmin: boolean;
  companyId: number | null;
  companyIds?: number[];
}

/** Возвращает все разрешённые companyId для пользователя. */
export function getAllowedCompanyIds(user: UserLike): number[] {
  if (user.companyIds && user.companyIds.length > 0) return user.companyIds;
  return user.companyId ? [user.companyId] : [];
}

/**
 * Возвращает Prisma-фильтр по companyId.
 * Для суперадмина — requestedCompanyId или undefined (без фильтра).
 * Для обычного пользователя — число (одна компания) или { in: [...] } (несколько).
 * При передаче requestedCompanyId проверяет, что он входит в допустимые.
 */
export function getCompanyFilter(
  user: UserLike,
  requestedCompanyId?: number,
): number | { in: number[] } | undefined {
  if (user.isHoldingAdmin) return requestedCompanyId || undefined;

  const allowed = getAllowedCompanyIds(user);
  if (allowed.length === 0) throw new ForbiddenException('User is not assigned to any company');

  if (requestedCompanyId) {
    if (!allowed.includes(requestedCompanyId)) {
      throw new ForbiddenException('Access denied to this company');
    }
    return requestedCompanyId;
  }

  return allowed.length === 1 ? allowed[0] : { in: allowed };
}

/** Проверяет, имеет ли пользователь доступ к указанной компании. */
export function isAuthorizedForCompany(user: UserLike, companyId: number): boolean {
  if (user.isHoldingAdmin) return true;
  return getAllowedCompanyIds(user).includes(companyId);
}
