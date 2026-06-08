import {
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const PROFESSIONS = [
  'doctor',
  'intern_doctor',
  'nurse',
  'medical_technologist',
  'computer_operator',
] as const;

export type Profession = (typeof PROFESSIONS)[number];

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @Matches(/^\d{11}$/, { message: 'Mobile number must be exactly 11 digits' })
  mobile!: string;

  @IsIn(PROFESSIONS, { message: 'Invalid profession' })
  profession!: Profession;

  // Required for everyone except the computer operator role.
  @ValidateIf((o) => o.profession !== 'computer_operator')
  @IsString()
  @MinLength(1, { message: 'Registration number is required' })
  registrationNo?: string;

  @IsString()
  @MinLength(1)
  nidNo!: string;

  @IsString()
  @MinLength(1)
  designation!: string;

  @IsString()
  @MinLength(1)
  specialty!: string;

  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/,
    {
      message:
        'Password must be at least 8 characters and include uppercase, lowercase, a number and a special character',
    },
  )
  password!: string;

  // Cloudinary URLs produced by POST /uploads/image on the client.
  // Every role uploads a certificate (qualification cert for computer operators).
  @IsString()
  @MinLength(1, { message: 'Document/certificate upload is required' })
  registrationCertUrl!: string;

  @IsString()
  nidFrontUrl!: string;

  @IsString()
  nidBackUrl!: string;

  @IsString()
  @MinLength(1, { message: 'Profile picture is required' })
  profilePictureUrl!: string;
}
