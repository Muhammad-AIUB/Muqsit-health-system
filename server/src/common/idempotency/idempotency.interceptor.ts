import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, mergeMap, switchMap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

// ⚕️ Idempotency for POST routes that file clinical records.
//
// A prescription save that times out on a clinic connection leaves the doctor
// not knowing whether it was stored. Without this, the natural retry files the
// prescription TWICE (two rows, two habit counts, two activity lines). With an
// `Idempotency-Key` header the first request claims the key, its response is
// stored, and every replay with the same key + same body gets that stored
// response back — the record is written exactly once.
//
// Rules:
//  - No header → the route behaves exactly as before (old tabs keep working).
//  - Same key, same body, finished → replay the stored response (header
//    `Idempotency-Replayed: true`).
//  - Same key, DIFFERENT body → 422. The earlier request already wrote a
//    record; silently writing a second, different one is the failure mode we
//    are guarding against.
//  - Same key, still running → 409 (retry in a moment).
//  - Handler threw → the key is released so the retry can run the handler.
//
// Keys are scoped to the signed-in USER (the actor who generated the key), not
// the workstation doctor: it is the client that made the key, and this is not
// a patient-data scope (WorkstationGuard remains the only scoping authority).

export const IDEMPOTENCY_HEADER = 'idempotency-key';
const MAX_KEY_LENGTH = 128;
const RETENTION_MS = 24 * 60 * 60 * 1000;
// A claim with no response after this long belongs to a request the process
// died on (deploy restarts pm2 mid-request). It is treated as abandoned.
const ABANDONED_AFTER_MS = 60 * 1000;

type Claim =
  | { kind: 'fresh'; id: string }
  | { kind: 'replay'; statusCode: number; body: unknown };

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request & { user?: { id?: string } }>();
    const res = http.getResponse<Response>();

    const raw = req.headers[IDEMPOTENCY_HEADER];
    const key = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!key) return next.handle();
    if (key.length > MAX_KEY_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`,
      );
    }
    const userId = req.user?.id;
    if (!userId) return next.handle(); // JwtAuthGuard already refused anonymous calls

    const route = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`;
    const requestHash = sha256(stableStringify(req.body ?? null));
    const successStatus =
      this.reflector.get<number>(HTTP_CODE_METADATA, ctx.getHandler()) ??
      (req.method === 'POST' ? 201 : 200);

    return from(this.claim(userId, key, route, requestHash)).pipe(
      switchMap((claim) => {
        if (claim.kind === 'replay') {
          res.setHeader('Idempotency-Replayed', 'true');
          return of(claim.body);
        }
        return next.handle().pipe(
          mergeMap(async (body) => {
            await this.prisma.idempotencyKey.update({
              where: { id: claim.id },
              data: {
                statusCode: successStatus,
                // Round-trip through JSON so Dates become the ISO strings the
                // client saw on the wire; a replay is byte-for-byte the same.
                responseBody: JSON.parse(JSON.stringify(body ?? null)),
              },
            });
            return body;
          }),
          catchError((err) =>
            from(
              this.prisma.idempotencyKey
                .delete({ where: { id: claim.id } })
                .catch(() => undefined),
            ).pipe(mergeMap(() => throwError(() => err))),
          ),
        );
      }),
    );
  }

  private async claim(
    userId: string,
    key: string,
    route: string,
    requestHash: string,
    retried = false,
  ): Promise<Claim> {
    try {
      const row = await this.prisma.idempotencyKey.create({
        data: { userId, key, route, requestHash },
      });
      this.pruneOccasionally();
      return { kind: 'fresh', id: row.id };
    } catch (e) {
      if (
        !(e instanceof Prisma.PrismaClientKnownRequestError) ||
        e.code !== 'P2002'
      ) {
        throw e;
      }
    }

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (!existing) {
      throw new ConflictException(
        'This request is still being processed. Please try again in a moment.',
      );
    }
    if (existing.route !== route || existing.requestHash !== requestHash) {
      throw new UnprocessableEntityException(
        'This Idempotency-Key was already used for a different request.',
      );
    }
    if (existing.statusCode == null) {
      const age = Date.now() - existing.createdAt.getTime();
      if (age > ABANDONED_AFTER_MS && !retried) {
        await this.prisma.idempotencyKey
          .delete({ where: { id: existing.id } })
          .catch(() => undefined);
        return this.claim(userId, key, route, requestHash, true);
      }
      throw new ConflictException(
        'This request is still being processed. Please try again in a moment.',
      );
    }
    return {
      kind: 'replay',
      statusCode: existing.statusCode,
      body: existing.responseBody,
    };
  }

  // Ledger rows are not patient data; they only need to outlive a retry window.
  private pruneOccasionally() {
    if (Math.random() > 0.02) return;
    void this.prisma.idempotencyKey
      .deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
      })
      .catch(() => undefined);
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

// Key order must not change the hash: two JSON encodings of the same object
// are the same request.
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}
