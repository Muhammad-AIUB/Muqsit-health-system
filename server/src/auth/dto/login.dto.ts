import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  // Email address OR 11-digit mobile number.
  @IsString()
  @MinLength(1, { message: 'Email or phone is required' })
  identifier!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
