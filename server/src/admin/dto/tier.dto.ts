import { IsIn } from 'class-validator';

export class TierDto {
  @IsIn(['primary', 'secondary'])
  tier!: 'primary' | 'secondary';
}
