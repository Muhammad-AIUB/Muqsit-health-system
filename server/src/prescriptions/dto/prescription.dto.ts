import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RxItemDto {
  @IsString() @MinLength(1) drug!: string;
  @IsString() dose!: string;
  @IsString() duration!: string;
  @IsString() instruction!: string;
  @IsOptional() @Type(() => Number) @IsInt() order?: number;
}

export class CreatePrescriptionDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsOptional() @IsArray() @IsString({ each: true }) chiefComplaints?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) history?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) investigation?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) drugHistory?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) onExamination?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) note?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) provisionalDiagnosis?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) associatedIllness?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) finalDiagnosis?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) advice?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) adviceTest?: string[];

  @IsOptional() @IsString() followUpNum?: string;
  @IsOptional() @IsString() followUpUnit?: string;
  @IsOptional() @IsBoolean() followUpMandatory?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RxItemDto)
  items!: RxItemDto[];
}
