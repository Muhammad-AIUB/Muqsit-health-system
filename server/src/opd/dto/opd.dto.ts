import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateOpdVisitDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(150) age?: number;
  @IsOptional() @IsString() gender?: string;

  @IsOptional()
  @IsIn(['New', 'Follow-up', 'Urgent'])
  type?: string;

  // The day to queue the visit for, `yyyy-mm-dd`: today (the default) or a later
  // day. The service refuses a past day and anything that is not a calendar day.
  @IsOptional() @IsString() @Matches(DAY) date?: string;
}

export class UpdateOpdStatusDto {
  @IsIn(['waiting', 'done'])
  status!: string;
}

// Move a visit one place up or down within its day.
export class MoveOpdVisitDto {
  @IsIn(['up', 'down'])
  direction!: 'up' | 'down';
}

// One day's chamber schedule. The time of each serial is worked out from it
// (client/src/lib/opdSchedule.ts). The both-or-neither and end-after-start rules
// of the break are `schedule.ts#scheduleProblem`, in the service.
export class SaveOpdScheduleDto {
  @IsString() @Matches(DAY) date!: string;
  @IsString() @Matches(CLOCK) startTime!: string;
  @IsOptional() @IsString() @Matches(CLOCK) breakStart?: string | null;
  @IsOptional() @IsString() @Matches(CLOCK) breakEnd?: string | null;
  @Type(() => Number) @IsInt() @Min(1) @Max(120) minutesPerPatient!: number;
}

// Upsert today's queue entry for a patient and set its prescription status.
// Used to flag an incomplete prescription (started, not printed) and to mark it
// complete once "Save & print" runs.
export class SetRxStatusDto {
  @IsString() patientId!: string;
  @IsIn(['incomplete', 'complete']) rxStatus!: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(150) age?: number;
  @IsOptional() @IsString() gender?: string;
}
