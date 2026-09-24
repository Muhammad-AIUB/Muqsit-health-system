import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

// `main.ts` runs ValidationPipe({ whitelist: true }) — anything not declared
// here is silently stripped.
export class PatientInfoDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(40) age?: string;
  @IsOptional() @IsString() @MaxLength(20) sex?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(40) mobile?: string;
}

export class SavePatientNoteDto {
  /** The note as formatted HTML. */
  @IsString() @MaxLength(200_000) html!: string;

  /** Used ONLY when the note is first created; a later save never rewrites it. */
  @IsObject() @ValidateNested() @Type(() => PatientInfoDto) patientInfo!: PatientInfoDto;
}
