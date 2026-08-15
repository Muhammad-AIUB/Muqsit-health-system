import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

// A ward name is matched exactly (per practice) and printed on admissions, so
// trim it here rather than storing "Ward 3" and " Ward 3" as two wards.
const trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class CreateWardDto {
  @trim()
  @IsString()
  @MinLength(1, { message: 'Enter a ward name' })
  @MaxLength(60, { message: 'Ward name must be 60 characters or fewer' })
  name!: string;
}

export class UpdateWardDto {
  @trim()
  @IsString()
  @MinLength(1, { message: 'Enter a ward name' })
  @MaxLength(60, { message: 'Ward name must be 60 characters or fewer' })
  name!: string;
}

// Add a registered user to a ward's team.
export class AddTeamMemberDto {
  @IsString()
  @MaxLength(64)
  userId!: string;

  // Optional starting grants. Absent → no permissions (read-only) until the
  // doctor ticks them; a ward team has no "default access" set to inherit,
  // because the physician asked for per-member ticks.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  permissions?: string[];
}

export class UpdateTeamMemberDto {
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
