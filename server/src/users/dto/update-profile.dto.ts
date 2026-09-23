import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

// One of the doctor's own investigation groups: a name and the test names it
// adds to Advised tests / investigation in one tick.
export class InvestigationGroupInput {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  tests!: string[];
}

// One extra certificate the doctor uploaded from their profile page. URL
// is required; details is a free-form note describing the credential.
export class OtherCertificateInput {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;
}

// One practice location. Sent as a list from the client; the server diffs
// against the current rows and replaces. mapLink is optional and may be
// any URL the doctor wants to share (Google Maps share link is typical).
export class ChamberInput {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1, { message: 'Chamber address is required' })
  @MaxLength(500)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mapLink?: string;
}

export class UpdateProfileDto {
  // Editable signature/display name shown on printed prescriptions.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'Mobile number must be exactly 11 digits' })
  mobile?: string;

  // Note: registrationNo (BMDC) is intentionally NOT in this DTO. It identifies
  // the practitioner with the regulator and must not be self-editable — an
  // admin changes it through the admin app if it ever has to be corrected.

  @IsOptional()
  @IsString()
  @MaxLength(64)
  nidNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  designation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  specialty?: string;

  // Image URLs (already uploaded via /uploads/image). Empty string clears.
  @IsOptional()
  @IsString()
  profilePictureUrl?: string;

  // Note: registrationCertUrl (BMDC certificate) is intentionally NOT here.
  // It's the proof tied to the BMDC number and must be rotated through the
  // admin app, not by the user themselves.

  @IsOptional()
  @IsString()
  nidFrontUrl?: string;

  @IsOptional()
  @IsString()
  nidBackUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OtherCertificateInput)
  otherCertificates?: OtherCertificateInput[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChamberInput)
  chambers?: ChamberInput[];

  // Favourite investigation test names (populate the "Favourite" category).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  favouriteInvestigations?: string[];

  // Per-test preferred unit: { [testName]: "u1" | "u2" }.
  @IsOptional()
  @IsObject()
  investigationUnitPrefs?: Record<string, string>;

  // Recently-typed chip entries per clinical field: { [fieldLabel]: string[] }.
  @IsOptional()
  @IsObject()
  fieldRecents?: Record<string, string[]>;

  // The doctor's investigation groups. The whole list is sent on every save.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvestigationGroupInput)
  investigationGroups?: InvestigationGroupInput[];
}
