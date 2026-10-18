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

  /**
   * The id of the user the writer believes is signed in — whose notebook this
   * text is. A save for anyone but the session's own user is refused (409):
   * two tabs share one login cookie, so a tab still showing one doctor can
   * send under the next one's session. Optional only so that a page from
   * before it reaches the service and is refused THERE, with a 409 it shows
   * as written (a 400 it words itself and stops saving) — a save that does
   * not say whose text it is is not written anywhere.
   */
  @IsOptional() @IsString() @MaxLength(64) expectedUserId?: string | null;
}
