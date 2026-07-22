import { BadRequestException, Injectable, ForbiddenException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { Subject, Observable, filter, map } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { RequestUser } from '../auth/jwt.strategy';
import { getCompanyFilter as sharedGetCompanyFilter, isAuthorizedForCompany } from '../common/company-filter';

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

  private getCompanyFilter(user: RequestUser, requestedCompanyId?: number) {
    return sharedGetCompanyFilter(user, requestedCompanyId);
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
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException('Некорректная дата');
    }

    // 1. Полный список сотрудников (тот же набор и порядок, что и в списке сотрудников):
    //    исключаем заявки (Ожидает/Отклонён) и уволенных.
    const empWhere: any = { status: { notIn: ['Ожидает', 'Отклонён', 'Уволен'] } };
    if (companyFilter) empWhere.companyId = companyFilter;
    const employees = await this.prisma.employee.findMany({
      where: empWhere,
      select: {
        id: true, firstName: true, lastName: true, patronymic: true,
        companyId: true, sortOrder: true,
        department: { select: { name: true, sortOrder: true } },
        position: { select: { name: true } },
      },
    });

    // Сортируем так же как список сотрудников: отдел.sortOrder → сотрудник.sortOrder → id
    employees.sort((a, b) => {
      const dA = (a as any).department?.sortOrder ?? 0;
      const dB = (b as any).department?.sortOrder ?? 0;
      if (dA !== dB) return dA - dB;
      const eA = a.sortOrder ?? 0;
      const eB = b.sortOrder ?? 0;
      if (eA !== eB) return eA - eB;
      return a.id - b.id;
    });

    if (employees.length === 0) return [];

    // 2. Записи посещаемости за день → map по employeeId
    const attWhere: any = { date: targetDate };
    if (companyFilter) attWhere.companyId = companyFilter;
    const attendances = await this.prisma.attendance.findMany({ where: attWhere });
    const attByEmp = new Map<number, (typeof attendances)[number]>();
    for (const a of attendances) attByEmp.set(a.employeeId, a);

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

    // 3. События дня — только для тех, у кого есть запись (у отсутствующих событий нет)
    const employeeIds = attendances.map((a) => a.employeeId);
    const dayEnd = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
    const events = employeeIds.length
      ? await this.prisma.attendanceEvent.findMany({
          where: {
            employeeId: { in: employeeIds },
            timestamp: { gte: targetDate, lt: dayEnd },
          },
          select: {
            id: true, employeeId: true, timestamp: true,
            direction: true, deviceName: true, source: true, selfiePath: true, note: true,
          },
          orderBy: { timestamp: 'asc' },
        })
      : [];

    const eventsByEmp = new Map<number, typeof events>();
    for (const ev of events) {
      const arr = eventsByEmp.get(ev.employeeId) ?? [];
      arr.push(ev);
      eventsByEmp.set(ev.employeeId, arr);
    }

    const dateStr = targetDate.toISOString().split('T')[0];

    // 4. Маппим КАЖДОГО сотрудника: есть запись → реальные данные, нет → «Отсутствует»
    return employees.map((emp) => {
      const a = attByEmp.get(emp.id);

      if (!a) {
        // Отсутствующий — синтетическая запись с отрицательным id (нет строки Attendance)
        return {
          id: -emp.id,
          employeeId: emp.id,
          employeeName: `${emp.lastName} ${emp.firstName}${emp.patronymic ? ' ' + emp.patronymic : ''}`,
          departmentName: emp.department?.name || null,
          positionName: emp.position?.name || null,
          date: dateStr,
          firstEntry: null,
          lastExit: null,
          status: 'absent',
          totalMinutes: 0,
          correctionMinutes: 0,
          correctedBy: null,
          correctionNote: null,
          correctionType: null,
          correctionDeadline: null,
          officeName: null,
          isLate: false,
          isEarlyLeave: false,
          lastEvent: null,
          lastNote: null,
          selfieEventIds: [] as number[],
          selfieEvents: [] as any[],
        };
      }

      const empEvents = eventsByEmp.get(emp.id) ?? [];
      const last = empEvents.length > 0 ? empEvents[empEvents.length - 1] : null;
      const selfieEventsRaw = empEvents.filter((e) => e.selfiePath);
      const selfieEventIds = selfieEventsRaw.map((e) => e.id);
      const selfieEvents = selfieEventsRaw.map((e) => ({
        id: e.id,
        timestamp: e.timestamp.toISOString(),
        direction: e.direction as 'IN' | 'OUT',
        deviceName: resolveDeviceName(e.deviceName, e.source),
        source: e.source,
        note: e.note,
      }));
      // Последний комментарий сотрудника (где / на каком объекте) — берём из самого свежего события с note
      const lastNote = [...empEvents].reverse().find((e) => e.note)?.note ?? null;
      return {
        ...this.mapAttendance({ ...a, employee: emp }),
        lastEvent: last
          ? {
              timestamp: last.timestamp.toISOString(),
              direction: last.direction as 'IN' | 'OUT',
              deviceName: resolveDeviceName(last.deviceName, last.source),
              source: last.source,
              note: last.note,
            }
          : null,
        lastNote,
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

  /**
   * Сводный отчёт по сотрудникам за период.
   * По каждому сотруднику считает: отработанное время, опоздания (дни + минуты),
   * дни без отметки входа/выхода, прогулы (рабочий день без отметок) и переработку.
   * Порог отклонения GRACE_MIN минут (мелкие отклонения игнорируются).
   * Время рабочего дня сравнивается в часовом поясе Душанбе (UTC+5).
   */
  async getRangeReport(dateFrom: string, dateTo: string, user: RequestUser, requestedCompanyId?: number) {
    const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
    const LATE_GRACE_MIN = 15;  // порог опоздания
    const GRACE_MIN = 5;        // порог переработки/раннего ухода
    const TZ_OFFSET_MIN = 300;  // Asia/Dushanbe = UTC+5

    // Минуты от полуночи в местном времени (Душанбе) для UTC-инстанта
    const localMinutes = (d: Date): number =>
      ((d.getUTCHours() * 60 + d.getUTCMinutes()) + TZ_OFFSET_MIN) % 1440;
    const parseHM = (s: string | null | undefined, fallback: number): number => {
      if (!s) return fallback;
      const [h, m] = s.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };

    // 1. Сотрудники (тот же набор, что и в списке: без заявок и уволенных)
    const empWhere: any = { status: { notIn: ['Ожидает', 'Отклонён', 'Уволен'] } };
    if (companyFilter) empWhere.companyId = companyFilter;
    const employees = await this.prisma.employee.findMany({
      where: empWhere,
      select: {
        id: true, firstName: true, lastName: true, patronymic: true,
        companyId: true, sortOrder: true,
        department: { select: { name: true, sortOrder: true } },
        position: { select: { name: true } },
      },
    });
    employees.sort((a, b) => {
      const dA = (a as any).department?.sortOrder ?? 0;
      const dB = (b as any).department?.sortOrder ?? 0;
      if (dA !== dB) return dA - dB;
      const eA = a.sortOrder ?? 0;
      const eB = b.sortOrder ?? 0;
      if (eA !== eB) return eA - eB;
      return a.id - b.id;
    });
    if (employees.length === 0) return { period: { dateFrom, dateTo }, rows: [] };

    // 2. Расписания компаний (рабочее время + рабочие дни недели)
    const companyIds = [...new Set(employees.map((e) => e.companyId))];
    const companies = await this.prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, workDayStart: true, workDayEnd: true, workDays: true },
    });
    const schedById = new Map<number, { startMin: number; endMin: number; days: Set<number> }>();
    for (const c of companies) {
      const days = (c.workDays || '1,2,3,4,5')
        .split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 7);
      schedById.set(c.id, {
        startMin: parseHM(c.workDayStart, 9 * 60),
        endMin: parseHM(c.workDayEnd, 18 * 60),
        days: new Set(days.length ? days : [1, 2, 3, 4, 5]),
      });
    }

    // 3. Записи посещаемости за период → map empId → (dateKey → att)
    const startDate = new Date(dateFrom + 'T00:00:00.000Z');
    const endDate = new Date(dateTo + 'T00:00:00.000Z');
    const attWhere: any = { date: { gte: startDate, lte: endDate } };
    if (companyFilter) attWhere.companyId = companyFilter;
    const attendances = await this.prisma.attendance.findMany({
      where: attWhere,
      select: { employeeId: true, date: true, firstEntry: true, lastExit: true, totalMinutes: true },
    });
    const attByEmp = new Map<number, Map<string, (typeof attendances)[number]>>();
    for (const a of attendances) {
      const key = a.date.toISOString().split('T')[0];
      let m = attByEmp.get(a.employeeId);
      if (!m) { m = new Map(); attByEmp.set(a.employeeId, m); }
      m.set(key, a);
    }

    // 4. Список всех календарных дат периода (UTC-полночь) + ISO-день недели
    const days: { key: string; iso: number }[] = [];
    for (let t = startDate.getTime(); t <= endDate.getTime(); t += 86400000) {
      const d = new Date(t);
      const wd = d.getUTCDay(); // 0=Вс..6=Сб
      days.push({ key: d.toISOString().split('T')[0], iso: wd === 0 ? 7 : wd });
    }

    // 5. Агрегация по каждому сотруднику
    const rows = employees.map((emp) => {
      const sched = schedById.get(emp.companyId) || { startMin: 540, endMin: 1080, days: new Set([1, 2, 3, 4, 5]) };
      const attMap = attByEmp.get(emp.id) || new Map();

      let workedMinutes = 0;
      let presentDays = 0;
      let workingDays = 0;
      let absentDays = 0;
      let lateDays = 0, lateMinutes = 0;
      let earlyLeaveDays = 0, earlyLeaveMinutes = 0;
      let missingInDays = 0, missingOutDays = 0;
      let overworkDays = 0, overworkMinutes = 0;

      for (const day of days) {
        const isWorkingDay = sched.days.has(day.iso);
        const att = attMap.get(day.key);

        if (isWorkingDay) workingDays++;

        if (!att) {
          if (isWorkingDay) absentDays++; // прогул — рабочий день без отметок
          continue;
        }

        // Сотрудник отметился (запись существует)
        presentDays++;
        workedMinutes += att.totalMinutes;

        const hasIn = !!att.firstEntry;
        const hasOut = !!att.lastExit;
        if (!hasIn) missingInDays++;
        if (!hasOut) missingOutDays++;

        let dayOver = 0;

        if (isWorkingDay) {
          if (hasIn) {
            const inMin = localMinutes(att.firstEntry!);
            const late = inMin - sched.startMin;
            if (late > LATE_GRACE_MIN) { lateDays++; lateMinutes += late; }
            const before = sched.startMin - inMin; // пришёл раньше начала
            if (before > GRACE_MIN) dayOver += before;
          }
          if (hasOut) {
            const outMin = localMinutes(att.lastExit!);
            const early = sched.endMin - outMin;
            if (early > GRACE_MIN) { earlyLeaveDays++; earlyLeaveMinutes += early; }
            const after = outMin - sched.endMin; // ушёл позже конца
            if (after > GRACE_MIN) dayOver += after;
          }
        } else {
          // Работа в выходной/нерабочий день — целиком переработка
          if (att.totalMinutes > GRACE_MIN) dayOver += att.totalMinutes;
        }

        if (dayOver > 0) { overworkDays++; overworkMinutes += dayOver; }
      }

      return {
        employeeId: emp.id,
        employeeName: `${emp.lastName} ${emp.firstName}${emp.patronymic ? ' ' + emp.patronymic : ''}`,
        departmentName: (emp as any).department?.name || null,
        positionName: (emp as any).position?.name || null,
        workedMinutes,
        presentDays,
        workingDays,
        absentDays,
        lateDays,
        lateMinutes,
        missingInDays,
        missingOutDays,
        earlyLeaveDays,
        earlyLeaveMinutes,
        overworkDays,
        overworkMinutes,
      };
    });

    return { period: { dateFrom, dateTo }, rows };
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
      await this.telegram.notify(
        'correction',
        `${timeLabel}\n👤 ${empName}\n📅 ${dateStr}  ⏰ ${data.time}\n💬 ${data.note}${data.deadline ? `\n⏳ Срок: до ${data.deadline}` : ''}\n👮 Кадровик: ${user.email}`,
        { companyId: attendance.companyId },
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

      await this.telegram.notify(
        'correction',
        `🏠 Вне офиса\n👤 ${empName}\n📅 ${dateStr}\n💬 ${data.note}${data.deadline ? `\n⏳ Срок: до ${data.deadline}` : ''}\n👮 Кадровик: ${user.email}`,
        { companyId: attendance.companyId },
      );
    } else {
      // 'minutes_offsite' (работал вне офиса до прихода) и 'minutes_excused' (отлучался по делам)
      // — оба физически добавляют отработанное время, разница только в причине.
      // Причина сохраняется как знак correctionMinutes (для наглядного индикатора в таблице),
      // но на totalMinutes всегда влияет только модуль — минус НЕ вычитает время.
      const isOffsite = type === 'minutes_offsite';
      const magnitude = Math.abs(data.correctionMinutes || 0);
      const signedDelta = isOffsite ? -magnitude : magnitude;
      const newTotal = attendance.totalMinutes + magnitude;

      updated = await this.prisma.attendance.update({
        where: { id },
        data: {
          correctionMinutes: attendance.correctionMinutes + signedDelta,
          totalMinutes: Math.max(0, newTotal),
          correctedBy: user.email,
          correctionNote: data.note,
          correctionType: isOffsite ? 'minutes_offsite' : 'minutes_excused',
          correctionDeadline: null,
          correctionDeadlineNotified: false,
        },
      });

      const reasonLabel = isOffsite ? '🏗 Работал вне офиса' : '🚶 Отлучался по делам';
      await this.telegram.notify(
        'correction',
        `✏️ Корректировка времени\n${reasonLabel}\n👤 ${empName}\n📅 ${dateStr}  +${magnitude} мин.\n💬 ${data.note}\n👮 Кадровик: ${user.email}`,
        { companyId: attendance.companyId },
      );
    }

    return updated;
  }

  // ─────────── register event ───────────

  async registerEvent(
    data: { employeeId: number; direction: string; officeId?: number; deviceName?: string; note?: string; deadline?: string; date?: string; time?: string },
    user: RequestUser,
  ) {
    const employee = await this.prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new NotFoundException(`Employee with ID ${data.employeeId} not found`);
    if (!user.isHoldingAdmin && employee.companyId !== user.companyId)
      throw new ForbiddenException('Access denied to this employee');

    // Время события: если переданы дата+время — берём их, иначе текущий момент
    const timestamp = (data.date && data.time)
      ? this.buildDeadlineDate(new Date(data.date + 'T00:00:00'), data.time)
      : new Date();

    const event = await this.prisma.attendanceEvent.create({
      data: {
        employeeId: data.employeeId,
        companyId: employee.companyId,
        timestamp,
        direction: data.direction,
        deviceName: data.deviceName || `Ручной ввод — ${user.email}`,
        officeId: data.officeId || null,
      },
    });

    await this.recalculateDay(data.employeeId, timestamp);

    // Если кадровик добавил комментарий или срок — пишем в attendance
    if (data.note || data.deadline) {
      const dateOnly = new Date(Date.UTC(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate()));
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
    const timeStr = timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dushanbe' });
    await this.telegram.notify(
      'correction',
      `${dirLabel} (ручной)\n👤 ${empName}  ⏰ ${timeStr}${data.note ? `\n💬 ${data.note}` : ''}${data.deadline ? `\n⏳ Срок: до ${data.deadline}` : ''}\n👮 ${user.email}`,
      { companyId: employee.companyId },
    );

    return event;
  }

  // ─────────── excused (отпросился) ───────────

  /**
   * Пометить день как уважительный («отпросился»):
   *  - mode='left'   — отпросился и ушёл (если указано время — создаётся событие OUT)
   *  - mode='absent' — отпросился и не пришёл (запись дня без событий, не считается прогулом)
   */
  async markExcused(
    data: { employeeId: number; date: string; mode: 'left' | 'absent'; note: string; time?: string },
    user: RequestUser,
  ) {
    const employee = await this.prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new NotFoundException(`Employee with ID ${data.employeeId} not found`);
    if (!user.isHoldingAdmin && employee.companyId !== user.companyId)
      throw new ForbiddenException('Access denied to this employee');

    const [y, m, d] = data.date.split('-').map(Number);
    const dateOnly = new Date(Date.UTC(y, m - 1, d));
    const correctionType = data.mode === 'left' ? 'excused_left' : 'excused_absent';

    // «Отпросился и ушёл» с указанным временем — фиксируем уход событием OUT и пересчитываем день
    if (data.mode === 'left' && data.time) {
      const ts = this.buildDeadlineDate(new Date(`${data.date}T00:00:00`), data.time);
      await this.prisma.attendanceEvent.create({
        data: {
          employeeId: data.employeeId,
          companyId: employee.companyId,
          timestamp: ts,
          direction: 'OUT',
          deviceName: `Отпросился — ${user.email}`,
        },
      });
      await this.recalculateDay(data.employeeId, ts);
    }

    await this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: data.employeeId, date: dateOnly } },
      update: {
        status: 'excused',
        correctionType,
        correctedBy: user.email,
        correctionNote: data.note,
        correctionDeadline: null,
        correctionDeadlineNotified: false,
      },
      create: {
        employeeId: data.employeeId,
        companyId: employee.companyId,
        date: dateOnly,
        status: 'excused',
        totalMinutes: 0,
        firstEntry: null,
        lastExit: null,
        correctionType,
        correctedBy: user.email,
        correctionNote: data.note,
      },
    });

    const empName = `${employee.lastName} ${employee.firstName}`;
    const label = data.mode === 'left' ? '🟡 Отпросился и ушёл' : '🟡 Отпросился (не пришёл)';
    await this.telegram.notify(
      'correction',
      `${label}\n👤 ${empName}\n📅 ${data.date}${data.mode === 'left' && data.time ? `  ⏰ ${data.time}` : ''}\n💬 ${data.note}\n👮 ${user.email}`,
      { companyId: employee.companyId },
    );

    this.updates$.next({ companyId: employee.companyId, date: data.date });
    return { ok: true };
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

      await this.telegram.notify(
        'correction',
        `⚠️ Срок корректировки истёк!\n👤 ${empName}\n⏳ Срок был до: ${deadlineStr}\n💬 ${record.correctionNote || '—'}\n📞 Позвоните сотруднику и уточните!`,
        { companyId: record.companyId },
      );

      await this.prisma.attendance.update({
        where: { id: record.id },
        data: { correctionDeadlineNotified: true },
      });
    }
  }

  // ─────────── auto-направление (первое событие дня — вход, остальные — выход) ───────────

  /** Начало календарного дня в Душанбе (UTC+5) для заданного момента времени. */
  getDayStart(date: Date): Date {
    const tzOffset = 5 * 60 * 60 * 1000;
    const local = new Date(date.getTime() + tzOffset);
    return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - tzOffset);
  }

  /**
   * Автоматическое направление события: если у сотрудника ещё не было ни одного события
   * посещаемости сегодня (по любому источнику, устройству, офису или компании) — это вход,
   * иначе — выход. Используется мобильным чек-ином и Hikvision-устройствами в режиме "Один FaceID".
   */
  async resolveAutoDirection(employeeId: number, timestamp: Date): Promise<'IN' | 'OUT'> {
    const dayStart = this.getDayStart(timestamp);
    const anyEventToday = await this.prisma.attendanceEvent.findFirst({
      where: { employeeId, timestamp: { gte: dayStart } },
    });
    return anyEventToday ? 'OUT' : 'IN';
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
