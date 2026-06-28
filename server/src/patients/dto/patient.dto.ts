import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePatientDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional() @IsString() hospitalId?: string;
  @IsOptional() @IsString() bloodGroup?: string;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @Type(() => Number) @IsInt() age?: number;
  // Calendar year the manual age was recorded (powers age auto-increment).
  @IsOptional() @Type(() => Number) @IsInt() ageAsOfYear?: number;
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
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsBoolean() watched?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) prescriptionImages?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) reportImages?: string[];
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {
  // Health-monitoring "Start from / Upto" dates per drug — { [drug]: { sf, upto } }.
  @IsOptional() @IsObject() hmDrugDates?: Record<string, { sf: string; upto: string }>;
  // Ticked drug names in the health-monitoring view.
  @IsOptional() @IsArray() @IsString({ each: true }) hmSelectedDrugs?: string[];
  // Family tree — array of { name, mobile, nid, sex, relation }.
  @IsOptional() @IsArray() familyMembers?: Record<string, unknown>[];
  // Persistent investigation history — array of { date, category, test, value }.
  @IsOptional() @IsArray() investigationSummary?: Record<string, unknown>[];
  // Persistent on-examination history — array of { date, text }.
  @IsOptional() @IsArray() onExaminationSummary?: Record<string, unknown>[];
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
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @Type(() => Number) @IsInt() age?: number;
  @IsOptional() @Type(() => Number) @IsInt() ageAsOfYear?: number;
  @IsOptional() @IsString() fullAddress?: string;
}
