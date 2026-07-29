import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsResult {
  ok: boolean;
  /** Doctor/operator-facing reason. Never empty — a silent failure is the bug. */
  detail: string;
  /** Round-trip milliseconds. The OTP flow is unusable if this is slow. */
  ms: number;
  /** Raw provider response body, truncated. Kept because the provider's success
   *  shape is not documented in a way we can trust until we have seen it. */
  raw?: string;
}

/** How long to wait on the gateway before giving up. A doctor is standing in
 *  front of a patient; hanging forever is worse than a clear failure. */
const TIMEOUT_MS = 15_000;
const DEFAULT_URL = 'https://www.24bulksmsbd.com/api/smsSendApi';

/**
 * Normalise a Bangladeshi mobile to the 11-digit `01XXXXXXXXX` form the gateway
 * expects. Accepts `+8801…`, `8801…`, `1…`. Returns null for anything that is
 * not a plausible BD mobile — we refuse to send rather than guess, because a
 * guessed digit sends a patient's access code to a stranger.
 */
export function normaliseBdMobile(input: string): string | null {
  const d = (input || '').replace(/\D/g, '');
  let n = d;
  if (n.startsWith('880')) n = '0' + n.slice(3);
  else if (n.length === 10 && n.startsWith('1')) n = '0' + n;
  return /^01[3-9]\d{8}$/.test(n) ? n : null;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly customerId?: string;
  private readonly apiKey?: string;
  private readonly url: string;
  /** Log the provider's raw body for the first few sends so the success shape
   *  gets discovered from real traffic instead of assumed. */
  private rawLogsLeft = 5;

  constructor(private readonly config: ConfigService) {
    this.customerId = this.config.get<string>('SMS_CUSTOMER_ID');
    this.apiKey = this.config.get<string>('SMS_API_KEY');
    this.url = this.config.get<string>('SMS_API_URL') ?? DEFAULT_URL;
    if (!this.configured) {
      this.logger.warn(
        'SMS not configured (SMS_CUSTOMER_ID / SMS_API_KEY) — messages will be logged to the console instead of sent.',
      );
    }
  }

  get configured(): boolean {
    return !!(this.customerId && this.apiKey);
  }

  /**
   * Send one SMS. Never throws and never resolves to a bare boolean: the caller
   * has to be able to tell the doctor *why* it failed. Mirrors MailService's
   * unconfigured behaviour — log instead of send, so dev works without credentials.
   */
  async send(to: string, message: string): Promise<SmsResult> {
    const started = Date.now();
    const mobile = normaliseBdMobile(to);
    if (!mobile) {
      return { ok: false, detail: `Not a valid Bangladeshi mobile number: "${to}"`, ms: 0 };
    }
    if (!this.configured) {
      this.logger.log(`[sms:dev] to=${mobile} message=${message}`);
      return { ok: true, detail: 'SMS not configured — logged to console (dev)', ms: 0 };
    }

    const body = new URLSearchParams({
      customer_id: this.customerId as string,
      api_key: this.apiKey as string,
      message,
      mobile_no: mobile,
    });

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: ac.signal,
      });
      const raw = (await res.text()).slice(0, 500);
      const ms = Date.now() - started;

      if (this.rawLogsLeft > 0) {
        this.rawLogsLeft -= 1;
        this.logger.log(`[sms] HTTP ${res.status} in ${ms}ms — raw: ${raw}`);
      }

      if (!res.ok) {
        return { ok: false, detail: `Gateway returned HTTP ${res.status}`, ms, raw };
      }
      // The gateway answers 200 for business-level failures too (bad key, no
      // balance), so HTTP status alone is not proof of delivery. Treat an
      // explicit error word in the body as failure and surface the body.
      if (/error|fail|invalid|insufficient|unauthor/i.test(raw)) {
        return { ok: false, detail: `Gateway rejected the message: ${raw}`, ms, raw };
      }
      return { ok: true, detail: 'Sent', ms, raw };
    } catch (e) {
      const ms = Date.now() - started;
      const aborted = e instanceof Error && e.name === 'AbortError';
      return {
        ok: false,
        detail: aborted
          ? `SMS gateway did not respond within ${TIMEOUT_MS / 1000}s`
          : `SMS gateway unreachable: ${e instanceof Error ? e.message : String(e)}`,
        ms,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
