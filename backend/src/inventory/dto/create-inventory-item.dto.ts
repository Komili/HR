import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value || undefined)
  model?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value || undefined)
  category?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value || undefined)
  inventoryNumber?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @IsDateString()
  @IsOptional()
  @Transform(({ value }) => value || undefined)
  acquisitionDate?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsInt()
  @IsOptional()
  companyId?: number;

  @IsInt()
  @IsOptional()
  employeeId?: number;
}
