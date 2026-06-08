import { IsString, MinLength } from 'class-validator';

export class RejectDto {
  @IsString()
  @MinLength(1, { message: 'A rejection reason is required' })
  reason!: string;
}
