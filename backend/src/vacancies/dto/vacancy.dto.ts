import { IsNotEmpty, IsString, IsOptional, IsInt, IsIn } from 'class-validator';

export const VACANCY_STATUSES = ['OPEN', 'ON_HOLD', 'CLOSED'] as const;

export class VacancyDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsInt()
  @IsOptional()
  companyId?: number;

  @IsInt()
  @IsOptional()
  departmentId?: number;

  @IsInt()
  @IsOptional()
  positionId?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsIn(VACANCY_STATUSES)
  @IsOptional()
  status?: string;
}
