import { IsBoolean } from 'class-validator';

// `main.ts` runs ValidationPipe({ whitelist: true }) — anything not declared
// here is silently stripped, so a new flag must be added to this DTO or it will
// never reach the service.
export class UpdateDoctorPhraseDto {
  /** "Delete" a suggestion. There is no DELETE route: the prescription the
   *  phrase was learned from is never touched, so hiding is the only removal
   *  there is. `false` restores it. */
  @IsBoolean() hidden!: boolean;
}
