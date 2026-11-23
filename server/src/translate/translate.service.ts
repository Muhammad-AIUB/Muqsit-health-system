import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const URL_DEFAULT = 'https://api.sarvam.ai/translate';
const TIMEOUT_MS = 15_000;

export interface TranslatedLine {
  /** The line exactly as sent. */
  source: string;
  /** The machine's Bangla, or null when this line could not be translated. */
  bn: string | null;
}

/**
 * ⚕️ Machine translation of a prescription's ADVICE lines English → Bangla
 * (Sarvam). The result is only a DRAFT: the doctor reads and edits it in the
 * client's review box before anything is printed (physician's decision,
 * 2026-11-23). Nothing here is stored, and only the advice text is sent — no
 * patient name, mobile or id.
 */
@Injectable()
export class TranslateService {
  private readonly logger = new Logger(TranslateService.name);
  private readonly key?: string;
  private readonly url: string;

  constructor(config: ConfigService) {
    this.key = config.get<string>('SARVAM_API_KEY');
    this.url = config.get<string>('SARVAM_API_URL') ?? URL_DEFAULT;
    if (!this.key) this.logger.warn('SARVAM_API_KEY is not set — advice cannot be translated.');
  }

  async translateAdvice(lines: string[]): Promise<TranslatedLine[]> {
    if (!this.key) throw new ServiceUnavailableException('Translation is not set up on this server.');
    return Promise.all(lines.map(async (source) => ({ source, bn: source.trim() ? await this.one(source) : '' })));
  }

  private async one(text: string): Promise<string | null> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': this.key as string },
        body: JSON.stringify({
          input: text,
          source_language_code: 'en-IN',
          target_language_code: 'bn-IN',
          model: 'mayura:v1',
          mode: 'formal',
        }),
        signal: ac.signal,
      });
      if (!res.ok) {
        this.logger.warn(`Sarvam answered HTTP ${res.status}`); // never the text: it is clinical
        return null;
      }
      const body = (await res.json()) as { translated_text?: unknown };
      const out = typeof body.translated_text === 'string' ? body.translated_text.trim() : '';
      return out || null;
    } catch (e) {
      this.logger.warn(`Sarvam call failed: ${e instanceof Error ? e.name : 'error'}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
