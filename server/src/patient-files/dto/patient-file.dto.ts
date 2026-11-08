import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// `main.ts` runs ValidationPipe({ whitelist: true }) — anything not declared
// here is silently stripped (server/CLAUDE.md, Rule 3). These arrive as the
// text fields of a multipart upload.

export const PATIENT_FILE_KINDS = ['permission', 'dicom'] as const;
export type PatientFileKind = (typeof PATIENT_FILE_KINDS)[number];

export class UploadPatientFileDto {
  /** What the doctor calls it ("MRI whole abdomen"). Required for DICOM. */
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  /** dd/mm/yyyy — the date of the permission / study. Today when absent. */
  @IsOptional() @Matches(/^\d{2}\/\d{2}\/\d{4}$/, { message: 'fileDate must be dd/mm/yyyy' }) fileDate?: string;
}
