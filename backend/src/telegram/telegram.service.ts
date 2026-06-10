import { Injectable, Logger, OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramCategory } from './telegram.categories';

type ChatRoute = {
  id: number;
  title: string;
  chatId: string;
  token: string | null;
  categories: string[];
  companyIds: number[]; // пусто = все компании (глобально)
};

type NotifyOpts = {
  companyId?: number | null;
  photo?: Buffer;
  caption?: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2' | null;
};

/**
 * Telegram-уведомления с настройкой через БД (TelegramConfig + TelegramChat).
 * Маршрутизация: notify(category, text, { companyId }) → все активные чаты,
 * подписанные на категорию, с учётом компании (глобальный чат получает всё).
 *
 * Совместимость: старые методы sendMessage/sendAttendance/... routed через notify.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name);

  private defaultToken: string | null = null;
  private chats: ChatRoute[] = [];
  private readonly bots = new Map<string, any>(); // token → TelegramBot
  private TelegramBot: any = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.TelegramBot = require('node-telegram-bot-api');
    await this.reload();
  }

  /** Перечитать конфигурацию из БД (вызывается после изменений в админке) */
  async reload(): Promise<void> {
    try {
      const config = await this.prisma.telegramConfig.findUnique({ where: { id: 1 } });
      this.defaultToken = config?.defaultToken || process.env.TELEGRAM_TOKEN || null;

      const rows = await this.prisma.telegramChat.findMany({ where: { isActive: true } });
      this.chats = rows.map((r) => ({
        id: r.id,
        title: r.title,
        chatId: r.chatId,
        token: r.token || null,
        categories: (r.categories || '').split(',').map((s) => s.trim()).filter(Boolean),
        companyIds: (r.companyIds || '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n)),
      }));

      // Фолбэк на .env, если чаты ещё не настроены в БД
      if (this.chats.length === 0 && this.defaultToken && process.env.TELEGRAM_CHAT_IDS) {
        const ids = process.env.TELEGRAM_CHAT_IDS.split(',').map((s) => s.trim()).filter(Boolean);
        this.chats = ids.map((chatId, i) => ({
          id: -1 - i,
          title: `.env чат ${chatId}`,
          chatId,
          token: null,
          categories: ['attendance', 'correction', 'registration', 'employee', 'door_access', 'unknown_face', 'access', 'system'],
          companyIds: [],
        }));
        this.logger.log(`ℹ️  Чаты из БД не настроены — использую .env (${ids.length} чат(ов))`);
      }

      this.logger.log(`✅ Telegram сконфигурирован: ${this.chats.length} чат(ов), токен ${this.defaultToken ? 'есть' : 'НЕ задан'}`);
    } catch (err) {
      this.logger.error(`Ошибка загрузки конфигурации Telegram: ${err.message}`);
    }
  }

  private getBot(token: string): any | null {
    if (!token) return null;
    let bot = this.bots.get(token);
    if (!bot) {
      bot = new this.TelegramBot(token, { polling: false });
      this.bots.set(token, bot);
    }
    return bot;
  }

  /** Основной метод: разослать уведомление подписанным на категорию чатам */
  async notify(category: TelegramCategory | string, text: string, opts: NotifyOpts = {}): Promise<void> {
    const { companyId, photo, caption, parseMode = 'HTML' } = opts;

    for (const chat of this.chats) {
      if (!chat.categories.includes(category)) continue;
      // Компании: пустой список = глобальный чат (получает всё);
      // иначе — только события из выбранных компаний.
      if (chat.companyIds.length > 0) {
        if (companyId == null) continue;
        if (!chat.companyIds.includes(companyId)) continue;
      }

      const token = chat.token || this.defaultToken;
      if (!token) continue;
      const bot = this.getBot(token);
      if (!bot) continue;

      try {
        if (photo) {
          await bot.sendPhoto(chat.chatId, photo, { caption: caption ?? text, parse_mode: 'HTML' });
        } else {
          await bot.sendMessage(chat.chatId, text, parseMode ? { parse_mode: parseMode } : {});
        }
      } catch (err) {
        // Если фото не ушло — пробуем текстом
        if (photo) {
          await bot.sendMessage(chat.chatId, caption ?? text, { parse_mode: 'HTML' }).catch(() => {});
        }
        this.logger.error(`Ошибка Telegram (${category}, chat=${chat.chatId}): ${err.message}`);
      }
    }
  }

  /** Тестовая отправка в конкретный чат (из админки) */
  async sendTest(token: string, chatId: string, text: string): Promise<void> {
    if (!this.TelegramBot) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.TelegramBot = require('node-telegram-bot-api');
    }
    const bot = this.getBot(token);
    if (!bot) throw new Error('Токен бота не задан');
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  }

  async onApplicationBootstrap() {
    await this.notify('system', `✅ Сервер КАДРЫ запущен\n⏰ ${this.formatTime(new Date())}`);
  }

  async onApplicationShutdown() {
    await this.notify('system', `🛑 Сервер КАДРЫ остановлен\n⏰ ${this.formatTime(new Date())}`);
  }

  // ─────────── Совместимость со старым кодом ───────────

  /** Алерты/системные сообщения → категория system */
  async sendMessage(text: string, parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' | null = 'HTML'): Promise<void> {
    await this.notify('system', text, { parseMode });
  }

  async sendPhoto(photo: Buffer, caption: string): Promise<void> {
    await this.notify('system', caption, { photo, caption });
  }

  /** Вход/Выход сотрудника → категория attendance */
  async sendAttendance(text: string, companyId?: number | null): Promise<void> {
    await this.notify('attendance', text, { companyId });
  }

  async sendAttendancePhoto(photo: Buffer, caption: string, companyId?: number | null): Promise<void> {
    await this.notify('attendance', caption, { photo, caption, companyId });
  }

  private formatTime(date: Date): string {
    return date.toLocaleString('ru-RU', {
      timeZone: 'Asia/Dushanbe',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
