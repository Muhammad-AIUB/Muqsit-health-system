import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsBoolean,
  IsInt,
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
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {}
