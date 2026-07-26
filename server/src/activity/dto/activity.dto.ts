import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateActivityDto {
  @IsString() @MinLength(1) @MaxLength(60) section!: string;
  @IsString() @MinLength(1) @MaxLength(400) detail!: string;
  @IsOptional() @IsString() @MaxLength(160) patientName?: string;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsIn(['added', 'saved']) action?: 'added' | 'saved';
  // imageUrl is rendered as a clickable link on the shared practice feed, so it
  // must be an http(s) URL only — a javascript:/data: scheme is a stored-XSS
  // vector (mirrors the chat attachmentUrl guard).
  @IsOptional() @IsString() @MaxLength(600) @Matches(/^https?:\/\//i, { message: 'imageUrl must be an http(s) URL' }) imageUrl?: string;
}
