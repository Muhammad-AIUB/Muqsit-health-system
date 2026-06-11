import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAdmissionDto {
  @IsString() @MinLength(1) bed!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() diagnosis?: string;

  @IsOptional()
  @IsIn(['Stable', 'Observation', 'Critical', 'Discharge'])
  status?: string;
}

export class UpdateAdmissionStatusDto {
  @IsIn(['Stable', 'Observation', 'Critical', 'Discharge'])
  status!: string;
}

export class CreateIpdEventDto {
  @IsString() @MinLength(1) note!: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() reportUrl?: string;
}
