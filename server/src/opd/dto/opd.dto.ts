import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateOpdVisitDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @Type(() => Number) @IsInt() age?: number;
  @IsOptional() @IsString() gender?: string;

  @IsOptional()
  @IsIn(['New', 'Follow-up', 'Urgent'])
  type?: string;
}

export class UpdateOpdStatusDto {
  @IsIn(['waiting', 'done'])
  status!: string;
}
