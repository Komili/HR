import { IsInt, IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class ExcusedDto {
  @IsInt()
  employeeId: number;

  // Дата дня, формат YYYY-MM-DD
  @IsString()
  @IsNotEmpty()
  date: string;

  // 'left' — отпросился и ушёл; 'absent' — отпросился и не пришёл
  @IsIn(['left', 'absent'])
  mode: 'left' | 'absent';

  // Причина (обязательно)
  @IsString()
  @IsNotEmpty()
  note: string;

  // Время ухода для mode='left', формат HH:mm (опционально)
  @IsString()
  @IsOptional()
  time?: string;
}
