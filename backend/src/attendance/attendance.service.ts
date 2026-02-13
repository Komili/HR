import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/jwt.strategy';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  private getCompanyFilter(user: RequestUser, requestedCompanyId?: number): number | undefined {
    if (user.isHoldingAdmin) {
      return requestedCompanyId || undefined;
    }
    if (!user.companyId) {
      throw new ForbiddenException('User is not assigned to any company');
    }
    return user.companyId;
  }

  async getDailyAttendance(date: string, user: RequestUser, requestedCompanyId?: number) {
    const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
    const targetDate = new Date(date + 'T00:00:00.000Z');

    const where: any = { date: targetDate };
    if (companyFilter) {
      where.companyId = companyFilter;
    }

    const attendances = await this.prisma.attendance.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patronymic: true,
            department: { select: { name: true } },
            position: { select: { name: true } },
          },
        },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    return attendances.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      employeeName: `${a.employee.lastName} ${a.employee.firstName}${a.employee.patronymic ? ' ' + a.employee.patronymic : ''}`,
      departmentName: a.employee.department?.name || null,
      positionName: a.employee.position?.name || null,
      date: a.date.toISOString().split('T')[0],
      firstEntry: a.firstEntry ? a.firstEntry.toISOString() : null,
      lastExit: a.lastExit ? a.lastExit.toISOString() : null,
      status: a.status,
      totalMinutes: a.totalMinutes,
      correctionMinutes: a.correctionMinutes,
      correctedBy: a.correctedBy,
      correctionNote: a.correctionNote,
      officeName: a.officeName,
    }));
  }

  async getRangeAttendance(dateFrom: string, dateTo: string, user: RequestUser, requestedCompanyId?: number) {
    const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
    const startDate = new Date(dateFrom + 'T00:00:00.000Z');
    const endDate = new Date(dateTo + 'T00:00:00.000Z');

    const where: any = { date: { gte: startDate, lte: endDate } };
    if (companyFilter) {
      where.companyId = companyFilter;
    }

    const attendances = await this.prisma.attendance.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patronymic: true,
            department: { select: { name: true } },
            position: { select: { name: true } },
          },
        },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { date: 'asc' }],
    });

    return attendances.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      employeeName: `${a.employee.lastName} ${a.employee.firstName}${a.employee.patronymic ? ' ' + a.employee.patronymic : ''}`,
      departmentName: a.employee.department?.name || null,
      positionName: a.employee.position?.name || null,
      date: a.date.toISOString().split('T')[0],
      firstEntry: a.firstEntry ? a.firstEntry.toISOString() : null,
      lastExit: a.lastExit ? a.lastExit.toISOString() : null,
      status: a.status,
      totalMinutes: a.totalMinutes,
      correctionMinutes: a.correctionMinutes,
      correctedBy: a.correctedBy,
      correctionNote: a.correctionNote,
      officeName: a.officeName,
    }));
  }

  async getEmployeeAttendance(employeeId: number, month: number, year: number, user: RequestUser) {
    // Verify access
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }
    if (!user.isHoldingAdmin && employee.companyId !== user.companyId) {
      throw new ForbiddenException('Access denied to this employee');
    }

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0)); // last day of month

    const attendances = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
    });

    return attendances.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      date: a.date.toISOString().split('T')[0],
      firstEntry: a.firstEntry ? a.firstEntry.toISOString() : null,
      lastExit: a.lastExit ? a.lastExit.toISOString() : null,
      status: a.status,
      totalMinutes: a.totalMinutes,
      correctionMinutes: a.correctionMinutes,
      correctedBy: a.correctedBy,
      correctionNote: a.correctionNote,
      officeName: a.officeName,
    }));
  }

  async correctAttendance(id: number, data: { correctionMinutes: number; note: string }, user: RequestUser) {
    const attendance = await this.prisma.attendance.findUnique({ where: { id } });
    if (!attendance) {
      throw new NotFoundException(`Attendance record with ID ${id} not found`);
    }

    if (!user.isHoldingAdmin && attendance.companyId !== user.companyId) {
      throw new ForbiddenException('Access denied to this attendance record');
    }

    const newTotalMinutes = attendance.totalMinutes + data.correctionMinutes;

    return this.prisma.attendance.update({
      where: { id },
      data: {
        correctionMinutes: attendance.correctionMinutes + data.correctionMinutes,
        totalMinutes: Math.max(0, newTotalMinutes),
        correctedBy: user.email,
        correctionNote: data.note,
      },
    });
  }

  async registerEvent(
    data: { employeeId: number; direction: string; officeId?: number; deviceName?: string },
    user: RequestUser,
  ) {
    const employee = await this.prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${data.employeeId} not found`);
    }

    if (!user.isHoldingAdmin && employee.companyId !== user.companyId) {
      throw new ForbiddenException('Access denied to this employee');
    }

    const now = new Date();

    const event = await this.prisma.attendanceEvent.create({
      data: {
        employeeId: data.employeeId,
        companyId: employee.companyId,
        timestamp: now,
        direction: data.direction,
        deviceName: data.deviceName || null,
        officeId: data.officeId || null,
      },
    });

    // Recalculate daily attendance
    await this.recalculateDay(data.employeeId, now);

    return event;
  }

  private async recalculateDay(employeeId: number, dateTime: Date) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return;

    // Start/end of the day
    const dayStart = new Date(dateTime);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dateTime);
    dayEnd.setHours(23, 59, 59, 999);

    const dateOnly = new Date(Date.UTC(dateTime.getFullYear(), dateTime.getMonth(), dateTime.getDate()));

    const events = await this.prisma.attendanceEvent.findMany({
      where: {
        employeeId,
        timestamp: { gte: dayStart, lte: dayEnd },
      },
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
    }

    // Office from first IN event
    const officeName = inEvents.length > 0 && inEvents[0].office
      ? inEvents[0].office.name
      : null;

    // Determine status
    let status = 'present';
    if (lastExit && !firstEntry) {
      status = 'left';
    } else if (lastExit && firstEntry) {
      // If person left and there are OUT events, check if the last event is OUT
      const lastEvent = events[events.length - 1];
      if (lastEvent.direction === 'OUT') {
        status = 'left';
      }
    }

    // Get existing record for correction preservation
    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: dateOnly } },
    });

    const correctionMinutes = existing?.correctionMinutes || 0;

    await this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date: dateOnly } },
      update: {
        firstEntry,
        lastExit,
        totalMinutes: Math.max(0, totalMinutes + correctionMinutes),
        officeName,
        status,
      },
      create: {
        employeeId,
        companyId: employee.companyId,
        date: dateOnly,
        firstEntry,
        lastExit,
        totalMinutes: Math.max(0, totalMinutes),
        status,
        officeName,
      },
    });
  }
}
