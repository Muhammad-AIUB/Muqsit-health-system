import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class OpdSmsPreviewDto {
  // yyyy-mm-dd, Dhaka; checked in the service (a real day, not one that has passed).
  @IsString()
  date!: string;

  @IsIn(['en', 'bn'], { message: 'Choose Bangla or English.' })
  language!: 'en' | 'bn';

  // The chamber is not a body field: it is the queue's, from the X-Chamber
  // header (ChambersService.resolve), like every OPD call.
}

export class OpdSmsSendDto extends OpdSmsPreviewDto {
  // The preview's `signature`: what is sent must be what the doctor saw.
  @IsString()
  previewSignature!: string;

  // A patient sent this same SMS within 30 minutes is sent it again only with this.
  @IsOptional()
  @IsBoolean()
  confirmRepeat?: boolean;
}

export const MAX_SMS_PER_REQUEST = 1_000_000;
export const MAX_TAKA_PER_REQUEST = 10_000_000;

export class CreatePaymentRequestDto {
  @IsIn(['sms', 'renew'], { message: 'Choose Buy SMS or Renew.' })
  kind!: 'sms' | 'renew';

  // Buy SMS: how many SMS (1 SMS = 1 taka) — required, checked in the service.
  // Renew: how many MONTHS of the monthly subscription (physician, 01/11/2026:
  // "Renew means monthly subscription fees") — optional.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Enter a whole number.' })
  @Min(1, { message: 'Enter at least 1.' })
  @Max(MAX_SMS_PER_REQUEST)
  quantity?: number;

  // What the doctor will pay or has paid, in taka, as they type it.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Amount must be a whole number of taka.' })
  @Min(1, { message: 'Amount must be at least 1 taka.' })
  @Max(MAX_TAKA_PER_REQUEST)
  amount?: number;

  // e.g. how and when it was paid.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreditPaymentRequestDto {
  // Taka put into the wallet (= SMS). Required to credit a Buy SMS request.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Credit must be a whole number of taka.' })
  @Min(1, { message: 'Credit must be at least 1 taka.' })
  @Max(MAX_SMS_PER_REQUEST)
  credit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectPaymentRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
