import { IsISO8601, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

// `main.ts` runs ValidationPipe({ whitelist: true }) — anything not declared
// here is silently stripped.
export class SaveRevisionNoteDto {
  /**
   * The notebook as formatted HTML. 2,000,000 characters: Bangla is three bytes
   * a character, so the longest notebook still fits the 8 MB body limit. The
   * client refuses a longer one before sending (`REVISION_NOTES_MAX`).
   */
  @IsString() @MaxLength(2_000_000) html!: string;

  /**
   * The `updatedAt` of the copy this save was written from, or null when the
   * writer saw no notebook yet. A save from any other copy is refused (409).
   */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsISO8601({ strict: true }) baseUpdatedAt?: string | null;
}
