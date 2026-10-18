import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RevisionNotesService } from './revision-notes.service';
import type { PrismaService } from '../prisma/prisma.service';

// "Revision Notes" (physician's sheet, 18/10/2026, item 4): a notebook of the
// SIGNED-IN user's own — keyed by the authenticated user's id, never the
// workstation doctor's, so nobody else (an assistant included) reads it. And a
// save made from a copy that is no longer the stored one is REFUSED, never
// written over it: two devices open on one notebook must not lose each
// other's pages without a word.

const T1 = new Date('2026-10-18T10:00:00.000Z');
const T2 = new Date('2026-10-18T10:05:00.000Z');

const make = (stored: { html: string; updatedAt: Date } | null) => {
  const findUnique = jest.fn().mockResolvedValue(stored);
  const create = jest.fn(async (a: { data: { html: string } }) => ({ html: a.data.html, updatedAt: T2 }));
  const update = jest.fn(async (a: { data: { html: string } }) => ({ html: a.data.html, updatedAt: T2 }));
  const prisma = { doctorRevisionNote: { findUnique, create, update } } as unknown as PrismaService;
  return { svc: new RevisionNotesService(prisma), findUnique, create, update };
};

describe('RevisionNotesService', () => {
  it("reads the signed-in user's own notebook", async () => {
    const { svc, findUnique } = make({ html: '<b>x</b>', updatedAt: T1 });
    await expect(svc.get('doc-1')).resolves.toEqual({ html: '<b>x</b>', updatedAt: T1 });
    expect(findUnique.mock.calls[0][0].where).toEqual({ userId: 'doc-1' });
  });

  it('answers null when there is no notebook yet', async () => {
    await expect(make(null).svc.get('doc-1')).resolves.toBeNull();
  });

  it('creates the first notebook under the signed-in user', async () => {
    const { svc, create } = make(null);
    await svc.save('doc-1', { html: 'first', baseUpdatedAt: null });
    expect(create.mock.calls[0][0].data).toEqual({ userId: 'doc-1', html: 'first' });
  });

  it('saves over the copy it was written from, and answers with the row it wrote', async () => {
    const { svc, update, findUnique } = make({ html: 'old', updatedAt: T1 });
    await expect(svc.save('doc-1', { html: 'new', baseUpdatedAt: T1.toISOString() })).resolves.toEqual({ html: 'new', updatedAt: T2 });
    // ONE statement: the write is conditional on the stored copy being that one,
    // and what it returns is what it wrote — no second read another save could
    // land before (review, 18/10/2026).
    expect(update.mock.calls[0]).toEqual([{ where: { userId: 'doc-1', updatedAt: T1 }, data: { html: 'new' }, select: { html: true, updatedAt: true } }]);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('refuses a save from an older copy, and writes nothing', async () => {
    const { svc, update, create } = make({ html: 'from the other device', updatedAt: T2 });
    await expect(svc.save('doc-1', { html: 'mine', baseUpdatedAt: T1.toISOString() })).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a save that thinks there is no notebook when there is one', async () => {
    const { svc } = make({ html: 'x', updatedAt: T1 });
    await expect(svc.save('doc-1', { html: 'mine', baseUpdatedAt: null })).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses when another save lands between the check and the write', async () => {
    const { svc, update } = make({ html: 'old', updatedAt: T1 });
    update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'x' }));
    await expect(svc.save('doc-1', { html: 'new', baseUpdatedAt: T1.toISOString() })).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses when two first saves race (unique key)', async () => {
    const { svc, create } = make(null);
    create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    await expect(svc.save('doc-1', { html: 'mine', baseUpdatedAt: null })).rejects.toBeInstanceOf(ConflictException);
  });
});
