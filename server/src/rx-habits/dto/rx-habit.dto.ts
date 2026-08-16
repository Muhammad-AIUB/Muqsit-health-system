import { IsBoolean, IsOptional } from 'class-validator';

// `main.ts` runs ValidationPipe({ whitelist: true }) — anything not declared
// here is silently stripped, so a new flag must be added to this DTO or it will
// never reach the service.
export class UpdateRxHabitDto {
  /** "Delete" a suggestion. There is no DELETE route: P4 — the prescription
   *  record is never touched, so hiding is the only removal there is. */
  @IsOptional() @IsBoolean() hidden?: boolean;

  /** Ships with the column (additive, free) and orders the query. The pin
   *  CONTROL is deferred out of v1 — see the design's "NOT in scope". */
  @IsOptional() @IsBoolean() pinned?: boolean;
}
