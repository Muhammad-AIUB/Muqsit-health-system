import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateActivityDto {
  @IsString() @MinLength(1) @MaxLength(60) section!: string;
  @IsString() @MinLength(1) @MaxLength(400) detail!: string;
  @IsOptional() @IsString() @MaxLength(160) patientName?: string;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsIn(['added', 'saved']) action?: 'added' | 'saved';
  @IsOptional() @IsString() @MaxLength(600) imageUrl?: string;
}
