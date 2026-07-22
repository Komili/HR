import { Injectable } from '@nestjs/common';

interface IpEntry {
  failCount: number;
  firstFailAt: number;
  lockedUntil: number | null;
}

/**
 * Блокировка входа по IP (в памяти процесса) — грубее, чем поштучная
 * блокировка аккаунта в UsersService: защищает от перебора паролей
 * по разным email с одного адреса.
 */
@Injectable()
export class IpLockoutService {
  private readonly entries = new Map<string, IpEntry>();

  private readonly MAX_ATTEMPTS = 15;
  private readonly WINDOW_MS = 15 * 60 * 1000; // окно накопления неудачных попыток
  private readonly LOCKOUT_MS = 30 * 60 * 1000; // длительность блокировки

  /** Сколько минут ещё заблокирован IP, или null если не заблокирован. */
  getLockRemainingMinutes(ip: string): number | null {
    const entry = this.entries.get(ip);
    if (!entry?.lockedUntil) return null;
    const msLeft = entry.lockedUntil - Date.now();
    if (msLeft <= 0) {
      this.entries.delete(ip);
      return null;
    }
    return Math.ceil(msLeft / 60000);
  }

  registerFailure(ip: string): void {
    const now = Date.now();
    let entry = this.entries.get(ip);
    if (!entry || now - entry.firstFailAt > this.WINDOW_MS) {
      entry = { failCount: 0, firstFailAt: now, lockedUntil: null };
    }
    entry.failCount++;
    if (entry.failCount >= this.MAX_ATTEMPTS) {
      entry.lockedUntil = now + this.LOCKOUT_MS;
    }
    this.entries.set(ip, entry);
  }

  registerSuccess(ip: string): void {
    this.entries.delete(ip);
  }
}
