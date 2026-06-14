import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Upsert the doctor's prescription print layout. Every field is optional so
// the client can send a partial update; the service merges over current/defaults.
export class UpsertPrescriptionLayoutDto {
  @IsOptional() @IsIn(['in', 'cm']) unit?: 'in' | 'cm';

  @IsOptional() @IsString() @MaxLength(16) totalHeight?: string;
  @IsOptional() @IsString() @MaxLength(16) totalWidth?: string;
  @IsOptional() @IsString() @MaxLength(16) leftMargin?: string;
  @IsOptional() @IsString() @MaxLength(16) rightMargin?: string;
  @IsOptional() @IsString() @MaxLength(16) headerHeight?: string;
  @IsOptional() @IsString() @MaxLength(16) footerHeight?: string;

  @IsOptional() @IsBoolean() headerSplit?: boolean;
  @IsOptional() @IsIn(['left', 'center', 'right']) headerAlign?: 'left' | 'center' | 'right';

  // Rich-text HTML blocks. Capped generously to allow embedded image data/URLs.
  @IsOptional() @IsString() @MaxLength(100000) headerHtml?: string;
  @IsOptional() @IsString() @MaxLength(100000) headerLeftHtml?: string;
  @IsOptional() @IsString() @MaxLength(100000) headerRightHtml?: string;
  @IsOptional() @IsString() @MaxLength(100000) footerHtml?: string;

  // Body section
  @IsOptional() @IsString() @MaxLength(16) bodySplit?: string;
  @IsOptional() @IsString() @MaxLength(16) bodyLeftTopMargin?: string;
  @IsOptional() @IsString() @MaxLength(16) bodyRightTopMargin?: string;
  @IsOptional() @IsBoolean() bodyBottomLine?: boolean;
}
