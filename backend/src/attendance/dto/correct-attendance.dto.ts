import { IsInt, IsString, IsNotEmpty } from 'class-validator';

export class CorrectAttendanceDto {
  @IsInt()
  correctionMinutes: number;

  @IsString()
  @IsNotEmpty()
  note: string;
}
