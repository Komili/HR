import { IsNotEmpty, IsString } from 'class-validator';

export class PositionDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
