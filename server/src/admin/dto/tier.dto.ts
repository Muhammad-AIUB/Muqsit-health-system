import { IsIn } from 'class-validator';

export class TierDto {
  @IsIn(['primary', 'secondary', 'premium'])
  tier!: 'primary' | 'secondary' | 'premium';
}
