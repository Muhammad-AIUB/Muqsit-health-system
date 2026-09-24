import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { Observable } from 'rxjs';

export const CACHE_CONTROL_KEY = 'mhs:cache-control';

// Opt ONE read-only, non-patient route into browser caching, e.g.
// `@CacheControl('private, max-age=86400')` on the medicine formulary search.
//
// ⚕️ Everything else under /api answers `Cache-Control: no-store` (set in
// main.ts before any handler runs). Clinic and ward PCs are shared machines:
// a cached patient list must never be served from disk to the next person at
// the keyboard, or by a proxy to another practice.
export const CacheControl = (value: string) =>
  SetMetadata(CACHE_CONTROL_KEY, value);

@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const explicit = this.reflector.get<string | undefined>(
      CACHE_CONTROL_KEY,
      ctx.getHandler(),
    );
    if (explicit && !this.hasHeaderDecorator(ctx)) {
      ctx
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Cache-Control', explicit);
    }
    return next.handle();
  }

  // A route that sets Cache-Control itself with @Header() (the SSE mirror
  // stream) keeps its own value.
  private hasHeaderDecorator(ctx: ExecutionContext): boolean {
    const headers =
      this.reflector.get<{ name: string; value: string }[] | undefined>(
        HEADERS_METADATA,
        ctx.getHandler(),
      ) ?? [];
    return headers.some((h) => h.name.toLowerCase() === 'cache-control');
  }
}
