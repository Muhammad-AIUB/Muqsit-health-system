import { IsBoolean, IsOptional } from 'class-validator';

// Admin → account → Profile settings: the two switches. Either or both; a field
// that is not sent is left as it is.
export class DoctorSettingsDto {
  // This practice works on its own patients only (no opening another doctor's
  // patient by the patient's code, and none of its patients opened that way).
  @IsOptional()
  @IsBoolean()
  isolated?: boolean;

  // The practice's screens and printed prescriptions leave the MHS mark off.
  @IsOptional()
  @IsBoolean()
  hideMhsLogo?: boolean;
}

// (The Point system's body has no DTO on purpose: `PUT /admin/users/:id/point-scores`
// reads `@Body('scores')` raw and `point-system.ts#checkScores` judges the whole
// value — class-transformer crashes (500) on a nested object with a `constructor`
// key, and would silently drop `constructor` / `__proto__` keys instead of refusing.)
