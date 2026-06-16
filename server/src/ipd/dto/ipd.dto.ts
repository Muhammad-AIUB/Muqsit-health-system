import { IsIn, IsInt, IsObject, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

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

// Edit an admission's header fields + clinical sheet (IPD detail view).
export class UpdateAdmissionDto {
  @IsOptional() @IsString() bed?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() hospitalId?: string;
  @IsOptional() @IsString() roomNo?: string;
  @IsOptional() @IsString() wardNo?: string;
  @IsOptional() @IsString() floorBuilding?: string;
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'Mobile number must be exactly 11 digits' })
  mobile?: string;
  @IsOptional() @IsString() diagnosis?: string;
  @IsOptional() @Type(() => Number) @IsInt() age?: number;
  @IsOptional() @IsString() sex?: string;
  // { chiefComplaints, investigation, procedure, followUp, plan, adviceTests, rxItems }
  @IsOptional() @IsObject() clinical?: Record<string, unknown>;
}

export class CreateIpdEventDto {
  @IsString() @MinLength(1) note!: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() reportUrl?: string;
}
