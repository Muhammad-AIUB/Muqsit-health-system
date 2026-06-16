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
  @IsOptional() @IsString() sex?: string;
  @IsOptional() @IsString() ethnicity?: string;
  @IsOptional() @IsString() religion?: string;
  @IsOptional() @IsString() mobile?: string;
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
}
