import { IsEmail, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  email!: string;

  @Matches(/^\d{6}$/, { message: 'OTP must be a 6-digit code' })
  otp!: string;
}

export class ResendOtpDto {
  @IsEmail()
  email!: string;
}
