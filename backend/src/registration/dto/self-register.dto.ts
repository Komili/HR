import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsEmail,
} from 'class-validator';

export class SelfRegisterDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsOptional()
  patronymic?: string;

  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

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
  passportIssueDate?: string;

  @IsString()
  @IsOptional()
  inn?: string;

  @IsString()
  @IsNotEmpty()
  token: string;
}
