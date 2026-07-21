import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { TelegramService } from '../telegram/telegram.service';
import * as bcrypt from 'bcrypt';

// Фиксированный валидный bcrypt-хэш несуществующего пароля — используется, когда
// пользователь с таким email не найден, чтобы bcrypt.compare всё равно выполнился
// и время ответа не выдавало (по таймингу), существует ли аккаунт с этим email.
const DUMMY_HASH = '$2b$10$/EpNdGPirK6C/jZpqLMT0uJTamEzFO/jDztncqe/.6nF3GMdnDVoK';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private telegramService: TelegramService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(email);

    // bcrypt.compare выполняется всегда (даже без пользователя) — константное время ответа.
    const isPasswordValid = await bcrypt.compare(pass, user?.password ?? DUMMY_HASH);

    if (!user) return null;

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Аккаунт временно заблокирован из-за неудачных попыток входа. Повторите через ${minutesLeft} мин.`,
      );
    }

    if (!isPasswordValid) {
      await this.usersService.registerFailedLogin(user.id);
      return null;
    }

    await this.usersService.resetFailedLogin(user.id);
    const { password, ...result } = user;
    return result;
  }

  async login(user: any, ip?: string) {
    // Собираем все companyIds: основная + дополнительные (UserCompany)
    const extraCompanyIds: number[] = (user.extraCompanies || []).map((uc: any) => uc.companyId);
    const companyIds: number[] = user.companyId
      ? [...new Set([user.companyId, ...extraCompanyIds])]
      : extraCompanyIds;

    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role.name,
      companyId: user.companyId,
      companyName: user.company?.name || null,
      isHoldingAdmin: user.isHoldingAdmin || false,
      companyIds: companyIds.length > 0 ? companyIds : undefined,
    };

    this.notifyLogin(user, ip);

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
        companyIds: companyIds.length > 0 ? companyIds : undefined,
      },
    };
  }

  private notifyLogin(user: any, ip?: string): void {
    const fullName = [user.lastName, user.firstName].filter(Boolean).join(' ') || user.email;
    const companyName = user.isHoldingAdmin ? 'Холдинг (все компании)' : user.company?.name || '—';
    const time = new Date().toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Asia/Dushanbe',
    });
    const text = [
      `🔐 <b>Вход в систему</b>`,
      ``,
      `👤 <b>${fullName}</b> (${user.email})`,
      `🎭 Роль: ${user.role.name}`,
      `🏢 ${companyName}`,
      ip ? `🌐 IP: <code>${ip}</code>` : null,
      `⏰ ${time}`,
    ].filter(Boolean).join('\n');

    this.telegramService
      .notify('login', text, { companyId: user.companyId })
      .catch(() => { /* уведомление не должно ронять логин */ });
  }

  async register(data: { email: string; password: string }) {
    const existingUser = await this.usersService.findOne(data.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Роль всегда "Сотрудник" (ID 5, без доступа к данным) — не принимается извне,
    // чтобы саморегистрация не могла назначить себе привилегированную роль.
    const created = await this.usersService.create({
      email: data.email,
      password: data.password,
      role: { connect: { id: 5 } },
    });
    const { password, ...safeUser } = created;
    return safeUser;
  }
}
