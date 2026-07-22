import { IsInt, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CorrectAttendanceDto {
  // Тип корректировки: 'minutes_offsite' | 'minutes_excused' | 'manual_in' | 'manual_out' | 'remote'
  @IsString()
  @IsOptional()
  type?: string;

  // Для type='minutes_offsite' | 'minutes_excused': количество минут (всегда положительное, знак не имеет значения)
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
