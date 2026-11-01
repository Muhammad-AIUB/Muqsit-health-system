import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// `main.ts` runs ValidationPipe({ whitelist: true }) — anything not declared
// here is silently stripped (server/CLAUDE.md, Rule 3).

export const DRUG_SAFETY_KINDS = ['drug', 'text'] as const;
export type DrugSafetyKind = (typeof DRUG_SAFETY_KINDS)[number];

/** POST /patients/:id/drug-safety — one entry at a time. */
export class AddDrugSafetyDto {
  @IsIn(DRUG_SAFETY_KINDS as unknown as string[]) kind!: DrugSafetyKind;

  /** kind "drug": the medicine as picked from the catalogue, or as typed. */
  @IsOptional() @IsString() @MaxLength(200) brand?: string;
  /** kind "drug": the catalogue row's generic name; absent when none is known. Never guessed. */
  @IsOptional() @IsString() @MaxLength(300) generic?: string;
  @IsOptional() @IsBoolean() hypersensitive?: boolean;
  @IsOptional() @IsBoolean() highAlert?: boolean;

  /** kind "text": the line exactly as typed. */
  @IsOptional() @IsString() @MaxLength(500) text?: string;
}

/**
 * PATCH /patients/:id/drug-safety/:entryId — a drug entry's two ticks, or a
 * text entry's words. The medicine of a drug entry is not changed here: a
 * different medicine is another entry.
 */
export class UpdateDrugSafetyDto {
  @IsOptional() @IsBoolean() hypersensitive?: boolean;
  @IsOptional() @IsBoolean() highAlert?: boolean;
  @IsOptional() @IsString() @MaxLength(500) text?: string;
}
