import { IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateAdmissionDto {
  @IsString() @MinLength(1) bed!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() hospitalId?: string;
  @IsOptional() @IsString() roomNo?: string;
  @IsOptional() @IsString() wardNo?: string;
  @IsOptional() @IsString() floorBuilding?: string;
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'Mobile number must be exactly 11 digits' })
  mobile?: string;
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
