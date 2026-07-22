import { IsNotEmpty, IsString, IsOptional, IsIn, IsEmail } from 'class-validator';

export const CANDIDATE_STATUSES = ['NEW', 'REVIEWING', 'SHORTLIST', 'INTERVIEW', 'HIRED', 'REJECTED'] as const;

export class CandidateDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsIn(CANDIDATE_STATUSES)
  @IsOptional()
  status?: string;
}
