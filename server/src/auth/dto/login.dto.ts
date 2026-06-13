import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  // Email address OR 11-digit mobile number.
  @IsString()
  @MinLength(1, { message: 'Email or phone is required' })
  identifier!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  // "Remember me" — when true the refresh cookie persists across browser
  // restarts (30 days). When false it's a session cookie and the
  // server-side token expires in hours, not days.
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
