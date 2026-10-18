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
    await svc.save('doc-1', { html: 'first', baseUpdatedAt: null, expectedUserId: 'doc-1' });
    expect(create.mock.calls[0][0].data).toEqual({ userId: 'doc-1', html: 'first' });
  });

  it('saves over the copy it was written from, and answers with the row it wrote', async () => {
    const { svc, update, findUnique } = make({ html: 'old', updatedAt: T1 });
    await expect(svc.save('doc-1', { html: 'new', baseUpdatedAt: T1.toISOString(), expectedUserId: 'doc-1' })).resolves.toEqual({ html: 'new', updatedAt: T2 });
    // ONE statement: the write is conditional on the stored copy being that one,
    // and what it returns is what it wrote — no second read another save could
    // land before (review, 18/10/2026).
    expect(update.mock.calls[0]).toEqual([{ where: { userId: 'doc-1', updatedAt: T1 }, data: { html: 'new' }, select: { html: true, updatedAt: true } }]);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('refuses a save from an older copy, and writes nothing', async () => {
    const { svc, update, create } = make({ html: 'from the other device', updatedAt: T2 });
    await expect(svc.save('doc-1', { html: 'mine', baseUpdatedAt: T1.toISOString(), expectedUserId: 'doc-1' })).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a save that thinks there is no notebook when there is one', async () => {
    const { svc } = make({ html: 'x', updatedAt: T1 });
    await expect(svc.save('doc-1', { html: 'mine', baseUpdatedAt: null, expectedUserId: 'doc-1' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses when another save lands between the check and the write', async () => {
    const { svc, update } = make({ html: 'old', updatedAt: T1 });
    update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'x' }));
    await expect(svc.save('doc-1', { html: 'new', baseUpdatedAt: T1.toISOString(), expectedUserId: 'doc-1' })).rejects.toBeInstanceOf(ConflictException);
  });

  // ⚕️ Two tabs share one login cookie. Tab A still shows doctor 1; doctor 2
  // signs in on tab B — and tab A's autosave goes out under doctor 2's
  // session. With no notebook of doctor 2's yet, the stale-copy check had
  // nothing to refuse, and doctor 1's private text became doctor 2's notebook
  // (release review, 18/10/2026). The client names whose text it is; the
  // server writes it only into that user's own notebook.
  it("refuses a save written for another user, and reads and writes nothing — the leak: no notebook of the signed-in user's yet", async () => {
    const { svc, create, update, findUnique } = make(null);
    const refusal = await svc.save('doc-2', { html: "doc-1's private notes", baseUpdatedAt: null, expectedUserId: 'doc-1' }).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('refuses it also where the copy it names happens to be the stored one', async () => {
    const { svc, update } = make({ html: "doc-2's", updatedAt: T1 });
    await expect(svc.save('doc-2', { html: "doc-1's", baseUpdatedAt: T1.toISOString(), expectedUserId: 'doc-1' })).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('says so in words for a doctor, with a code the client tells from a stale copy', async () => {
    const { svc } = make(null);
    const refusal = (await svc.save('doc-2', { html: 'x', baseUpdatedAt: null, expectedUserId: 'doc-1' }).catch((e: unknown) => e)) as ConflictException;
    const body = refusal.getResponse() as { code?: string; message?: string };
    expect(body.code).toBe('SIGNED_IN_USER_CHANGED');
    expect(body.message).toMatch(/signed in/i);
    expect(body.message).toMatch(/not saved/i);
    expect(body.message).toMatch(/still on this screen/i);
  });

  it('refuses when two first saves race (unique key)', async () => {
    const { svc, create } = make(null);
    create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    await expect(svc.save('doc-1', { html: 'mine', baseUpdatedAt: null, expectedUserId: 'doc-1' })).rejects.toBeInstanceOf(ConflictException);
  });
});
