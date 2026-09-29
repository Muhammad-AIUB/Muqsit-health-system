import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

// Mirrors the client RxItem. `drug` may be empty for tapering continuation
// lines (they belong to the line above), so it is NOT min-length validated.
export class TemplateItemDto {
  @IsString() drug!: string;
  @IsString() dose!: string;
  @IsString() duration!: string;
  @IsString() instruction!: string;
  @IsOptional() @IsBoolean() isNote?: boolean;
  // SAFETY field, not a label: prescribing-alert rules are written against the
  // generic while the line carries the brand. Without it (the whitelist used to
  // strip it) a medicine added from a template never triggered its alerts.
  @IsOptional() @IsString() @MaxLength(200) generic?: string;
  @IsOptional() @IsBoolean() isCont?: boolean;
}

export class CreateTemplateDto {
  @IsIn(['opd', 'ipd', 'custom']) category!: 'opd' | 'ipd' | 'custom';
  @IsString() @MinLength(1) @MaxLength(120) name!: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TemplateItemDto)
  items!: TemplateItemDto[];
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TemplateItemDto)
  items?: TemplateItemDto[];
}
