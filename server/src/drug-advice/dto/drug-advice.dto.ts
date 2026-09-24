import { ArrayMaxSize, IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ADVICE_SCOPES, AdviceScope } from '../keys';

// `main.ts` runs ValidationPipe({ whitelist: true }) — anything not declared
// here is silently stripped.
export class SaveDrugAdviceDto {
  @IsIn(ADVICE_SCOPES as unknown as string[]) scope!: AdviceScope;

  /** The medicine line (scope "medicine") or the generic name (scope "generic"). */
  @IsString() @MinLength(1) @MaxLength(300) label!: string;

  /** The whole list after the edit — an empty list clears the advice. */
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(400, { each: true })
  lines!: string[];
}
