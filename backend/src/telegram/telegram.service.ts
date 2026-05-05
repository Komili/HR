import { Injectable, Logger, OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class TelegramService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name);

  // Бот для алертов/системных сообщений
  private alertBot: any = null;
  private alertChatIds: string[] = [];

  // Бот для посещаемости (Вход/Выход)
  private attendanceBot: any = null;
  private attendanceChatIds: string[] = [];

  onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TelegramBot = require('node-telegram-bot-api');

    // ── Основной бот (алерты) ──
    const alertToken = process.env.TELEGRAM_TOKEN;
    const alertChatIdsRaw = process.env.TELEGRAM_CHAT_IDS;

    if (alertToken && alertChatIdsRaw) {
      this.alertBot = new TelegramBot(alertToken, { polling: false });
      this.alertChatIds = alertChatIdsRaw.split(',').map((id) => id.trim()).filter(Boolean);
      this.logger.log(`✅ Бот алертов запущен. Чаты: ${this.alertChatIds.join(', ')}`);
    } else {
      this.logger.warn('TELEGRAM_TOKEN / TELEGRAM_CHAT_IDS не заданы — алерты отключены');
    }

    // ── Бот посещаемости ──
    const attendanceToken = process.env.TELEGRAM_ATTENDANCE_TOKEN;
    const attendanceChatIdsRaw = process.env.TELEGRAM_ATTENDANCE_CHAT_IDS;

    if (attendanceToken && attendanceChatIdsRaw) {
      // Отдельный бот
      this.attendanceBot = new TelegramBot(attendanceToken, { polling: false });
      this.attendanceChatIds = attendanceChatIdsRaw.split(',').map((id) => id.trim()).filter(Boolean);
      this.logger.log(`✅ Бот посещаемости запущен. Чаты: ${this.attendanceChatIds.join(', ')}`);
    } else if (attendanceChatIdsRaw && this.alertBot) {
      // Тот же бот, другие чаты
      this.attendanceBot = this.alertBot;
      this.attendanceChatIds = attendanceChatIdsRaw.split(',').map((id) => id.trim()).filter(Boolean);
      this.logger.log(`✅ Посещаемость → тот же бот, чаты: ${this.attendanceChatIds.join(', ')}`);
    } else if (this.alertBot) {
      // Всё в один чат
      this.attendanceBot = this.alertBot;
      this.attendanceChatIds = this.alertChatIds;
      this.logger.log('ℹ️  TELEGRAM_ATTENDANCE_CHAT_IDS не задан — посещаемость идёт в основной чат');
    }
  }

  async onApplicationBootstrap() {
    const now = this.formatTime(new Date());
    await this.sendMessage(`✅ Сервер КАДРЫ запущен\n⏰ ${now}`);
  }

  async onApplicationShutdown() {
    const now = this.formatTime(new Date());
    await this.sendMessage(`🛑 Сервер КАДРЫ остановлен\n⏰ ${now}`);
  }

  /** Алерты, системные сообщения, бэкапы → TELEGRAM_CHAT_IDS */
  async sendMessage(text: string, parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' | null = 'HTML'): Promise<void> {
    if (!this.alertBot || this.alertChatIds.length === 0) return;

    for (const chatId of this.alertChatIds) {
      try {
        await this.alertBot.sendMessage(chatId, text, parseMode ? { parse_mode: parseMode } : {});
      } catch (err) {
        this.logger.error(`Ошибка Telegram alert (chatId=${chatId}): ${err.message}`);
      }
    }
  }

  async sendPhoto(photo: Buffer, caption: string): Promise<void> {
    if (!this.alertBot || this.alertChatIds.length === 0) return;

    for (const chatId of this.alertChatIds) {
      try {
        await this.alertBot.sendPhoto(chatId, photo, { caption, parse_mode: 'HTML' });
      } catch (err) {
        this.logger.warn(`sendPhoto failed (chatId=${chatId}): ${err.message}, sending text`);
        await this.alertBot.sendMessage(chatId, caption, { parse_mode: 'HTML' }).catch(() => {});
      }
    }
  }

  /** Вход/Выход сотрудника → TELEGRAM_ATTENDANCE_TOKEN + TELEGRAM_ATTENDANCE_CHAT_IDS */
  async sendAttendance(text: string): Promise<void> {
    if (!this.attendanceBot || this.attendanceChatIds.length === 0) return;

    for (const chatId of this.attendanceChatIds) {
      try {
        await this.attendanceBot.sendMessage(chatId, text, { parse_mode: 'HTML' });
      } catch (err) {
        this.logger.error(`Ошибка Telegram attendance (chatId=${chatId}): ${err.message}`);
      }
    }
  }

  /** Вход/Выход с фото → TELEGRAM_ATTENDANCE_TOKEN + TELEGRAM_ATTENDANCE_CHAT_IDS */
  async sendAttendancePhoto(photo: Buffer, caption: string): Promise<void> {
    if (!this.attendanceBot || this.attendanceChatIds.length === 0) return;

    for (const chatId of this.attendanceChatIds) {
      try {
        await this.attendanceBot.sendPhoto(chatId, photo, { caption, parse_mode: 'HTML' });
      } catch (err) {
        this.logger.warn(`sendAttendancePhoto failed (chatId=${chatId}): ${err.message}, sending text`);
        await this.attendanceBot.sendMessage(chatId, caption, { parse_mode: 'HTML' }).catch(() => {});
      }
    }
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
