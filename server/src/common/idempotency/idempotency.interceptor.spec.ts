import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { lastValueFrom, of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import type { PrismaService } from '../../prisma/prisma.service';

// ⚕️ A retried prescription save must file the record ONCE. These tests pin
// the four outcomes of the ledger: fresh claim, replay, mismatch, in-flight.

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });

function build(existing: Record<string, unknown> | null, createFails = false) {
  const create = jest.fn().mockImplementation(async ({ data }) => {
    if (createFails) throw p2002();
    return { id: 'claim-1', ...data };
  });
  const update = jest.fn().mockResolvedValue({});
  const del = jest.fn().mockResolvedValue({});
  const findUnique = jest.fn().mockResolvedValue(existing);
  const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    idempotencyKey: { create, update, delete: del, findUnique, deleteMany },
  } as unknown as PrismaService;
  const interceptor = new IdempotencyInterceptor(prisma, new Reflector());
  return { interceptor, create, update, del, findUnique };
}

function ctx(
  headers: Record<string, string>,
  body: unknown,
  user = { id: 'u1' },
) {
  const res = { setHeader: jest.fn(), statusCode: 200 };
  const req = {
    headers,
    body,
    user,
    method: 'POST',
    baseUrl: '/api',
    path: '/prescriptions',
    route: { path: '/prescriptions' },
  };
  return {
    ctx: {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      getHandler: () => function handler() {},
    } as never,
    res,
  };
}

const KEY = { 'idempotency-key': 'abc' };

describe('IdempotencyInterceptor', () => {
  it('passes straight through when no header is sent (old tabs keep working)', async () => {
    const { interceptor, create } = build(null);
    const handler = { handle: () => of({ id: 'rx-1' }) };
    const out = await lastValueFrom(
      interceptor.intercept(ctx({}, { a: 1 }).ctx, handler),
    );
    expect(out).toEqual({ id: 'rx-1' });
    expect(create).not.toHaveBeenCalled();
  });

  it('claims a fresh key, runs the handler once and stores its response', async () => {
    const { interceptor, create, update } = build(null);
    const handle = jest.fn(() =>
      of({ id: 'rx-1', createdAt: new Date('2026-01-01') }),
    );
    const out = await lastValueFrom(
      interceptor.intercept(ctx(KEY, { a: 1 }).ctx, { handle }),
    );

    expect(out).toEqual({ id: 'rx-1', createdAt: new Date('2026-01-01') });
    expect(handle).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      key: 'abc',
    });
    expect(update.mock.calls[0][0].data).toEqual({
      statusCode: 201,
      responseBody: { id: 'rx-1', createdAt: '2026-01-01T00:00:00.000Z' },
    });
  });

  it('replays the stored response for the same key + same body without running the handler', async () => {
    const { interceptor: first, create } = build(null);
    await lastValueFrom(
      first.intercept(ctx(KEY, { b: 2, a: 1 }).ctx, { handle: () => of({}) }),
    );
    const requestHash = create.mock.calls[0][0].data.requestHash as string;

    const { interceptor, findUnique } = build(
      {
        route: 'POST /api/prescriptions',
        requestHash,
        statusCode: 201,
        responseBody: { id: 'rx-1' },
        createdAt: new Date(),
      },
      true,
    );
    const handle = jest.fn(() => of({ id: 'rx-2' }));
    // Same body, different key order → same hash → replay.
    const c = ctx(KEY, { a: 1, b: 2 });
    const out = await lastValueFrom(interceptor.intercept(c.ctx, { handle }));

    expect(out).toEqual({ id: 'rx-1' });
    expect(handle).not.toHaveBeenCalled();
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId_key: { userId: 'u1', key: 'abc' } },
    });
    expect(c.res.setHeader).toHaveBeenCalledWith(
      'Idempotency-Replayed',
      'true',
    );
  });

  it('refuses the same key with a DIFFERENT body (422) — never files a second, different record', async () => {
    const { interceptor } = build(
      {
        route: 'POST /api/prescriptions',
        requestHash: 'other',
        statusCode: 201,
        responseBody: {},
        createdAt: new Date(),
      },
      true,
    );
    const handle = jest.fn(() => of({}));
    await expect(
      lastValueFrom(interceptor.intercept(ctx(KEY, { a: 1 }).ctx, { handle })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(handle).not.toHaveBeenCalled();
  });

  it('answers 409 while the first request is still running', async () => {
    const { interceptor: first, create } = build(null);
    await lastValueFrom(
      first.intercept(ctx(KEY, { a: 1 }).ctx, { handle: () => of({}) }),
    );
    const requestHash = create.mock.calls[0][0].data.requestHash as string;

    const { interceptor } = build(
      {
        route: 'POST /api/prescriptions',
        requestHash,
        statusCode: null,
        responseBody: null,
        createdAt: new Date(),
      },
      true,
    );
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx(KEY, { a: 1 }).ctx, { handle: () => of({}) }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('releases the key when the handler fails so the retry can run it again', async () => {
    const { interceptor, del, update } = build(null);
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx(KEY, { a: 1 }).ctx, {
          handle: () => throwError(() => new Error('db down')),
        }),
      ),
    ).rejects.toThrow('db down');
    expect(del).toHaveBeenCalledWith({ where: { id: 'claim-1' } });
    expect(update).not.toHaveBeenCalled();
  });
});
