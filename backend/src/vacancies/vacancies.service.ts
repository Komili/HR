import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/jwt.strategy';
import { getCompanyFilter, isAuthorizedForCompany } from '../common/company-filter';
import { toFolderName } from '../common/transliterate';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class VacanciesService {
  constructor(private prisma: PrismaService) {}

  // ─────────── вакансии ───────────

  async findAll(user: RequestUser, requestedCompanyId?: number) {
    const companyFilter = getCompanyFilter(user, requestedCompanyId);
    const where = companyFilter !== undefined ? { companyId: companyFilter } : {};

    const vacancies = await this.prisma.vacancy.findMany({
      where,
      include: {
        department: { select: { name: true } },
        position: { select: { name: true } },
        company: { select: { name: true, shortName: true } },
        _count: { select: { candidates: true } },
        candidates: { select: { status: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return vacancies.map((v) => {
      const { candidates, _count, ...rest } = v;
      const shortlistCount = candidates.filter((c) => c.status === 'SHORTLIST').length;
      return { ...rest, candidateCount: _count.candidates, shortlistCount };
    });
  }

  async findOne(id: number, user: RequestUser) {
    const vacancy = await this.prisma.vacancy.findUnique({
      where: { id },
      include: {
        department: { select: { name: true } },
        position: { select: { name: true } },
        company: { select: { name: true } },
        _count: { select: { candidates: true } },
      },
    });
    if (!vacancy) throw new NotFoundException(`Вакансия с ID ${id} не найдена`);
    if (!isAuthorizedForCompany(user, vacancy.companyId)) {
      throw new ForbiddenException('Доступ к этой вакансии запрещён');
    }
    return vacancy;
  }

  async create(data: { title: string; companyId: number; departmentId?: number; positionId?: number; description?: string; status?: string }, user: RequestUser) {
    return this.prisma.vacancy.create({
      data: {
        title: data.title,
        companyId: data.companyId,
        departmentId: data.departmentId || null,
        positionId: data.positionId || null,
        description: data.description || null,
        status: data.status || 'OPEN',
        createdBy: user.email,
      },
    });
  }

  async update(id: number, data: { title?: string; departmentId?: number | null; positionId?: number | null; description?: string; status?: string }, user: RequestUser) {
    await this.findOne(id, user);
    return this.prisma.vacancy.update({
      where: { id },
      data: {
        title: data.title,
        departmentId: data.departmentId === undefined ? undefined : data.departmentId || null,
        positionId: data.positionId === undefined ? undefined : data.positionId || null,
        description: data.description,
        status: data.status,
      },
    });
  }

  async remove(id: number, user: RequestUser) {
    const vacancy = await this.findOne(id, user);
    const candidates = await this.prisma.candidate.findMany({ where: { vacancyId: id } });
    for (const c of candidates) {
      if (c.resumePath) {
        try { await fsp.unlink(path.resolve(c.resumePath)); } catch { /* уже удалён */ }
      }
    }
    await this.prisma.vacancy.delete({ where: { id } });
    return vacancy;
  }

  // ─────────── кандидаты ───────────

  async listCandidates(vacancyId: number, user: RequestUser) {
    await this.findOne(vacancyId, user);
    return this.prisma.candidate.findMany({
      where: { vacancyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getCandidateOrThrow(id: number, user: RequestUser) {
    const candidate = await this.prisma.candidate.findUnique({ where: { id } });
    if (!candidate) throw new NotFoundException(`Кандидат с ID ${id} не найден`);
    if (!isAuthorizedForCompany(user, candidate.companyId)) {
      throw new ForbiddenException('Доступ к этому кандидату запрещён');
    }
    return candidate;
  }

  async createCandidate(
    vacancyId: number,
    data: { fullName: string; phone?: string; email?: string; source?: string; note?: string },
    file: Express.Multer.File | undefined,
    user: RequestUser,
  ) {
    const vacancy = await this.findOne(vacancyId, user);

    let resumePath: string | null = null;
    let resumeName: string | null = null;

    if (file) {
      const companyFolder = toFolderName(vacancy.company?.name || 'unknown');
      const targetDir = path.join('storage', 'companies', companyFolder, 'vacancies', String(vacancyId), 'resumes');
      await fsp.mkdir(targetDir, { recursive: true });

      const ext = path.extname(file.originalname);
      const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const newFileName = `${uniqueSuffix}${ext}`;
      const newFilePath = path.join(targetDir, newFileName);
      await fsp.rename(file.path, newFilePath);

      resumePath = newFilePath;
      resumeName = file.originalname;
    }

    return this.prisma.candidate.create({
      data: {
        vacancyId,
        companyId: vacancy.companyId,
        fullName: data.fullName,
        phone: data.phone || null,
        email: data.email || null,
        source: data.source || null,
        note: data.note || null,
        resumePath,
        resumeName,
        addedBy: user.email,
      },
    });
  }

  async updateCandidate(
    id: number,
    data: { fullName?: string; phone?: string; email?: string; source?: string; note?: string; status?: string },
    user: RequestUser,
  ) {
    await this.getCandidateOrThrow(id, user);
    return this.prisma.candidate.update({
      where: { id },
      data,
    });
  }

  async removeCandidate(id: number, user: RequestUser) {
    const candidate = await this.getCandidateOrThrow(id, user);
    if (candidate.resumePath) {
      try { await fsp.unlink(path.resolve(candidate.resumePath)); } catch { /* уже удалён */ }
    }
    await this.prisma.candidate.delete({ where: { id } });
    return candidate;
  }

  async getResumeStream(id: number, user: RequestUser): Promise<{ stream: fs.ReadStream; fileName: string; mimeType: string }> {
    const candidate = await this.getCandidateOrThrow(id, user);
    if (!candidate.resumePath) throw new NotFoundException('У кандидата нет файла резюме');

    const filePath = path.resolve(candidate.resumePath);
    try {
      await fsp.access(filePath);
    } catch {
      throw new NotFoundException('Файл резюме не найден на диске');
    }

    const stream = fs.createReadStream(filePath);
    const mimeType = this.getMimeType(candidate.resumeName || candidate.resumePath);
    return { stream, fileName: candidate.resumeName || 'resume', mimeType };
  }

  private getMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}
