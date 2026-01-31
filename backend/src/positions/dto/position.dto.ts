import { IsNotEmpty, IsString, IsOptional, IsInt } from 'class-validator';

export class PositionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @IsOptional()
  companyId?: number;
}
