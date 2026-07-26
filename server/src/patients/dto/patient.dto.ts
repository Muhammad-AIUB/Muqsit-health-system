import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';

// A birth date cannot be in the future. The client already refuses one, but the
// client is not the only writer, and an unvalidated `dob` used to reach Prisma as
// `new Date(garbage)` and surface as a 500 instead of a 400.
//
// One day of grace: doctors are in Bangladesh (UTC+6) while this process may run
// UTC, so a same-day birth date must not 400 just because the clocks disagree.
// The bug this guards against writes years 70+ out; the grace costs nothing.
@ValidatorConstraint({ name: 'notFutureDate', async: false })
export class NotFutureDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    // Each decorator owns exactly one failure mode and passes on inputs it does
    // not own, so a malformed string yields one clear @IsISO8601 message.
    if (typeof value !== 'string' || !value) return true;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return true;
    return d.getTime() <= Date.now() + 24 * 60 * 60 * 1000;
  }

  // apiFetch surfaces this string straight into the doctor-facing save banner
  // (client/src/lib/api.ts joins `body.message`), so it is written for a
  // clinician, not a developer reading a log.
  defaultMessage(): string {
    return 'Date of birth cannot be in the future.';
  }
}

export class CreatePatientDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional() @IsString() hospitalId?: string;
  @IsOptional() @IsString() bloodGroup?: string;
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Date of birth is not a valid date.' })
  @Validate(NotFutureDateConstraint)
  dob?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(150) age?: number;
  // Calendar year the manual age was recorded (powers age auto-increment).
  @IsOptional() @Type(() => Number) @IsInt() @Min(1900) @Max(2200) ageAsOfYear?: number;
  @IsOptional() @IsString() sex?: string;
  @IsOptional() @IsString() ethnicity?: string;
  @IsOptional() @IsString() religion?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() nid?: string;
  @IsOptional() @IsString() spouseMobile?: string;
  @IsOptional() @IsString() relativeMobile?: string;
  @IsOptional() @IsString() relativeRelation?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() fullAddress?: string;
  @IsOptional() @IsString() monthlyIncome?: string;
  @IsOptional() @IsString() pictureUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) tags?: string[];
  @IsOptional() @IsBoolean() watched?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) prescriptionImages?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) reportImages?: string[];
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {
  // Health-monitoring "Start from / Upto" dates per drug — { [drug]: { sf, upto } }.
  // Chart-display override only: never rewrites drugHistory.
  @IsOptional() @IsObject() hmDrugDates?: Record<string, { sf: string; upto: string }>;
  // Same shape, keyed by the exact chief-complaint text — { [complaint]: { sf, upto } }.
  // Chart-display override only: never rewrites any Prescription.
  @IsOptional() @IsObject() hmSymptomDates?: Record<string, { sf: string; upto: string }>;
  // Ticked drug names in the health-monitoring view.
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) hmSelectedDrugs?: string[];
  // Family tree — array of { name, mobile, nid, sex, relation }.
  @IsOptional() @IsArray() @ArrayMaxSize(200) familyMembers?: Record<string, unknown>[];
  // Persistent investigation history — array of { date, category, test, value }.
  @IsOptional() @IsArray() @ArrayMaxSize(200) investigationSummary?: Record<string, unknown>[];
  // Persistent on-examination history — array of { date, text }.
  @IsOptional() @IsArray() @ArrayMaxSize(200) onExaminationSummary?: Record<string, unknown>[];
  // Persistent drug history — date-stamped entry strings.
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) drugHistory?: string[];
  // Saved-but-not-printed prescription editor snapshot (null clears it).
  @IsOptional() incompleteRx?: Record<string, unknown> | null;
}

// Create a NEW patient related to an EXISTING one, writing reciprocal family-tree
// links to both. `relation` is the NEW patient's role relative to the existing
// patient (X is T's <relation>) — son | daughter | spouse | father | mother |
// brother | sister. See PatientsService.linkNew for the gender-aware mapping.
export class LinkPatientDto {
  @IsString() existingId!: string;

  @IsString() @MinLength(1) @MaxLength(160) name!: string;

  @IsString() relation!: string;

  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() sex?: string;
  @IsOptional() @IsString() hospitalId?: string;
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Date of birth is not a valid date.' })
  @Validate(NotFutureDateConstraint)
  dob?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(150) age?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1900) @Max(2200) ageAsOfYear?: number;
  @IsOptional() @IsString() fullAddress?: string;
}
