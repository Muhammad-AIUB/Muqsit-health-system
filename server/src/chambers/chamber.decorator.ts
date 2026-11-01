import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// The raw `X-Chamber` header: the chamber the client has chosen (multi-chamber,
// 01/11/2026). It is a CLAIM, never trusted — pass it to
// `ChambersService.resolve(doctorId, raw)`, the one place that decides which
// chamber a request acts on (and answers 404 for one that is not this
// practice's).
export const ChamberHeader = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
  const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
  const raw = req.headers['x-chamber'];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
});
