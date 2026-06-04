import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';
import { TELEGRAM_CATEGORIES, TELEGRAM_CATEGORY_KEYS } from './telegram.categories';

type ChatInput = {
  title?: string;
  chatId?: string;
  token?: string | null;
  categories?: string[];
  companyId?: number | null;
  isActive?: boolean;
};

@Injectable()
export class TelegramSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  getCategories() {
    return TELEGRAM_CATEGORIES;
  }

  async getConfig() {
    const cfg = await this.prisma.telegramConfig.findUnique({ where: { id: 1 } });
    return { defaultToken: cfg?.defaultToken || '' };
  }

  async updateConfig(defaultToken: string) {
    const token = (defaultToken || '').trim() || null;
    await this.prisma.telegramConfig.upsert({
      where: { id: 1 },
      update: { defaultToken: token },
      create: { id: 1, defaultToken: token },
    });
    await this.telegram.reload();
    return this.getConfig();
  }

  listChats() {
    return this.prisma.telegramChat.findMany({
      orderBy: [{ companyId: 'asc' }, { id: 'asc' }],
      include: { company: { select: { id: true, name: true } } },
    });
  }

  private sanitizeCategories(categories?: string[]): string {
    return (categories || []).filter((c) => TELEGRAM_CATEGORY_KEYS.includes(c)).join(',');
  }

  async createChat(data: ChatInput) {
    if (!data.chatId?.trim()) throw new BadRequestException('Chat ID обязателен');
    if (!data.title?.trim()) throw new BadRequestException('Название обязательно');
    const chat = await this.prisma.telegramChat.create({
      data: {
        title: data.title.trim(),
        chatId: data.chatId.trim(),
        token: data.token?.trim() || null,
        categories: this.sanitizeCategories(data.categories),
        companyId: data.companyId ?? null,
        isActive: data.isActive ?? true,
      },
    });
    await this.telegram.reload();
    return chat;
  }

  async updateChat(id: number, data: ChatInput) {
    const exists = await this.prisma.telegramChat.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Чат не найден');
    const updated = await this.prisma.telegramChat.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.chatId !== undefined ? { chatId: data.chatId.trim() } : {}),
        ...(data.token !== undefined ? { token: data.token?.trim() || null } : {}),
        ...(data.categories !== undefined ? { categories: this.sanitizeCategories(data.categories) } : {}),
        ...(data.companyId !== undefined ? { companyId: data.companyId ?? null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    await this.telegram.reload();
    return updated;
  }

  async deleteChat(id: number) {
    const exists = await this.prisma.telegramChat.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Чат не найден');
    await this.prisma.telegramChat.delete({ where: { id } });
    await this.telegram.reload();
    return { success: true };
  }

  async testChat(id: number) {
    const chat = await this.prisma.telegramChat.findUnique({ where: { id } });
    if (!chat) throw new NotFoundException('Чат не найден');
    const cfg = await this.prisma.telegramConfig.findUnique({ where: { id: 1 } });
    const token = chat.token || cfg?.defaultToken || process.env.TELEGRAM_TOKEN;
    if (!token) throw new BadRequestException('Токен бота не задан (ни у чата, ни по умолчанию)');
    try {
      await this.telegram.sendTest(
        token,
        chat.chatId,
        `🔔 <b>Тест уведомления</b>\nЧат: <b>${chat.title}</b>\n✅ Если вы видите это сообщение — настройка верна.`,
      );
      return { success: true };
    } catch (err) {
      throw new BadRequestException(`Не удалось отправить: ${err.message}`);
    }
  }
}
