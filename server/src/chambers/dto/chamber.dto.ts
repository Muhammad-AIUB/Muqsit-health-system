import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateChamberDto {
  @IsString() @MinLength(1, { message: 'Give the chamber a name.' }) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}

export class UpdateChamberDto {
  @IsOptional() @IsString() @MinLength(1, { message: 'Give the chamber a name.' }) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
