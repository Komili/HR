import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class TelegramService implements OnModuleInit {
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

  async sendMessage(text: string): Promise<void> {
    if (!this.bot || this.chatIds.length === 0) return;

    for (const chatId of this.chatIds) {
      try {
        await this.bot.sendMessage(chatId, text);
      } catch (err) {
        this.logger.error(`Ошибка Telegram (chatId=${chatId}): ${err.message}`);
      }
    }
  }
}
