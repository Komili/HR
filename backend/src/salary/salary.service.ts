import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/jwt.strategy';

@Injectable()
export class SalaryService {
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

  // Получить зарплатную ведомость за месяц
  async findAll(month: number, year: number, user: RequestUser, requestedCompanyId?: number) {
    const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
    const where: any = { month, year };
    if (companyFilter) where.companyId = companyFilter;

    return this.prisma.salary.findMany({
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
            salary: true,
          },
        },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });
  }

  // Получить зарплату конкретного сотрудника за год
  async findByEmployee(employeeId: number, year: number, user: RequestUser) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');

    if (!user.isHoldingAdmin && user.companyId !== employee.companyId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.salary.findMany({
      where: { employeeId, year },
      orderBy: { month: 'asc' },
    });
  }

  // Рассчитать зарплаты за месяц (на основе посещаемости)
  async calculate(month: number, year: number, user: RequestUser, requestedCompanyId?: number) {
    const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
    if (!companyFilter) throw new ForbiddenException('Company ID is required');

    // Получить всех сотрудников компании
    const employees = await this.prisma.employee.findMany({
      where: { companyId: companyFilter, status: 'Активен' },
      select: { id: true, firstName: true, lastName: true, salary: true, companyId: true },
    });

    // Подсчитать рабочие дни в месяце (пн-пт)
    const totalWorkDays = this.getWorkDaysInMonth(month, year);

    // Получить данные посещаемости за месяц
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const results: any[] = [];

    for (const emp of employees) {
      // Считаем дни присутствия
      const attendanceRecords = await this.prisma.attendance.findMany({
        where: {
          employeeId: emp.id,
          date: { gte: startDate, lte: endDate },
          status: { in: ['present', 'left'] },
        },
      });

      const workedDays = attendanceRecords.length;
      const workedMinutes = attendanceRecords.reduce((sum, a) => sum + a.totalMinutes, 0);
      const baseSalary = emp.salary || 0;

      // Пропорциональный расчёт: (оклад / рабочих дней) * отработанных дней
      const calculatedAmount = totalWorkDays > 0
        ? Math.round((baseSalary / totalWorkDays) * workedDays * 100) / 100
        : 0;

      // Проверяем существующую запись
      const existing = await this.prisma.salary.findUnique({
        where: { employeeId_month_year: { employeeId: emp.id, month, year } },
      });

      const data = {
        employeeId: emp.id,
        companyId: emp.companyId,
        month,
        year,
        baseSalary,
        workedDays,
        totalDays: totalWorkDays,
        workedHours: workedMinutes,
        bonus: existing?.bonus || 0,
        deduction: existing?.deduction || 0,
        totalAmount: calculatedAmount + (existing?.bonus || 0) - (existing?.deduction || 0),
        calculatedBy: user.email,
      };

      const record = existing
        ? await this.prisma.salary.update({ where: { id: existing.id }, data })
        : await this.prisma.salary.create({ data });

      results.push(record);
    }

    return { calculated: results.length, month, year };
  }

  // Обновить запись (премия/удержание/примечание)
  async update(id: number, data: { bonus?: number; deduction?: number; note?: string }, user: RequestUser) {
    const salary = await this.prisma.salary.findUnique({ where: { id } });
    if (!salary) throw new NotFoundException('Salary record not found');

    if (!user.isHoldingAdmin && user.companyId !== salary.companyId) {
      throw new ForbiddenException('Access denied');
    }

    const bonus = data.bonus !== undefined ? data.bonus : salary.bonus;
    const deduction = data.deduction !== undefined ? data.deduction : salary.deduction;
    const basePay = salary.totalDays > 0
      ? Math.round((salary.baseSalary / salary.totalDays) * salary.workedDays * 100) / 100
      : 0;

    return this.prisma.salary.update({
      where: { id },
      data: {
        bonus,
        deduction,
        note: data.note !== undefined ? data.note : salary.note,
        totalAmount: basePay + bonus - deduction,
        calculatedBy: user.email,
      },
    });
  }

  private getWorkDaysInMonth(month: number, year: number): number {
    let count = 0;
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dow = new Date(year, month - 1, day).getDay();
      if (dow !== 0 && dow !== 6) count++;
    }
    return count;
  }
}
