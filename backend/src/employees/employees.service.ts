import { Injectable, ForbiddenException, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { getCompanyFilter as sharedGetCompanyFilter, isAuthorizedForCompany } from '../common/company-filter';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { Prisma } from '@prisma/client';
import * as fs from 'fs/promises';
import { createReadStream, existsSync, readFileSync, statSync } from 'fs';
import * as path from 'path';
import sharp = require('sharp');
import { RequestUser } from '../auth/jwt.strategy';
import { searchVariants, toFolderName } from '../common/transliterate';

// Статусы при которых Face ID автоматически отзывается
const REVOKE_STATUSES = ['Уволен', 'Декрет', 'В отпуске', 'Больничный'];

type EmployeeWithRelations = Prisma.EmployeeGetPayload<{
  include: { department: true; position: true; company: true; documents: { select: { type: true } } };
}>;

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  private getCompanyFilter(user: RequestUser, requestedCompanyId?: number) {
    return sharedGetCompanyFilter(user, requestedCompanyId);
  }

  /**
   * Ищет по всему холдингу сотрудников, похожих на переданные данные —
   * по телефону (сильный признак) или по совпадению ФИ (слабый признак).
   * На создании сотрудника паспорт/ИНН ещё не заполняются, поэтому опираемся
   * на то, что реально вводится в форме.
   */
  async findDuplicates(input: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
  }, excludeId?: number) {
    const orConditions: Prisma.EmployeeWhereInput[] = [];

    if (input.phone) {
      const digits = input.phone.replace(/\D/g, '');
      if (digits.length >= 9) {
        orConditions.push({ phone: { contains: digits.slice(-9) } });
      }
    }
    if (input.email) {
      orConditions.push({ email: input.email });
    }
    if (input.firstName && input.lastName) {
      orConditions.push({ firstName: input.firstName, lastName: input.lastName });
    }

    if (orConditions.length === 0) return [];

    return this.prisma.employee.findMany({
      where: {
        OR: orConditions,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        patronymic: true,
        status: true,
        phone: true,
        email: true,
        company: { select: { id: true, name: true } },
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
      take: 10,
    });
  }

  async create(data: Prisma.EmployeeCreateInput, user: RequestUser, force = false): Promise<EmployeeWithRelations> {
    // Проверяем, что пользователь имеет право создавать сотрудников
    const companyId = this.getCompanyFilter(user);

    if (!companyId && !user.isHoldingAdmin) {
      throw new ForbiddenException('Cannot create employee without company context');
    }

    if (!force) {
      const duplicates = await this.findDuplicates({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone as string | undefined,
        email: data.email as string | undefined,
      });
      if (duplicates.length > 0) {
        throw new ConflictException({
          message: 'Похоже, такой сотрудник уже есть в системе',
          code: 'POSSIBLE_DUPLICATE',
          duplicates,
        });
      }
    }

    const employee = await this.prisma.employee.create({
      data,
      include: {
        department: true,
        position: true,
        company: true,
        documents: { select: { type: true } },
      },
    });

    // Создаём папку для документов сотрудника
    await this.createEmployeeFolder(employee);

    // Telegram-уведомление о добавлении (категория employee)
    try {
      const fullName = `${employee.lastName} ${employee.firstName}${employee.patronymic ? ' ' + employee.patronymic : ''}`;
      await this.telegram.notify(
        'employee',
        `➕ <b>Новый сотрудник</b>\n` +
        `👤 <b>${fullName}</b>\n` +
        `🏢 ${employee.company?.name || '—'}\n` +
        (employee.department?.name ? `🗂 Отдел: ${employee.department.name}\n` : '') +
        (employee.position?.name ? `💼 Должность: ${employee.position.name}\n` : '') +
        `👮 Добавил: ${user.email}`,
        { companyId: employee.companyId },
      );
    } catch { /* уведомление не критично */ }

    return employee;
  }

  /**
   * Имя папки сотрудника — только числовой ID.
   * Никогда не меняется при переименовании сотрудника → нет дублей.
   */
  static employeeDirName(employee: { id: number; phone?: string | null }): string {
    if (employee.phone) {
      const digits = employee.phone.replace(/\D/g, '');
      if (digits.length >= 9) return digits;
    }
    return String(employee.id);
  }

  /** Санитизация имени компании для файловой системы: транслитерация + безопасные символы. */
  static sanitizeCompany(value: string): string {
    return toFolderName(value || 'unknown');
  }

  private async createEmployeeFolder(employee: EmployeeWithRelations): Promise<string> {
    const companyFolder = EmployeesService.sanitizeCompany(employee.company?.name || 'unknown');
    const employeeDir = EmployeesService.employeeDirName(employee);
    const targetDir = path.join('storage', 'companies', companyFolder, 'employees', employeeDir, 'docs');
    await fs.mkdir(targetDir, { recursive: true });
    return targetDir;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    user?: RequestUser,
    requestedCompanyId?: number,
  ): Promise<{ data: EmployeeWithRelations[]; total: number }> {
    const where: Prisma.EmployeeWhereInput = {};

    // Фильтрация по компании
    if (user) {
      const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
      if (companyFilter) {
        where.companyId = companyFilter;
      }
    }

    // По умолчанию исключаем заявки (Ожидает/Отклонён) из общего списка
    where.status = { notIn: ['Ожидает', 'Отклонён'] };

    if (search) {
      const words = search.trim().split(/\s+/).filter(Boolean);
      const wordConditions = words.map((word) => {
        const variants = searchVariants(word);
        return {
          OR: variants.flatMap((v) => [
            { firstName: { contains: v } },
            { lastName: { contains: v } },
            { patronymic: { contains: v } },
            { latinFirstName: { contains: v } },
            { latinLastName: { contains: v } },
          ]),
        };
      });
      if (wordConditions.length === 1) {
        where.OR = wordConditions[0].OR;
      } else {
        where.AND = [...(where.AND as any[] || []), ...wordConditions];
      }
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          department: true,
          position: true,
          company: true,
          documents: { select: { type: true } },
        },
        orderBy: [
          { department: { sortOrder: 'asc' } },
          { sortOrder: 'asc' },
          { id: 'asc' },
        ],
      }),
      this.prisma.employee.count({ where }),
    ]);

    return { data, total };
  }

  async findPending(user: RequestUser, requestedCompanyId?: number): Promise<EmployeeWithRelations[]> {
    const where: Prisma.EmployeeWhereInput = { status: 'Ожидает' };
    const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
    if (companyFilter) where.companyId = companyFilter;

    return this.prisma.employee.findMany({
      where,
      include: { department: true, position: true, company: true, documents: { select: { type: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveRegistration(
    id: number,
    updates: { departmentId?: number; positionId?: number },
    user: RequestUser,
    force = false,
  ): Promise<EmployeeWithRelations> {
    const employee = await this.findOne(id, user);
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    if (employee.status !== 'Ожидает') throw new BadRequestException('Заявка уже обработана');

    if (!force) {
      const duplicates = await this.findDuplicates(
        {
          firstName: employee.firstName,
          lastName: employee.lastName,
          phone: employee.phone ?? undefined,
          email: employee.email ?? undefined,
        },
        id,
      );
      if (duplicates.length > 0) {
        throw new ConflictException({
          message: 'Похоже, такой сотрудник уже есть в системе',
          code: 'POSSIBLE_DUPLICATE',
          duplicates,
        });
      }
    }

    return this.update(
      id,
      {
        status: 'Активен',
        ...(updates.departmentId ? { department: { connect: { id: updates.departmentId } } } : {}),
        ...(updates.positionId ? { position: { connect: { id: updates.positionId } } } : {}),
      },
      user,
    );
  }

  async rejectRegistration(id: number, user: RequestUser): Promise<EmployeeWithRelations> {
    const employee = await this.findOne(id, user);
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    if (employee.status !== 'Ожидает') throw new BadRequestException('Заявка уже обработана');

    return this.update(id, { status: 'Отклонён' }, user);
  }

  async reorderEmployees(items: { id: number; sortOrder: number }[]): Promise<void> {
    await this.prisma.$transaction(
      items.map(({ id, sortOrder }) =>
        this.prisma.employee.update({ where: { id }, data: { sortOrder } }),
      ),
    );
  }

  async findOne(id: number, user?: RequestUser): Promise<EmployeeWithRelations | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        position: true,
        company: true,
        documents: { select: { type: true } },
      },
    });

    // Проверяем доступ к сотруднику
    if (employee && user && !isAuthorizedForCompany(user, employee.companyId)) {
      throw new ForbiddenException('Access denied to this employee');
    }

    return employee;
  }

  async update(id: number, data: Prisma.EmployeeUpdateInput, user?: RequestUser): Promise<EmployeeWithRelations> {
    if (user) {
      await this.findOne(id, user);
    }

    // Перед обновлением читаем текущий статус
    const newStatus = typeof data.status === 'string' ? data.status : null;
    let oldStatus: string | null = null;
    if (newStatus) {
      const cur = await this.prisma.employee.findUnique({ where: { id }, select: { status: true } });
      oldStatus = cur?.status ?? null;
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data,
      include: {
        department: true,
        position: true,
        company: true,
        documents: { select: { type: true } },
      },
    });

    // Автоотзыв Face ID при переходе в неактивный статус
    if (
      newStatus &&
      oldStatus !== newStatus &&
      REVOKE_STATUSES.includes(newStatus) &&
      !REVOKE_STATUSES.includes(oldStatus ?? '')
    ) {
      this.revokeHikvisionOnStatusChange(updated, newStatus).catch(e =>
        this.logger.error(`Ошибка автоотзыва Face ID для сотрудника #${id}: ${e.message}`),
      );
    }

    return updated;
  }

  private async revokeHikvisionOnStatusChange(
    employee: { id: number; firstName: string; lastName: string },
    newStatus: string,
  ): Promise<void> {
    // 1. Явные доступы, выданные через приложение (GRANT)
    const accesses = await this.prisma.hikvisionAccess.findMany({
      where: { employeeId: employee.id },
      include: { device: { select: { id: true, officeName: true, direction: true, companyId: true } } },
    });
    const knownDeviceIds = new Set(accesses.map(a => a.device.id));

    // 2. Устройства, где лицо сотрудника реально распознавалось (Face ID),
    // даже если в приложении никогда не оформлялся явный доступ — иначе
    // такие устройства "молча" остаются открытыми после увольнения
    const eventDevices = await this.prisma.attendanceEvent.findMany({
      where: { employeeId: employee.id, source: 'HIKVISION', deviceName: { not: null } },
      distinct: ['deviceName'],
      select: { deviceName: true },
    });
    const deviceNames = eventDevices.map(e => e.deviceName!).filter(Boolean);

    const extraDevices = deviceNames.length
      ? await this.prisma.hikvisionDevice.findMany({
          where: {
            status: 'active',
            id: { notIn: [...knownDeviceIds] },
            OR: [{ officeName: { in: deviceNames } }, { deviceName: { in: deviceNames } }],
          },
          select: { id: true, officeName: true, direction: true, companyId: true },
        })
      : [];

    const totalCount = accesses.length + extraDevices.length;
    if (totalCount === 0) return;

    const fullName = `${employee.lastName} ${employee.firstName}`;
    this.logger.log(`Автоотзыв Face ID: ${fullName} → "${newStatus}" (${totalCount} устройств)`);

    // Удаляем явные записи доступа и ставим команды на отзыв для всех найденных устройств
    if (accesses.length > 0) {
      await this.prisma.hikvisionAccess.deleteMany({ where: { employeeId: employee.id } });
    }

    await this.prisma.hikvisionCommand.createMany({
      data: [
        ...accesses.map(a => ({ deviceId: a.device.id, employeeId: employee.id, action: 'revoke' })),
        ...extraDevices.map(d => ({ deviceId: d.id, employeeId: employee.id, action: 'revoke' })),
      ],
    });

    const deviceList = [
      ...accesses.map(a => `• ${a.device.officeName || `Устройство #${a.device.id}`} (${a.device.direction === 'IN' ? 'Вход' : 'Выход'})`),
      ...extraDevices.map(d => `• ${d.officeName || `Устройство #${d.id}`} (${d.direction === 'IN' ? 'Вход' : 'Выход'}, по журналу событий)`),
    ].join('\n');

    const notifyCompanyId = accesses[0]?.device.companyId ?? extraDevices[0]?.companyId ?? null;

    await this.telegram.notify(
      'access',
      `🔒 <b>Face ID автоматически отозван</b>\n\n` +
      `👤 <b>${fullName}</b>\n` +
      `📋 Новый статус: <b>${newStatus}</b>\n\n` +
      `🚪 Устройства (${totalCount}):\n${deviceList}\n\n` +
      `🤖 Relay-агент выполнит отзыв при следующем подключении`,
      { companyId: notifyCompanyId },
    );
  }

  async remove(id: number, user?: RequestUser): Promise<EmployeeWithRelations> {
    if (user) {
      await this.findOne(id, user);
    }

    const deleted = await this.prisma.$transaction(async (tx) => {
      // Открепляем весь инвентарь сотрудника перед удалением
      await tx.inventoryItem.updateMany({
        where: { employeeId: id },
        data: { employeeId: null, status: 'В наличии' },
      });

      return tx.employee.delete({
        where: { id },
        include: {
          department: true,
          position: true,
          company: true,
          documents: { select: { type: true } },
        },
      });
    });

    // Telegram-уведомление об удалении (категория employee)
    try {
      const fullName = `${deleted.lastName} ${deleted.firstName}${deleted.patronymic ? ' ' + deleted.patronymic : ''}`;
      await this.telegram.notify(
        'employee',
        `🗑 <b>Сотрудник удалён</b>\n` +
        `👤 <b>${fullName}</b>\n` +
        `🏢 ${deleted.company?.name || '—'}\n` +
        (user ? `👮 Удалил: ${user.email}` : ''),
        { companyId: deleted.companyId },
      );
    } catch { /* уведомление не критично */ }

    return deleted;
  }

  async uploadPhoto(id: number, file: Express.Multer.File, user: RequestUser) {
    const employee = await this.findOne(id, user);
    if (!employee) throw new NotFoundException('Сотрудник не найден');

    // Создаём целевую папку
    const companyFolder = EmployeesService.sanitizeCompany(employee.company?.name || 'unknown');
    const employeeDir = EmployeesService.employeeDirName(employee);
    const targetDir = path.join('storage', 'companies', companyFolder, 'employees', employeeDir);
    await fs.mkdir(targetDir, { recursive: true });

    // Удаляем старое фото и кэши (norm/thumb) если есть
    if (employee.photoPath) {
      try { await fs.unlink(employee.photoPath); } catch {}
      const normPath = employee.photoPath.replace(/(\.[^.]+)$/, '_norm.jpg');
      try { await fs.unlink(normPath); } catch {}
      const thumbPath = employee.photoPath.replace(/(\.[^.]+)$/, '_thumb.jpg');
      try { await fs.unlink(thumbPath); } catch {}
    }

    // Перемещаем файл из tmp
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const photoFileName = `photo${ext}`;
    const targetPath = path.join(targetDir, photoFileName);
    await fs.rename(file.path, targetPath);

    // Обновляем запись
    return this.prisma.employee.update({
      where: { id },
      data: { photoPath: targetPath },
      include: { department: true, position: true, company: true },
    });
  }

  async getPhotoStream(id: number): Promise<{ buffer: Buffer; mimeType: string; mtime: Date }> {
    const employee = await this.prisma.employee.findUnique({ where: { id }, select: { photoPath: true } });
    if (!employee?.photoPath || !existsSync(employee.photoPath)) {
      throw new NotFoundException('Фото не найдено');
    }

    // Проверяем кэш нормализованного фото
    const normalizedPath = employee.photoPath.replace(/(\.[^.]+)$/, '_norm.jpg');
    if (existsSync(normalizedPath)) {
      const mtime = statSync(normalizedPath).mtime;
      return { buffer: readFileSync(normalizedPath), mimeType: 'image/jpeg', mtime };
    }

    // Применяем EXIF-ротацию и сжимаем до разумного размера
    const buffer = await sharp(employee.photoPath)
      .rotate()
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Кэшируем
    try { await fs.writeFile(normalizedPath, buffer); } catch (_) {}
    const mtime = existsSync(normalizedPath) ? statSync(normalizedPath).mtime : new Date();

    return { buffer, mimeType: 'image/jpeg', mtime };
  }

  async getPhotoThumbnail(id: number): Promise<Buffer> {
    const employee = await this.prisma.employee.findUnique({ where: { id }, select: { photoPath: true } });
    if (!employee?.photoPath || !existsSync(employee.photoPath)) {
      throw new NotFoundException('Фото не найдено');
    }

    // Проверяем кэш миниатюры
    const thumbPath = employee.photoPath.replace(/(\.[^.]+)$/, '_thumb.jpg');
    if (existsSync(thumbPath)) {
      return readFileSync(thumbPath);
    }

    // Генерируем миниатюру: 80x80, JPEG качество 70, с авто-поворотом по EXIF
    const buffer = await sharp(employee.photoPath)
      .rotate()
      .resize(80, 80, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toBuffer();

    // Сохраняем в кэш
    try {
      await fs.writeFile(thumbPath, buffer);
    } catch (_) {}

    return buffer;
  }

  async getOrgChart(user: RequestUser, requestedCompanyId?: number) {
    const companyFilter = this.getCompanyFilter(user, requestedCompanyId);
    const where: Prisma.EmployeeWhereInput = {
      status: { notIn: ['Ожидает', 'Отклонён'] },
    };
    if (companyFilter) {
      where.companyId = companyFilter;
    }

    const employees = await this.prisma.employee.findMany({
      where,
      include: {
        department: true,
        position: true,
        documents: { select: { type: true } },
      },
      orderBy: { lastName: 'asc' },
    });

    // Строим дерево иерархии
    type OrgNode = typeof employees[0] & { subordinates: OrgNode[] };
    const map = new Map<number, OrgNode>(
      employees.map((e) => [e.id, { ...e, subordinates: [] }]),
    );
    const roots: OrgNode[] = [];

    for (const node of map.values()) {
      if (node.managerId && map.has(node.managerId)) {
        map.get(node.managerId)!.subordinates.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async transfer(
    id: number,
    dto: { targetCompanyId: number; departmentId?: number; positionId?: number; effectiveDate?: string },
    user: RequestUser,
  ) {
    if (!user.isHoldingAdmin) {
      throw new ForbiddenException('Только суперадмин может переводить сотрудников');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!employee) throw new NotFoundException('Сотрудник не найден');

    const targetCompany = await this.prisma.company.findUnique({ where: { id: dto.targetCompanyId } });
    if (!targetCompany) throw new NotFoundException('Компания назначения не найдена');

    if (employee.companyId === dto.targetCompanyId) {
      throw new BadRequestException('Сотрудник уже работает в этой компании');
    }

    // Перемещаем файлы из папки старой компании в новую
    const oldCompanyFolder = EmployeesService.sanitizeCompany(employee.company?.name || 'unknown');
    const newCompanyFolder = EmployeesService.sanitizeCompany(targetCompany.name);
    const employeeDir = EmployeesService.employeeDirName(employee);
    const oldDir = path.join('storage', 'companies', oldCompanyFolder, 'employees', employeeDir);
    const newDir = path.join('storage', 'companies', newCompanyFolder, 'employees', employeeDir);

    let newPhotoPath: string | null = employee.photoPath;
    try {
      await fs.mkdir(path.join(newDir, 'docs'), { recursive: true });

      // Перемещаем файлы в корне папки (фото и кэши)
      const rootFiles = await fs.readdir(oldDir);
      for (const file of rootFiles) {
        const src = path.join(oldDir, file);
        const dest = path.join(newDir, file);
        try {
          const stat = await fs.stat(src);
          if (!stat.isDirectory()) {
            await fs.rename(src, dest);
          }
        } catch { /* пропускаем */ }
      }

      // Перемещаем документы из docs/
      const docsDir = path.join(oldDir, 'docs');
      try {
        const docFiles = await fs.readdir(docsDir);
        for (const file of docFiles) {
          const src = path.join(docsDir, file);
          const dest = path.join(newDir, 'docs', file);
          try {
            await fs.rename(src, dest);
          } catch { /* пропускаем */ }
        }
      } catch { /* docs/ может не существовать */ }

      if (employee.photoPath) {
        newPhotoPath = employee.photoPath.replace(
          path.join('storage', 'companies', oldCompanyFolder),
          path.join('storage', 'companies', newCompanyFolder),
        );
      }
    } catch (e) {
      this.logger.warn(`Не удалось переместить файлы сотрудника ${id}: ${e}`);
    }

    // Дата трансфера: посещаемость ДО этой даты остаётся числиться за прежней компанией,
    // с этой даты (включительно) — переходит к новой. По умолчанию — сегодня.
    const effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate) : new Date();
    effectiveDate.setHours(0, 0, 0, 0);
    const effectiveDateOnly = new Date(Date.UTC(
      effectiveDate.getFullYear(), effectiveDate.getMonth(), effectiveDate.getDate(),
    ));

    // Обновляем всё в транзакции
    const updated = await this.prisma.$transaction(async (tx) => {
      // Сам сотрудник
      const emp = await tx.employee.update({
        where: { id },
        data: {
          companyId: dto.targetCompanyId,
          departmentId: dto.departmentId ?? null,
          positionId: dto.positionId ?? null,
          managerId: null,
          photoPath: newPhotoPath,
        },
        include: { department: true, position: true, company: true, documents: { select: { type: true } } },
      });

      // Переносим документы — не привязаны к периоду, следуют за сотрудником целиком
      await tx.employeeDocument.updateMany({
        where: { employeeId: id },
        data: { companyId: dto.targetCompanyId },
      });

      // Переносим записи посещаемости — только с даты трансфера, история до неё
      // остаётся числиться за прежней компанией
      await tx.attendance.updateMany({
        where: { employeeId: id, date: { gte: effectiveDateOnly } },
        data: { companyId: dto.targetCompanyId },
      });

      await tx.attendanceEvent.updateMany({
        where: { employeeId: id, timestamp: { gte: effectiveDateOnly } },
        data: { companyId: dto.targetCompanyId },
      });

      // Переносим историю должностей
      await tx.positionHistory.updateMany({
        where: { employeeId: id },
        data: { companyId: dto.targetCompanyId },
      });

      // Переносим зарплату
      await tx.salary.updateMany({
        where: { employeeId: id },
        data: { companyId: dto.targetCompanyId },
      });

      return emp;
    });

    // Telegram-уведомление о трансфере
    try {
      const fullName = `${employee.lastName} ${employee.firstName}${employee.patronymic ? ' ' + employee.patronymic : ''}`;
      await this.telegram.notify(
        'employee',
        `🔄 <b>Трансфер сотрудника</b>\n` +
        `👤 <b>${fullName}</b>\n` +
        `🏢 ${employee.company?.name || '—'} → ${targetCompany.name}\n` +
        `👮 Перевёл: ${user.email}`,
        { companyId: dto.targetCompanyId },
      );
    } catch { /* уведомление не критично */ }

    return updated;
  }

  // Метод для получения всех сотрудников всех компаний (только для суперадминов)
  async findAllForHolding(
    page: number = 1,
    limit: number = 10,
    search?: string,
  ): Promise<{ data: EmployeeWithRelations[]; total: number }> {
    const where: Prisma.EmployeeWhereInput = {};

    if (search) {
      const words = search.trim().split(/\s+/).filter(Boolean);
      const wordConditions = words.map((word) => {
        const variants = searchVariants(word);
        return {
          OR: variants.flatMap((v) => [
            { firstName: { contains: v } },
            { lastName: { contains: v } },
            { patronymic: { contains: v } },
            { latinFirstName: { contains: v } },
            { latinLastName: { contains: v } },
            { company: { name: { contains: v } } },
          ]),
        };
      });
      if (wordConditions.length === 1) {
        where.OR = wordConditions[0].OR;
      } else {
        where.AND = [...(where.AND as any[] || []), ...wordConditions];
      }
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          department: true,
          position: true,
          company: true,
          documents: { select: { type: true } },
        },
        orderBy: [
          { department: { sortOrder: 'asc' } },
          { sortOrder: 'asc' },
          { id: 'asc' },
        ],
      }),
      this.prisma.employee.count({ where }),
    ]);

    return { data, total };
  }
}
