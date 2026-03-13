import { IsString, IsNotEmpty, IsOptional, IsInt, IsBoolean, Min } from 'class-validator';

export class CreateDoorDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  companyId: number;

  @IsString()
  @IsNotEmpty()
  inDeviceIp: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  inDevicePort?: number;

  @IsString()
  @IsNotEmpty()
  outDeviceIp: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  outDevicePort?: number;

  @IsString()
  @IsOptional()
  login?: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateDoorDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  inDeviceIp?: string;

  @IsInt()
  @IsOptional()
  inDevicePort?: number;

  @IsString()
  @IsOptional()
  outDeviceIp?: string;

  @IsInt()
  @IsOptional()
  outDevicePort?: number;

  @IsString()
  @IsOptional()
  login?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
