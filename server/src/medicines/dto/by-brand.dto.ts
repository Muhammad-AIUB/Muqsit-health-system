import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

// `main.ts` runs ValidationPipe({ whitelist: true }) — anything not declared
// here is silently stripped.
export class MedicinesByBrandDto {
  /**
   * The first word of each brand on the ℞ pad (`Tablet. Napa 500 mg` → `napa`),
   * as the client reads it. 100 is far more medicines than a prescription holds.
   */
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(100, { each: true })
  words!: string[];
}
