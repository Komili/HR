import { IsNotEmpty, IsString, IsOptional, IsBoolean, IsEmail } from 'class-validator';

export class CompanyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  shortName?: string;

  @IsString()
  @IsOptional()
  inn?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  lunchBreakStart?: string;

  @IsString()
  @IsOptional()
  lunchBreakEnd?: string;

  @IsString()
  @IsOptional()
  workDayStart?: string;

  @IsString()
  @IsOptional()
  workDayEnd?: string;
}
