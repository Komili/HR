import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { TelegramService } from '../telegram/telegram.service';

interface HikvisionDevice {
  ip: string;
  officeName: string;
  direction: 'IN' | 'OUT';
}

@Injectable()
export class HikvisionService implements OnModuleInit {
  private readonly logger = new Logger(HikvisionService.name);
  private devices: HikvisionDevice[] = [];

  constructor(
    private prisma: PrismaService,
    private attendanceService: AttendanceService,
    private telegramService: TelegramService,
  ) {}

  onModuleInit() {
    const devicesRaw = process.env.HIKVISION_DEVICES;
    if (!devicesRaw) {
      this.logger.warn('HIKVISION_DEVICES не настроен в .env — маппинг IP→офис отсутствует');
      return;
    }
    try {
      this.devices = JSON.parse(devicesRaw);
      this.logger.log(`✅ Hikvision устройств загружено: ${this.devices.length}`);
    } catch (err) {
      this.logger.error(`Ошибка парсинга HIKVISION_DEVICES: ${err.message}`);
    }
  }

  async handleEvent(rawBody: Buffer | string): Promise<void> {
    // Hikvision шлёт multipart body — извлекаем JSON между первым { и последним }
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const jsonStr = this.extractJson(bodyStr);

    if (!jsonStr) {
      this.logger.debug('Не удалось извлечь JSON из тела запроса Hikvision');
      return;
    }

    let eventData: any;
    try {
      eventData = JSON.parse(jsonStr);
    } catch {
      this.logger.debug('Ошибка парсинга JSON от Hikvision');
      return;
    }

    const ipAddress: string = eventData.ipAddress;
    const accessEvent = eventData.AccessControllerEvent;

    if (!accessEvent || !ipAddress) {
      this.logger.debug('Событие без AccessControllerEvent или ipAddress — пропускаем');
      return;
    }

    // Пропускаем события удалённого открытия двери
    if (accessEvent.majorEventType === 3 && accessEvent.subEventType === 1024) {
      this.logger.debug(`Удалённое открытие (IP: ${ipAddress}) — пропускаем`);
      return;
    }

    const employeeNo = accessEvent.employeeNo ? String(accessEvent.employeeNo) : null;
    if (!employeeNo) {
      this.logger.debug('Событие без employeeNo — пропускаем');
      return;
    }

    // Определяем офис и направление по IP устройства
    const device = this.devices.find((d) => d.ip === ipAddress);
    if (!device) {
      this.logger.warn(`Неизвестный IP устройства: ${ipAddress} — добавьте в HIKVISION_DEVICES`);
      return;
    }

    // Время события
    const timestamp = eventData.dateTime ? new Date(eventData.dateTime) : new Date();

    // Ищем сотрудника по skudId
    const employee = await this.prisma.employee.findFirst({
      where: { skudId: employeeNo },
      include: {
        company: { select: { name: true } },
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
    });

    if (!employee) {
      this.logger.warn(`Сотрудник не найден по СКУД ID: ${employeeNo} (IP: ${ipAddress})`);
      await this.telegramService.sendMessage(
        `⚠️ Неизвестный сотрудник\nСКУД №: ${employeeNo}\nУстройство: ${device.officeName} (${device.direction === 'IN' ? 'Вход' : 'Выход'})\nIP: ${ipAddress}`,
      );
      return;
    }

    // Ищем офис в БД по названию и компании
    const office = await this.prisma.office.findFirst({
      where: { name: device.officeName, companyId: employee.companyId },
    });

    // Записываем событие посещаемости
    await this.prisma.attendanceEvent.create({
      data: {
        employeeId: employee.id,
        companyId: employee.companyId,
        timestamp,
        direction: device.direction,
        deviceName: `Hikvision ${ipAddress}`,
        officeId: office?.id || null,
      },
    });

    // Пересчитываем дневную сводку
    await this.attendanceService.recalculateDay(employee.id, timestamp);

    // Отправляем уведомление в Telegram
    const fullName = `${employee.lastName} ${employee.firstName}${employee.patronymic ? ' ' + employee.patronymic : ''}`;
    const directionEmoji = device.direction === 'IN' ? '✅' : '🚪';
    const directionText = device.direction === 'IN' ? 'Вход' : 'Выход';
    const timeStr = timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dushanbe' });

    const message = [
      `${directionEmoji} ${directionText}: ${fullName}`,
      `🏢 ${device.officeName} — ${employee.company.name}`,
      `⏰ ${timeStr}`,
    ].join('\n');

    await this.telegramService.sendMessage(message);
    this.logger.log(`${directionText}: ${fullName} — ${device.officeName} (${timeStr})`);
  }

  // Извлекаем JSON из multipart тела (Hikvision вкладывает JSON внутрь MIME)
  private extractJson(body: string): string | null {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return body.substring(start, end + 1);
  }
}
