import { IsInt, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RegisterEventDto {
  @IsInt()
  employeeId: number;

  @IsString()
  @IsNotEmpty()
  direction: string; // "IN" | "OUT"

  @IsInt()
  @IsOptional()
  officeId?: number;

  @IsString()
  @IsOptional()
  deviceName?: string;

  // Комментарий кадровика (опционально)
  @IsString()
  @IsOptional()
  note?: string;

  // Срок возврата в офис, формат HH:mm (опционально)
  @IsString()
  @IsOptional()
  deadline?: string;
}
