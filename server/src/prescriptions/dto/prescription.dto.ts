import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RxItemDto {
  // Note lines carry an empty drug (the free-typed instruction lives in
  // `instruction`), so `drug` can be blank for them — MinLength is dropped.
  @IsString() drug!: string;
  @IsString() dose!: string;
  @IsString() duration!: string;
  @IsString() instruction!: string;
  @IsOptional() @Type(() => Number) @IsInt() order?: number;
  // Free-typed note line (vs a real medicine).
  @IsOptional() @IsBoolean() isNote?: boolean;
  // "Start From" date for the medicine (IPD pad), e.g. "17 June 2026".
  @IsOptional() @IsString() sf?: string;
}

export class CreatePrescriptionDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) chiefComplaints?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) previousComplaints?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) history?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) investigation?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) drugHistory?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) onExamination?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) note?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) provisionalDiagnosis?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) associatedIllness?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) finalDiagnosis?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) advice?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(2000, { each: true }) adviceTest?: string[];

  @IsOptional() @IsString() followUpNum?: string;
  @IsOptional() @IsString() followUpUnit?: string;
  @IsOptional() @IsBoolean() followUpMandatory?: boolean;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RxItemDto)
  items!: RxItemDto[];
}
