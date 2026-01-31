import { IsNotEmpty, IsString, IsOptional, IsInt } from 'class-validator';

export class DepartmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @IsOptional()
  companyId?: number;
}
