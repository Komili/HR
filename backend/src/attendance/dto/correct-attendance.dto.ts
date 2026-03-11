import { IsInt, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CorrectAttendanceDto {
  // Тип корректировки: 'minutes' | 'manual_in' | 'manual_out' | 'remote'
  @IsString()
  @IsOptional()
  type?: string;

  // Для type='minutes': количество минут (положительное или отрицательное)
  @IsInt()
  @IsOptional()
  correctionMinutes?: number;

  // Для type='manual_in' | 'manual_out': время в формате HH:mm
  @IsString()
  @IsOptional()
  time?: string;

  // Комментарий (обязателен)
  @IsString()
  @IsNotEmpty()
  note: string;

  // Срок (до какого времени отпросился), формат HH:mm
  @IsString()
  @IsOptional()
  deadline?: string;
}
