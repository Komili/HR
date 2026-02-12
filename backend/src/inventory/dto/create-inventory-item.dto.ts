import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';

export class CreateInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  inventoryNumber?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @IsDateString()
  @IsOptional()
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
