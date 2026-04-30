import { Injectable, Logger, OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class TelegramService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name);
  private bot: any = null;
  private chatIds: string[] = [];

  onModuleInit() {
    const token = process.env.TELEGRAM_TOKEN;
    const chatIdsRaw = process.env.TELEGRAM_CHAT_IDS;

    if (!token || !chatIdsRaw) {
      this.logger.warn('TELEGRAM_TOKEN или TELEGRAM_CHAT_IDS не настроены — уведомления отключены');
      return;
    }

    this.chatIds = chatIdsRaw.split(',').map((id) => id.trim()).filter(Boolean);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TelegramBot = require('node-telegram-bot-api');
    this.bot = new TelegramBot(token, { polling: false });

    this.logger.log(`✅ Telegram бот запущен. Chat ID: ${this.chatIds.join(', ')}`);
  }

  async onApplicationBootstrap() {
    const now = this.formatTime(new Date());
    await this.sendMessage(`✅ Сервер КАДРЫ запущен\n⏰ ${now}`);
  }

  async onApplicationShutdown() {
    const now = this.formatTime(new Date());
    await this.sendMessage(`🛑 Сервер КАДРЫ остановлен\n⏰ ${now}`);
  }

  async sendMessage(text: string, parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' | null = 'HTML'): Promise<void> {
    if (!this.bot || this.chatIds.length === 0) return;

    for (const chatId of this.chatIds) {
      try {
        await this.bot.sendMessage(chatId, text, parseMode ? { parse_mode: parseMode } : {});
      } catch (err) {
        this.logger.error(`Ошибка Telegram (chatId=${chatId}): ${err.message}`);
      }
    }
  }

  async sendPhoto(photo: Buffer, caption: string): Promise<void> {
    if (!this.bot || this.chatIds.length === 0) return;

    for (const chatId of this.chatIds) {
      try {
        await this.bot.sendPhoto(chatId, photo, { caption, parse_mode: 'HTML' });
      } catch (err) {
        // Fallback: если фото не отправилось — отправляем текст
        this.logger.warn(`sendPhoto failed (chatId=${chatId}): ${err.message}, sending text`);
        await this.bot.sendMessage(chatId, caption, { parse_mode: 'HTML' }).catch(() => {});
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
