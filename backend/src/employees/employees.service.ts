import { Injectable, ForbiddenException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
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

  private getCompanyFilter(user: RequestUser, requestedCompanyId?: number): number | undefined {
    // Суперадмин холдинга может выбрать любую компанию или видеть все
    if (user.isHoldingAdmin) {
      return requestedCompanyId || undefined;
    }
    // Обычный пользователь видит только свою компанию
    if (!user.companyId) {
      throw new ForbiddenException('User is not assigned to any company');
    }
    return user.companyId;
  }

  async create(data: Prisma.EmployeeCreateInput, user: RequestUser): Promise<EmployeeWithRelations> {
    // Проверяем, что пользователь имеет право создавать сотрудников
    const companyId = this.getCompanyFilter(user);

    if (!companyId && !user.isHoldingAdmin) {
      throw new ForbiddenException('Cannot create employee without company context');
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
  ): Promise<EmployeeWithRelations> {
    const employee = await this.findOne(id, user);
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    if (employee.status !== 'Ожидает') throw new BadRequestException('Заявка уже обработана');

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
    if (employee && user && !user.isHoldingAdmin) {
      if (employee.companyId !== user.companyId) {
        throw new ForbiddenException('Access denied to this employee');
      }
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
    // Находим все активные доступы сотрудника
    const accesses = await this.prisma.hikvisionAccess.findMany({
      where: { employeeId: employee.id },
      include: { device: { select: { id: true, officeName: true, direction: true, companyId: true } } },
    });

    if (accesses.length === 0) return;

    const fullName = `${employee.lastName} ${employee.firstName}`;
    this.logger.log(`Автоотзыв Face ID: ${fullName} → "${newStatus}" (${accesses.length} устройств)`);

    // Удаляем записи доступа и ставим команды на отзыв
    await this.prisma.hikvisionAccess.deleteMany({ where: { employeeId: employee.id } });

    await this.prisma.hikvisionCommand.createMany({
      data: accesses.map(a => ({
        deviceId: a.device.id,
        employeeId: employee.id,
        action: 'revoke',
      })),
    });

    const deviceList = accesses
      .map(a => `• ${a.device.officeName || `Устройство #${a.device.id}`} (${a.device.direction === 'IN' ? 'Вход' : 'Выход'})`)
      .join('\n');

    await this.telegram.notify(
      'access',
      `🔒 <b>Face ID автоматически отозван</b>\n\n` +
      `👤 <b>${fullName}</b>\n` +
      `📋 Новый статус: <b>${newStatus}</b>\n\n` +
      `🚪 Устройства (${accesses.length}):\n${deviceList}\n\n` +
      `🤖 Relay-агент выполнит отзыв при следующем подключении`,
      { companyId: accesses[0]?.device.companyId },
    );
  }

  async remove(id: number, user?: RequestUser): Promise<EmployeeWithRelations> {
    if (user) {
      await this.findOne(id, user);
    }

    return this.prisma.$transaction(async (tx) => {
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
