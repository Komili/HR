import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

  async getDocumentStream(documentId: number): Promise<{ stream: fs.ReadStream; fileName: string }> {
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
      return { stream, fileName: document.fileName };
    } catch (error) {
      throw new NotFoundException(`File not found for document ID ${documentId}`);
    }
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
    });

    if (!employee || !employee.latinFirstName || !employee.latinLastName) {
      await fsp.unlink(file.path);
      throw new NotFoundException(
        `Employee with ID ${employeeId} not found or missing latin name.`,
      );
    }

    const sanitizedFirstName = this.sanitize(employee.latinFirstName);
    const sanitizedLastName = this.sanitize(employee.latinLastName);
    const employeeDir = `${sanitizedFirstName}_${sanitizedLastName}_${employee.id}`;
    const targetDir = path.join('storage', 'employees', employeeDir, 'docs');

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
        type: documentType,
        filePath: newFilePath,
        fileName: newFileName,
        uploadedBy,
      },
    });

    return documentRecord;
  }

  private sanitize(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\s+/g, '_');
  }
}
