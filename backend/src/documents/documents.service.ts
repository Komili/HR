import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  async handleFileUpload(data: {
    employeeId: number;
    documentType: string;
    file: Express.Multer.File;
  }) {
    const { employeeId, documentType, file } = data;

    // 1. Найти сотрудника
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) {
      // Удаляем временный файл, если сотрудник не найден
      await fs.unlink(file.path);
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    // 2. Создать структуру папок
    const sanitizedFirstName = this.sanitize(employee.latinFirstName);
    const sanitizedLastName = this.sanitize(employee.latinLastName);
    const employeeDir = `${sanitizedFirstName}_${sanitizedLastName}_${employee.id}`;
    const targetDir = path.join('./storage/employees', employeeDir, 'docs');

    await fs.mkdir(targetDir, { recursive: true });

    // 3. Переместить файл
    const fileExtension = path.extname(file.originalname);
    const newFileName = `${this.sanitize(
      documentType,
    )}_${new Date().toISOString().split('T')[0]}${fileExtension}`;
    const newFilePath = path.join(targetDir, newFileName);

    await fs.rename(file.path, newFilePath);

    // 4. Сохранить в БД
    const documentRecord = await this.prisma.employeeDocument.create({
      data: {
        employeeId: employee.id,
        type: documentType,
        filePath: newFilePath, // Путь внутри контейнера
        fileName: newFileName,
        uploadedBy: 'system', // TODO: Заменить на ID авторизованного пользователя
      },
    });

    return documentRecord;
  }

  private sanitize(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
}