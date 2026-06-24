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

// Upsert today's queue entry for a patient and set its prescription status.
// Used to flag an incomplete prescription (started, not printed) and to mark it
// complete once "Save & print" runs.
export class SetRxStatusDto {
  @IsString() patientId!: string;
  @IsIn(['incomplete', 'complete']) rxStatus!: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @Type(() => Number) @IsInt() age?: number;
  @IsOptional() @IsString() gender?: string;
}
