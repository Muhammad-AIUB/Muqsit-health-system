import { ServiceUnavailableException } from '@nestjs/common';
import { TranslateService } from './translate.service';
import type { ConfigService } from '@nestjs/config';

const cfg = (env: Record<string, string>) => ({ get: (k: string) => env[k] }) as unknown as ConfigService;

describe('TranslateService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('refuses when no key is set', async () => {
    await expect(new TranslateService(cfg({})).translateAdvice(['Drink water'])).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('sends only the advice text, with the key in the header, and keeps the line order', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_u, init) => {
      const { input } = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ translated_text: `BN(${input})` }), { status: 200 });
    });
    const out = await new TranslateService(cfg({ SARVAM_API_KEY: 'k' })).translateAdvice(['One', 'Two']);
    expect(out).toEqual([{ source: 'One', bn: 'BN(One)' }, { source: 'Two', bn: 'BN(Two)' }]);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['api-subscription-key']).toBe('k');
    expect(JSON.parse(String(init.body))).toMatchObject({ source_language_code: 'en-IN', target_language_code: 'bn-IN' });
  });

  it('a line that fails comes back as null, never as the English passed off as Bangla', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (_u, init) => {
      const { input } = JSON.parse(String(init?.body));
      return input === 'bad' ? new Response('no', { status: 500 }) : new Response(JSON.stringify({ translated_text: 'ঠিক' }), { status: 200 });
    });
    const out = await new TranslateService(cfg({ SARVAM_API_KEY: 'k' })).translateAdvice(['ok', 'bad']);
    expect(out).toEqual([{ source: 'ok', bn: 'ঠিক' }, { source: 'bad', bn: null }]);
  });

  it('a network error or an unreadable answer is null too', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('down'));
    expect(await new TranslateService(cfg({ SARVAM_API_KEY: 'k' })).translateAdvice(['x'])).toEqual([{ source: 'x', bn: null }]);
  });
});
