import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAdmissionDto {
  @IsString() @MinLength(1) bed!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() hospitalId?: string;
  @IsOptional() @IsString() roomNo?: string;
  @IsOptional() @IsString() wardNo?: string;
  // Ward from the practice's ward list. Validated against the doctor's own
  // wards in the service — a wardId from another practice must not link.
  @IsOptional() @IsString() wardId?: string | null;
  @IsOptional() @IsString() floorBuilding?: string;
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'Mobile number must be exactly 11 digits' })
  mobile?: string;
  @IsOptional() @IsString() diagnosis?: string;

  @IsOptional()
  @IsIn(['Stable', 'Observation', 'Critical', 'Discharge'])
  status?: string;
}

export class UpdateAdmissionStatusDto {
  @IsIn(['Stable', 'Observation', 'Critical', 'Discharge'])
  status!: string;
}

// Edit an admission's header fields + clinical sheet (IPD detail view).
export class UpdateAdmissionDto {
  @IsOptional() @IsString() bed?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() hospitalId?: string;
  @IsOptional() @IsString() roomNo?: string;
  @IsOptional() @IsString() wardNo?: string;
  // Null clears the link (moved to a free-typed ward); see CreateAdmissionDto.
  @IsOptional() @IsString() wardId?: string | null;
  @IsOptional() @IsString() floorBuilding?: string;
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'Mobile number must be exactly 11 digits' })
  mobile?: string;
  @IsOptional() @IsString() diagnosis?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(150) age?: number;
  @IsOptional() @IsString() sex?: string;
  // { chiefComplaints (shown as "Sign"), symptoms, investigation, procedure,
  //   followUp, plan, adviceTests, rxItems }
  @IsOptional() @IsObject() clinical?: Record<string, unknown>;
}

export class CreateIpdEventDto {
  @IsString() @MinLength(1) note!: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() reportUrl?: string;
}

// ── Analogue (paper) order-sheet pages ──────────────────────────────────────
// The client sends only what it uploaded. `id` and `addedAt` are the SERVER's
// to assign: the id is the handle every per-page route addresses, and a ward
// PC's clock is not something a clinical timestamp may depend on.
export class AnalogueSheetInputDto {
  @IsString() @MinLength(1) @MaxLength(500) url!: string;
  @IsOptional() @IsString() @MaxLength(500) thumbUrl?: string;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
}

export class AddAnalogueSheetsDto {
  @IsArray()
  @ArrayNotEmpty()
  // Mirrors the client's per-batch cap. A body that asks to append hundreds of
  // pages in one write is not a doctor photographing a sheet.
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AnalogueSheetInputDto)
  sheets!: AnalogueSheetInputDto[];
}

export class UpdateAnalogueSheetDto {
  // An empty string clears the label — that is a real edit, not a missing field.
  @IsString() @MaxLength(120) label!: string;
}
