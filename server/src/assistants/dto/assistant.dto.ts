import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Add a registered user as an assistant of the current doctor.
export class AddAssistantDto {
  @IsString()
  @MaxLength(64)
  assistantId!: string;
}

// Set the doctor's default permission set (applied to new assistants).
export class SetDefaultsDto {
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  permissions!: string[];
}

// Update an assistant link — set the granted permissions and/or status.
export class UpdateAssistantDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  permissions?: string[];

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';
}
