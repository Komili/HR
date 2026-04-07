import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeesService } from '../employees/employees.service';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  async findByEmployeeId(employeeId: number) {
    return this.prisma.employeeDocument.findMany({
      where: { employeeId },
    });
  }

  async getDocumentStream(documentId: number): Promise<{ stream: fs.ReadStream; fileName: string; mimeType: string }> {
    const document = await this.prisma.employeeDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    const filePath = path.resolve(document.filePath);

    try {
      await fsp.access(filePath);
      const stream = fs.createReadStream(filePath);
      const mimeType = this.getMimeType(document.fileName);
      return { stream, fileName: document.fileName, mimeType };
    } catch (error) {
      throw new NotFoundException(`File not found for document ID ${documentId}`);
    }
  }

  private getMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  async handleFileUpload(data: {
    employeeId: number;
    documentType: string;
    file: Express.Multer.File;
    uploadedBy: string;
  }) {
    const { employeeId, documentType, file, uploadedBy } = data;

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { company: true },
    });

    if (!employee) {
      await fsp.unlink(file.path);
      throw new NotFoundException(`Employee with ID ${employeeId} not found.`);
    }

    const companyDir = EmployeesService.sanitizeCompany(employee.company?.name || 'unknown');
    const employeeDir = EmployeesService.employeeDirName(employee);
    const targetDir = path.join('storage', 'companies', companyDir, 'employees', employeeDir, 'docs');

    await fsp.mkdir(targetDir, { recursive: true });

    const fileExtension = path.extname(file.originalname);
    const newFileName = `${this.sanitize(
      documentType,
    )}_${new Date().toISOString().split('T')[0]}${fileExtension}`;
    const newFilePath = path.join(targetDir, newFileName);

    await fsp.rename(file.path, newFilePath);

    const documentRecord = await this.prisma.employeeDocument.create({
      data: {
        employeeId: employee.id,
        companyId: employee.companyId,
        type: documentType,
        filePath: newFilePath,
        fileName: newFileName,
        uploadedBy,
      },
    });

    return documentRecord;
  }

  async deleteDocument(documentId: number): Promise<void> {
    const document = await this.prisma.employeeDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(`Документ с ID ${documentId} не найден`);
    }

    // Удаляем файл с диска
    try {
      const filePath = path.resolve(document.filePath);
      await fsp.unlink(filePath);
    } catch {
      // Файл уже удалён или не существует — продолжаем
    }

    await this.prisma.employeeDocument.delete({ where: { id: documentId } });
  }

  private sanitize(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\s+/g, '_');
  }
}
