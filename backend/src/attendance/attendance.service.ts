import { Injectable, ForbiddenException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { Subject, Observable, filter, map } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { RequestUser } from '../auth/jwt.strategy';

@Injectable()
export class AttendanceService implements OnModuleInit {
  private readonly updates$ = new Subject<{ companyId: number; date: string }>();

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  /** SSE-поток обновлений посещаемости для конкретной компании/даты */
  getUpdateStream(companyId: number | null, date: string): Observable<MessageEvent> {
    return this.updates$.pipe(
      filter((u) => (companyId === null || u.companyId === companyId) && u.date === date),
      map(() => ({ data: 'update' } as MessageEvent)),
    );
  }

  onModuleInit() {
    // Проверять истёкшие дедлайны каждую минуту
    setInterval(() => this.checkExpiredDeadlines(), 60_000);
  }

  // ─────────── helpers ───────────

  private getCompanyFilter(user: RequestUser, requestedCompanyId?: number): number | undefined {
    if (user.isHoldingAdmin) return requestedCompanyId || undefined;
    if (!user.companyId) throw new ForbiddenException('User is not assigned to any company');
    return user.companyId;
  }

  /** Строит DateTime из даты посещаемости + строки "HH:mm" в локальном времени (Asia/Dushanbe) */
  private buildDeadlineDate(attendanceDate: Date, timeStr: string): Date {
    const y = attendanceDate.getFullYear();
    const m = String(attendanceDate.getMonth() + 1).padStart(2, '0');
    const d = String(attendanceDate.getDate()).padStart(2, '0');
    return new Date(`${y}-${m}-${d}T${timeStr}:00`);
  }

  private mapAttendance(a: any) {
    return {
      id: a.id,
      employeeId: a.employeeId,
      employeeName: a.employee
        ? `${a.employee.lastName} ${a.employee.firstName}${a.employee.patronymic ? ' ' + a.employee.patronymic : ''}`
        : undefined,
      departmentName: a.employee?.department?.name || null,
      positionName: a.employee?.position?.name || null,
      date: a.date.toISOString().split('T')[0],
      firstEntry: a.firstEntry ? a.firstEntry.toISOString() : null,
      lastExit: a.lastExit ? a.lastExit.toISOString() : null,
      status: a.status,
      totalMinutes: a.totalMinutes,
      correctionMinutes: a.correctionMinutes,
      correctedBy: a.correctedBy,
      correctionNote: a.correctionNote,
      correctionType: a.correctionType || null,
      correctionDeadline: a.correctionDeadline ? a.correctionDeadline.toISOString() : null,
      officeName: a.officeName,
      isLate: a.isLate,
      isEarlyLeave: a.isEarlyLeave,
    };
  }

  // ─────────── queries ───────────

  async getLatestDate(user: RequestUser, requestedCompanyId?: number) {
    const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
    const where: any = {};
    if (companyFilter) where.companyId = companyFilter;
    const record = await this.prisma.attendance.findFirst({
      where,
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    return { date: record ? record.date.toISOString().split('T')[0] : null };
  }

  async getDailyAttendance(date: string, user: RequestUser, requestedCompanyId?: number) {
    const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
    const targetDate = new Date(date + 'T00:00:00.000Z');
    const where: any = { date: targetDate };
    if (companyFilter) where.companyId = companyFilter;

    const attendances = await this.prisma.attendance.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true, firstName: true, lastName: true, patronymic: true,
            sortOrder: true,
            department: { select: { name: true, sortOrder: true } },
            position: { select: { name: true } },
          },
        },
      },
    });

    // Сортируем так же как список сотрудников: отдел.sortOrder → сотрудник.sortOrder → id
    attendances.sort((a, b) => {
      const dA = (a.employee as any)?.department?.sortOrder ?? 0;
      const dB = (b.employee as any)?.department?.sortOrder ?? 0;
      if (dA !== dB) return dA - dB;
      const eA = (a.employee as any)?.sortOrder ?? 0;
      const eB = (b.employee as any)?.sortOrder ?? 0;
      if (eA !== eB) return eA - eB;
      return (a.employee as any)?.id - (b.employee as any)?.id;
    });

    if (attendances.length === 0) return [];

    // Build IP→officeName map for resolving legacy "Hikvision 1.2.3.4" deviceNames
    const hikDevices = await this.prisma.hikvisionDevice.findMany({
      select: { lastSeenIp: true, officeName: true },
    });
    const ipToName = new Map<string, string>();
    for (const d of hikDevices) {
      if (d.lastSeenIp && d.officeName) ipToName.set(d.lastSeenIp, d.officeName);
    }

    const resolveDeviceName = (deviceName: string | null, source: string | null): string | null => {
      if (!deviceName) return null;
      const m = deviceName.match(/^Hikvision (\d+\.\d+\.\d+\.\d+)$/);
      if (m) return ipToName.get(m[1]) || deviceName;
      return deviceName;
    };

    // Fetch events for the day to get last activity + selfie IDs
    const employeeIds = attendances.map((a) => a.employeeId);
    const dayEnd = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
    const events = await this.prisma.attendanceEvent.findMany({
      where: {
        employeeId: { in: employeeIds },
        timestamp: { gte: targetDate, lt: dayEnd },
      },
      select: {
        id: true, employeeId: true, timestamp: true,
        direction: true, deviceName: true, source: true, selfiePath: true,
      },
      orderBy: { timestamp: 'asc' },
    });

    const eventsByEmp = new Map<number, typeof events>();
    for (const ev of events) {
      const arr = eventsByEmp.get(ev.employeeId) ?? [];
      arr.push(ev);
      eventsByEmp.set(ev.employeeId, arr);
    }

    return attendances.map((a) => {
      const empEvents = eventsByEmp.get(a.employeeId) ?? [];
      const last = empEvents.length > 0 ? empEvents[empEvents.length - 1] : null;
      const selfieEventsRaw = empEvents.filter((e) => e.selfiePath);
      const selfieEventIds = selfieEventsRaw.map((e) => e.id);
      const selfieEvents = selfieEventsRaw.map((e) => ({
        id: e.id,
        timestamp: e.timestamp.toISOString(),
        direction: e.direction as 'IN' | 'OUT',
        deviceName: resolveDeviceName(e.deviceName, e.source),
        source: e.source,
      }));
      return {
        ...this.mapAttendance(a),
        lastEvent: last
          ? {
              timestamp: last.timestamp.toISOString(),
              direction: last.direction as 'IN' | 'OUT',
              deviceName: resolveDeviceName(last.deviceName, last.source),
              source: last.source,
            }
          : null,
        selfieEventIds,
        selfieEvents,
      };
    });
  }

  async getRangeAttendance(dateFrom: string, dateTo: string, user: RequestUser, requestedCompanyId?: number) {
    const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
    const startDate = new Date(dateFrom + 'T00:00:00.000Z');
    const endDate = new Date(dateTo + 'T00:00:00.000Z');
    const where: any = { date: { gte: startDate, lte: endDate } };
    if (companyFilter) where.companyId = companyFilter;

    const attendances = await this.prisma.attendance.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true, firstName: true, lastName: true, patronymic: true,
            sortOrder: true,
            department: { select: { name: true, sortOrder: true } },
            position: { select: { name: true } },
          },
        },
      },
      orderBy: { date: 'asc' },
    });

    // Сортируем: отдел.sortOrder → сотрудник.sortOrder → id → дата
    attendances.sort((a, b) => {
      const dA = (a.employee as any)?.department?.sortOrder ?? 0;
      const dB = (b.employee as any)?.department?.sortOrder ?? 0;
      if (dA !== dB) return dA - dB;
      const eA = (a.employee as any)?.sortOrder ?? 0;
      const eB = (b.employee as any)?.sortOrder ?? 0;
      if (eA !== eB) return eA - eB;
      const idDiff = (a.employee as any)?.id - (b.employee as any)?.id;
      if (idDiff !== 0) return idDiff;
      return a.date.getTime() - b.date.getTime();
    });

    return attendances.map((a) => this.mapAttendance(a));
  }

  async getEmployeeAttendance(employeeId: number, month: number, year: number, user: RequestUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    if (!user.isHoldingAdmin && employee.companyId !== user.companyId)
      throw new ForbiddenException('Access denied to this employee');

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

    const [attendances, selfieEvents, hikDevices] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { employeeId, date: { gte: startDate, lte: endDate } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.attendanceEvent.findMany({
        where: {
          employeeId,
          timestamp: { gte: startDate, lte: endDate },
          selfiePath: { not: null },
        },
        select: { id: true, timestamp: true, direction: true, deviceName: true, source: true },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.hikvisionDevice.findMany({
        select: { lastSeenIp: true, officeName: true },
      }),
    ]);

    const ipToName = new Map<string, string>();
    for (const d of hikDevices) {
      if (d.lastSeenIp && d.officeName) ipToName.set(d.lastSeenIp, d.officeName);
    }
    const resolveDevice = (name: string | null): string | null => {
      if (!name) return null;
      const m = name.match(/^Hikvision (\d+\.\d+\.\d+\.\d+)$/);
      return m ? (ipToName.get(m[1]) || name) : name;
    };

    // Group selfie events by UTC date key (YYYY-MM-DD)
    const selfiesByDate = new Map<string, typeof selfieEvents>();
    for (const ev of selfieEvents) {
      const key = ev.timestamp.toISOString().split('T')[0];
      const arr = selfiesByDate.get(key) || [];
      arr.push(ev);
      selfiesByDate.set(key, arr);
    }

    return attendances.map((a) => {
      const dayEvs = selfiesByDate.get(a.date.toISOString().split('T')[0]) || [];
      return {
        ...this.mapAttendance(a),
        selfieEventIds: dayEvs.map((e) => e.id),
        selfieEvents: dayEvs.map((e) => ({
          id: e.id,
          timestamp: e.timestamp.toISOString(),
          direction: e.direction as 'IN' | 'OUT',
          deviceName: resolveDevice(e.deviceName),
          source: e.source,
        })),
      };
    });
  }

  async getSelfiePhoto(eventId: number, user: RequestUser): Promise<{ buffer: Buffer; mimeType: string }> {
    const event = await this.prisma.attendanceEvent.findUnique({
      where: { id: eventId },
      select: { selfiePath: true, companyId: true },
    });
    if (!event || !event.selfiePath) throw new NotFoundException('Фото не найдено');
    if (!user.isHoldingAdmin && event.companyId !== user.companyId)
      throw new ForbiddenException('Нет доступа');

    const fullPath = event.selfiePath.startsWith('storage')
      ? event.selfiePath
      : `storage/${event.selfiePath}`;

    if (!existsSync(fullPath)) throw new NotFoundException('Файл не найден');
    return { buffer: readFileSync(fullPath), mimeType: 'image/jpeg' };
  }

  // ─────────── correction ───────────

  async correctAttendance(
    id: number,
    data: {
      type?: string;
      correctionMinutes?: number;
      time?: string;
      note: string;
      deadline?: string;
    },
    user: RequestUser,
  ) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    if (!attendance) throw new NotFoundException(`Attendance record with ID ${id} not found`);
    if (!user.isHoldingAdmin && attendance.companyId !== user.companyId)
      throw new ForbiddenException('Access denied to this attendance record');

    const type = data.type || 'minutes';
    const deadlineDate = data.deadline ? this.buildDeadlineDate(attendance.date, data.deadline) : null;
    const empName = `${attendance.employee.lastName} ${attendance.employee.firstName}`;
    const dateStr = attendance.date.toISOString().split('T')[0];

    let updated: any;

    if (type === 'manual_in' || type === 'manual_out') {
      // Создаём реальное событие IN или OUT с указанным временем
      const direction = type === 'manual_in' ? 'IN' : 'OUT';
      const eventTime = this.buildDeadlineDate(attendance.date, data.time!);

      await this.prisma.attendanceEvent.create({
        data: {
          employeeId: attendance.employeeId,
          companyId: attendance.companyId,
          timestamp: eventTime,
          direction,
          deviceName: `Ручной ввод — ${user.email}`,
        },
      });

      await this.recalculateDay(attendance.employeeId, eventTime);

      // После пересчёта обновляем поля корректировки (recalculate не трогает их)
      updated = await this.prisma.attendance.update({
        where: { id },
        data: {
          correctedBy: user.email,
          correctionNote: data.note,
          correctionType: type,
          correctionDeadline: deadlineDate,
          correctionDeadlineNotified: false,
        },
      });

      // TG уведомление
      const timeLabel = type === 'manual_in' ? '🟢 Ручной Check-In' : '🔴 Ручной Check-Out';
      await this.telegram.sendMessage(
        `${timeLabel}\n👤 ${empName}\n📅 ${dateStr}  ⏰ ${data.time}\n💬 ${data.note}${data.deadline ? `\n⏳ Срок: до ${data.deadline}` : ''}\n👮 Кадровик: ${user.email}`,
      );
    } else if (type === 'remote') {
      // Вне офиса — только пометка, без событий
      updated = await this.prisma.attendance.update({
        where: { id },
        data: {
          correctedBy: user.email,
          correctionNote: data.note,
          correctionType: 'remote',
          correctionDeadline: deadlineDate,
          correctionDeadlineNotified: false,
        },
      });

      await this.telegram.sendMessage(
        `🏠 Вне офиса\n👤 ${empName}\n📅 ${dateStr}\n💬 ${data.note}${data.deadline ? `\n⏳ Срок: до ${data.deadline}` : ''}\n👮 Кадровик: ${user.email}`,
      );
    } else {
      // Тип 'minutes': и +30 и -30 прибавляют время (знак = смысл, не направление)
      const minutes = data.correctionMinutes || 0;
      const addedMinutes = Math.abs(minutes);
      const newTotal = attendance.totalMinutes + addedMinutes;

      updated = await this.prisma.attendance.update({
        where: { id },
        data: {
          correctionMinutes: attendance.correctionMinutes + addedMinutes,
          totalMinutes: Math.max(0, newTotal),
          correctedBy: user.email,
          correctionNote: data.note,
          correctionType: 'minutes',
          correctionDeadline: deadlineDate,
          correctionDeadlineNotified: false,
        },
      });

      const sign = minutes >= 0 ? '+' : '';
      await this.telegram.sendMessage(
        `✏️ Корректировка времени\n👤 ${empName}\n📅 ${dateStr}  ${sign}${minutes} мин.\n💬 ${data.note}${data.deadline ? `\n⏳ Срок: до ${data.deadline}` : ''}\n👮 Кадровик: ${user.email}`,
      );
    }

    return updated;
  }

  // ─────────── register event ───────────

  async registerEvent(
    data: { employeeId: number; direction: string; officeId?: number; deviceName?: string; note?: string; deadline?: string },
    user: RequestUser,
  ) {
    const employee = await this.prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new NotFoundException(`Employee with ID ${data.employeeId} not found`);
    if (!user.isHoldingAdmin && employee.companyId !== user.companyId)
      throw new ForbiddenException('Access denied to this employee');

    const now = new Date();

    const event = await this.prisma.attendanceEvent.create({
      data: {
        employeeId: data.employeeId,
        companyId: employee.companyId,
        timestamp: now,
        direction: data.direction,
        deviceName: data.deviceName || `Ручной ввод — ${user.email}`,
        officeId: data.officeId || null,
      },
    });

    await this.recalculateDay(data.employeeId, now);

    // Если кадровик добавил комментарий или срок — пишем в attendance
    if (data.note || data.deadline) {
      const dateOnly = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      const deadlineDate = data.deadline ? this.buildDeadlineDate(dateOnly, data.deadline) : null;

      await this.prisma.attendance.update({
        where: { employeeId_date: { employeeId: data.employeeId, date: dateOnly } },
        data: {
          correctionType: 'manual',
          correctedBy: user.email,
          correctionNote: data.note || null,
          correctionDeadline: deadlineDate,
          correctionDeadlineNotified: false,
        },
      });
    }

    // TG уведомление
    const empName = `${employee.lastName} ${employee.firstName}`;
    const dirLabel = data.direction === 'IN' ? '🟢 Check-In' : '🔴 Check-Out';
    const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dushanbe' });
    await this.telegram.sendMessage(
      `${dirLabel} (ручной)\n👤 ${empName}  ⏰ ${timeStr}${data.note ? `\n💬 ${data.note}` : ''}${data.deadline ? `\n⏳ Срок: до ${data.deadline}` : ''}\n👮 ${user.email}`,
    );

    return event;
  }

  // ─────────── deadline checker ───────────

  async checkExpiredDeadlines() {
    const now = new Date();
    const records = await this.prisma.attendance.findMany({
      where: {
        correctionDeadline: { not: null, lte: now },
        correctionDeadlineNotified: false,
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
      },
    });

    for (const record of records) {
      const empName = `${record.employee.lastName} ${record.employee.firstName}`;
      const deadlineStr = record.correctionDeadline!.toLocaleTimeString('ru-RU', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dushanbe',
      });

      await this.telegram.sendMessage(
        `⚠️ Срок корректировки истёк!\n👤 ${empName}\n⏳ Срок был до: ${deadlineStr}\n💬 ${record.correctionNote || '—'}\n📞 Позвоните сотруднику и уточните!`,
      );

      await this.prisma.attendance.update({
        where: { id: record.id },
        data: { correctionDeadlineNotified: true },
      });
    }
  }

  // ─────────── recalculate ───────────

  async recalculateDay(employeeId: number, dateTime: Date) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return;

    const company = await this.prisma.company.findUnique({
      where: { id: employee.companyId },
      select: { lunchBreakStart: true, lunchBreakEnd: true, workDayStart: true, workDayEnd: true },
    });

    const dayStart = new Date(dateTime);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dateTime);
    dayEnd.setHours(23, 59, 59, 999);

    const dateOnly = new Date(Date.UTC(dateTime.getFullYear(), dateTime.getMonth(), dateTime.getDate()));

    const events = await this.prisma.attendanceEvent.findMany({
      where: { employeeId, timestamp: { gte: dayStart, lte: dayEnd } },
      include: { office: { select: { name: true } } },
      orderBy: { timestamp: 'asc' },
    });

    if (events.length === 0) return;

    const inEvents = events.filter((e) => e.direction === 'IN');
    const outEvents = events.filter((e) => e.direction === 'OUT');
    const firstEntry = inEvents.length > 0 ? inEvents[0].timestamp : null;
    const lastExit = outEvents.length > 0 ? outEvents[outEvents.length - 1].timestamp : null;

    let totalMinutes = 0;
    if (firstEntry && lastExit && lastExit > firstEntry) {
      totalMinutes = Math.round((lastExit.getTime() - firstEntry.getTime()) / 60000);

      const lunchStartStr = company?.lunchBreakStart || '12:00';
      const lunchEndStr = company?.lunchBreakEnd || '13:00';
      const [lsh, lsm] = lunchStartStr.split(':').map(Number);
      const [leh, lem] = lunchEndStr.split(':').map(Number);
      const lunchStart = new Date(dateTime); lunchStart.setHours(lsh, lsm, 0, 0);
      const lunchEnd = new Date(dateTime); lunchEnd.setHours(leh, lem, 0, 0);
      const overlapStart = Math.max(firstEntry.getTime(), lunchStart.getTime());
      const overlapEnd = Math.min(lastExit.getTime(), lunchEnd.getTime());
      if (overlapEnd > overlapStart) {
        totalMinutes -= Math.round((overlapEnd - overlapStart) / 60000);
      }
    }

    const officeName = inEvents.length > 0 && inEvents[0].office ? inEvents[0].office.name : null;

    let status = 'present';
    if (events[events.length - 1].direction === 'OUT') status = 'left';

    let isLate = false;
    let isEarlyLeave = false;
    const [wsh, wsm] = (company?.workDayStart || '09:00').split(':').map(Number);
    const [weh, wem] = (company?.workDayEnd || '18:00').split(':').map(Number);
    const workDayStartDt = new Date(dateTime); workDayStartDt.setHours(wsh, wsm, 0, 0);
    const workDayEndDt = new Date(dateTime); workDayEndDt.setHours(weh, wem, 0, 0);
    if (firstEntry) isLate = firstEntry.getTime() > workDayStartDt.getTime();
    if (lastExit) isEarlyLeave = lastExit.getTime() < workDayEndDt.getTime();

    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: dateOnly } },
    });
    const correctionMinutes = existing?.correctionMinutes || 0;

    await this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date: dateOnly } },
      update: { firstEntry, lastExit, totalMinutes: Math.max(0, totalMinutes + correctionMinutes), officeName, status, isLate, isEarlyLeave },
      create: { employeeId, companyId: employee.companyId, date: dateOnly, firstEntry, lastExit, totalMinutes: Math.max(0, totalMinutes), status, officeName, isLate, isEarlyLeave },
    });

    const dateStr = dateOnly.toISOString().split('T')[0];
    this.updates$.next({ companyId: employee.companyId, date: dateStr });
  }
}
