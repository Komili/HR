import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsEmail,
  IsNumber,
  Min,
  IsInt,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsOptional()
  patronymic?: string;

  @IsString()
  @IsNotEmpty()
  latinFirstName: string;

  @IsString()
  @IsNotEmpty()
  latinLastName: string;

  @IsDateString()
  @IsOptional()
  @Transform(({ value }) => value || undefined)
  birthDate?: string;

  @IsString()
  @IsOptional()
  passportSerial?: string;

  @IsString()
  @IsOptional()
  passportNumber?: string;

  @IsString()
  @IsOptional()
  passportIssuedBy?: string;

  @IsDateString()
  @IsOptional()
  @Transform(({ value }) => value || undefined)
  passportIssueDate?: string;

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

  @IsNumber()
  @IsOptional()
  @Min(0)
  salary?: number;

  @IsString()
  @IsOptional()
  contractNumber?: string;

  @IsDateString()
  @IsOptional()
  @Transform(({ value }) => value || undefined)
  contractDate?: string;

  @IsDateString()
  @IsOptional()
  @Transform(({ value }) => value || undefined)
  hireDate?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsInt()
  @IsOptional()
  departmentId?: number;

  @IsInt()
  @IsOptional()
  positionId?: number;

  @IsInt()
  @IsOptional()
  companyId?: number;
}
