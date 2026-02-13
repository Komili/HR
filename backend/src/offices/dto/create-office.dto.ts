import { IsString, IsNotEmpty, IsOptional, IsInt } from 'class-validator';

export class CreateOfficeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsInt()
  @IsOptional()
  companyId?: number;
}
