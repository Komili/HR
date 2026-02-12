import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { RequestUser } from '../auth/jwt.strategy';

@Injectable()
export class InventoryService {
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

  private async logHistory(
    inventoryItemId: number,
    action: string,
    performedBy: string,
    details?: string,
    employeeName?: string,
  ) {
    await this.prisma.inventoryHistory.create({
      data: {
        inventoryItemId,
        action,
        details: details || null,
        employeeName: employeeName || null,
        performedBy,
      },
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    user?: RequestUser,
    requestedCompanyId?: number,
  ): Promise<{ data: any[]; total: number }> {
    const where: Prisma.InventoryItemWhereInput = {};

    if (user) {
      const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
      if (companyFilter) {
        where.companyId = companyFilter;
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { model: { contains: search } },
        { inventoryNumber: { contains: search } },
        { category: { contains: search } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          company: true,
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              patronymic: true,
            },
          },
        },
        orderBy: { id: 'desc' },
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: number, user?: RequestUser) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        company: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patronymic: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`Inventory item with ID ${id} not found`);
    }

    if (user && !user.isHoldingAdmin) {
      if (item.companyId !== user.companyId) {
        throw new ForbiddenException('Access denied to this inventory item');
      }
    }

    return item;
  }

  async findByEmployee(employeeId: number, user?: RequestUser) {
    // Verify employee access
    if (user && !user.isHoldingAdmin) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: employeeId },
      });
      if (!employee || employee.companyId !== user.companyId) {
        throw new ForbiddenException('Access denied to this employee');
      }
    }

    return this.prisma.inventoryItem.findMany({
      where: { employeeId },
      include: {
        company: true,
      },
      orderBy: { id: 'desc' },
    });
  }

  async create(data: Prisma.InventoryItemCreateInput, user: RequestUser) {
    const item = await this.prisma.inventoryItem.create({
      data,
      include: {
        company: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patronymic: true,
          },
        },
      },
    });

    const details = [
      `Название: ${item.name}`,
      item.category ? `Категория: ${item.category}` : null,
      item.model ? `Модель: ${item.model}` : null,
      item.inventoryNumber ? `Инв. номер: ${item.inventoryNumber}` : null,
      item.price != null ? `Цена: ${item.price}` : null,
      item.status ? `Статус: ${item.status}` : null,
    ].filter(Boolean).join(', ');

    await this.logHistory(item.id, 'Создан', user.email, details);

    if (item.employee) {
      const empName = `${item.employee.lastName} ${item.employee.firstName}${item.employee.patronymic ? ' ' + item.employee.patronymic : ''}`;
      await this.logHistory(item.id, 'Выдан', user.email, `Выдан сотруднику ${empName}`, empName);
    }

    return item;
  }

  async update(id: number, data: Prisma.InventoryItemUpdateInput, user: RequestUser) {
    const oldItem = await this.findOne(id, user);

    const item = await this.prisma.inventoryItem.update({
      where: { id },
      data,
      include: {
        company: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patronymic: true,
          },
        },
      },
    });

    // Build change details
    const changes: string[] = [];
    if (data.name && data.name !== oldItem.name) changes.push(`Название: "${oldItem.name}" → "${data.name}"`);
    if (data.model !== undefined && data.model !== oldItem.model) changes.push(`Модель: "${oldItem.model || '—'}" → "${data.model || '—'}"`);
    if (data.category !== undefined && data.category !== oldItem.category) changes.push(`Категория: "${oldItem.category || '—'}" → "${data.category || '—'}"`);
    if (data.inventoryNumber !== undefined && data.inventoryNumber !== oldItem.inventoryNumber) changes.push(`Инв. номер: "${oldItem.inventoryNumber || '—'}" → "${data.inventoryNumber || '—'}"`);
    if (data.price !== undefined && data.price !== oldItem.price) changes.push(`Цена: ${oldItem.price ?? '—'} → ${data.price ?? '—'}`);
    if (data.status !== undefined && data.status !== oldItem.status) changes.push(`Статус: "${oldItem.status}" → "${data.status}"`);
    if (data.description !== undefined && data.description !== oldItem.description) changes.push('Описание изменено');

    if (changes.length > 0) {
      await this.logHistory(item.id, 'Изменён', user.email, changes.join('; '));
    }

    return item;
  }

  async remove(id: number, user: RequestUser) {
    const item = await this.findOne(id, user);

    await this.logHistory(item.id, 'Удалён', user.email, `Удалён: ${item.name}`);

    return this.prisma.inventoryItem.delete({
      where: { id },
      include: {
        company: true,
      },
    });
  }

  async assignToEmployee(id: number, employeeId: number, user: RequestUser) {
    const item = await this.findOne(id, user);

    // Verify employee belongs to same company
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    if (!user.isHoldingAdmin && employee.companyId !== user.companyId) {
      throw new ForbiddenException('Cannot assign to employee from another company');
    }

    if (item.companyId !== employee.companyId) {
      throw new ForbiddenException('Inventory item and employee must belong to the same company');
    }

    const result = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        employeeId,
        status: 'Выдан',
      },
      include: {
        company: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patronymic: true,
          },
        },
      },
    });

    const empName = `${employee.lastName} ${employee.firstName}${employee.patronymic ? ' ' + employee.patronymic : ''}`;
    await this.logHistory(item.id, 'Выдан', user.email, `Выдан сотруднику ${empName}`, empName);

    return result;
  }

  async unassignFromEmployee(id: number, user: RequestUser) {
    const item = await this.findOne(id, user);

    // Get previous employee name before unassigning
    let empName: string | undefined;
    if (item.employee) {
      empName = `${item.employee.lastName} ${item.employee.firstName}${item.employee.patronymic ? ' ' + item.employee.patronymic : ''}`;
    }

    const result = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        employeeId: null,
        status: 'В наличии',
      },
      include: {
        company: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patronymic: true,
          },
        },
      },
    });

    if (empName) {
      await this.logHistory(item.id, 'Возвращён', user.email, `Возвращён от ${empName}`, empName);
    }

    return result;
  }

  async getHistory(itemId: number, user: RequestUser) {
    // Verify access to the item
    await this.findOne(itemId, user);

    return this.prisma.inventoryHistory.findMany({
      where: { inventoryItemId: itemId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
