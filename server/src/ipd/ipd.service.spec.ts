import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IpdService } from './ipd.service';
import type { PrismaService } from '../prisma/prisma.service';

// ⚕️ REGRESSION SPEC — the IPD clinical sheet is replaced WHOLESALE.
//
// `update()` writes `dto.clinical` verbatim over the stored column. Every field
// on the admission detail rides that one write, so a client that omits a key
// does not "leave it alone" — it deletes it from the patient's record, with no
// error and nothing in the feed to notice afterwards.
//
// The photographed pages of the paper order sheet are written by their own
// routes and are never part of that payload, which makes them exactly the kind
// of key an older or reverted client erases by accident. The first block pins
// the server-side half of that guard; the second pins the routes themselves.

type Ctx = {
  service: IpdService;
  update: jest.Mock;
  findFirst: jest.Mock;
  event: jest.Mock;
};

function makeService(storedClinical: unknown): Ctx {
  const admission = {
    id: 'adm_1',
    doctorId: 'doc_1',
    bed: '1',
    clinical: storedClinical,
  };
  const findFirst = jest.fn().mockResolvedValue(admission);
  const update = jest
    .fn()
    .mockImplementation(({ data }) => Promise.resolve({ ...admission, ...data }));
  const event = jest.fn().mockResolvedValue({ id: 'ev_1' });
  const tx = { ipdAdmission: { findFirst, update }, ipdEvent: { create: event } };

  const prisma = {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    ipdAdmission: { findFirst, update },
    ipdEvent: { create: event },
    ward: { findFirst: jest.fn() },
  } as unknown as PrismaService;

  return { service: new IpdService(prisma), update, findFirst, event };
}

const SHEETS = [
  { id: 's1', url: '/uploads/a.jpg', addedAt: '2026-08-26T04:00:00.000Z' },
  {
    id: 's2',
    url: '/uploads/b.jpg',
    thumbUrl: '/uploads/b-t.jpg',
    addedAt: '2026-08-26T04:01:00.000Z',
  },
];

const OWNER = { doctorId: 'doc_1', name: 'me', role: 'owner' as const, permissions: [] };
const ASSISTANT = { doctorId: 'doc_1', name: 'ws', role: 'assistant' as const, permissions: [] };
const ACTOR = { id: 'usr_1', name: 'Dr Test' };
const writtenClinical = (update: jest.Mock, call = 0) => update.mock.calls[call][0].data.clinical;
const writtenSheets = (update: jest.Mock, call = 0) => writtenClinical(update, call).analogueSheets;

describe('IpdService.update — a whole-clinical save must not delete the order-sheet pages', () => {
  it('carries analogueSheets forward when the payload never mentions them', async () => {
    const { service, update } = makeService({ diagnosis: ['old'], analogueSheets: SHEETS });

    await service.update('doc_1', 'adm_1', {
      clinical: { diagnosis: ['febrile convulsion'], plan: ['Bed rest'] },
    } as never);

    const written = writtenClinical(update);
    expect(written.analogueSheets).toEqual(SHEETS);
    // The rest of the payload still wins — this is a preserve, not a merge-back.
    expect(written.diagnosis).toEqual(['febrile convulsion']);
    expect(written.plan).toEqual(['Bed rest']);
  });

  it('lets an explicit empty list win — "none" is a client decision, absence is not', async () => {
    const { service, update } = makeService({ analogueSheets: SHEETS });

    await service.update('doc_1', 'adm_1', {
      clinical: { diagnosis: [], analogueSheets: [] },
    } as never);

    expect(writtenSheets(update)).toEqual([]);
  });

  it('leaves the payload alone when there is nothing stored to preserve', async () => {
    const { service, update } = makeService({ diagnosis: ['old'] });

    await service.update('doc_1', 'adm_1', { clinical: { diagnosis: ['new'] } } as never);

    const written = writtenClinical(update);
    expect(written).toEqual({ diagnosis: ['new'] });
    expect('analogueSheets' in written).toBe(false);
  });

  // The column is Json: it can come back as null, or as a shape nobody expects.
  // None of that may throw on a doctor's save.
  it.each([null, 'a string', [1, 2, 3], 42])('survives a stored clinical of %p', async (stored) => {
    const { service, update } = makeService(stored);
    await service.update('doc_1', 'adm_1', { clinical: { diagnosis: ['new'] } } as never);
    expect(writtenClinical(update)).toEqual({ diagnosis: ['new'] });
  });

  it('does not touch clinical at all when the payload has no clinical key', async () => {
    const { service, update } = makeService({ analogueSheets: SHEETS });

    await service.update('doc_1', 'adm_1', { sex: 'Male' } as never);

    expect('clinical' in update.mock.calls[0][0].data).toBe(false);
  });

  it("still refuses another doctor's admission", async () => {
    const { service, findFirst } = makeService({});
    findFirst.mockResolvedValueOnce(null);
    await expect(
      service.update('doc_2', 'adm_1', { clinical: {} } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ⚕️ The paper order-sheet pages. Every rule below exists because the page is a
// medico-legal document: it must not be lost by someone else's write, it must
// not vanish without a trace, and it must be recoverable when removed by
// mistake.
describe('IpdService — analogue order-sheet pages', () => {
  const ONE_PAGE = { sheets: [{ url: '/uploads/a.jpg' }] } as never;

  it('APPENDS to whatever is stored, so a concurrent upload is never overwritten', async () => {
    const { service, update } = makeService({ analogueSheets: SHEETS, diagnosis: ['keep me'] });

    await service.addAnalogueSheets('doc_1', 'adm_1', OWNER, ACTOR, {
      sheets: [{ url: '/uploads/c.jpg' }, { url: '/uploads/d.jpg', thumbUrl: '/uploads/d-t.jpg' }],
    } as never);

    const out = writtenSheets(update);
    expect(out).toHaveLength(4);
    expect(out.slice(0, 2)).toEqual(SHEETS);
    expect(out[3].thumbUrl).toBe('/uploads/d-t.jpg');
    // Nothing else in the sheet is touched by an upload.
    expect(writtenClinical(update).diagnosis).toEqual(['keep me']);
  });

  it('assigns the id and the timestamp itself — a ward PC clock is not a clinical record', async () => {
    const { service, update } = makeService({});
    const before = Date.now();

    await service.addAnalogueSheets('doc_1', 'adm_1', OWNER, ACTOR, ONE_PAGE);

    const [page] = writtenSheets(update);
    expect(typeof page.id).toBe('string');
    expect(page.id.length).toBeGreaterThan(10);
    expect(new Date(page.addedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(page.addedBy).toBe('usr_1');
  });

  it('removes SOFTLY — the entry keeps its place and its data', async () => {
    const { service, update } = makeService({ analogueSheets: SHEETS });

    await service.removeAnalogueSheet('doc_1', 'adm_1', 's1', OWNER, ACTOR);

    const out = writtenSheets(update);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('s1');
    expect(out[0].url).toBe(SHEETS[0].url);
    expect(out[0].removedAt).toBeTruthy();
    expect(out[0].removedBy).toBe('usr_1');
    expect(out[1]).toEqual(SHEETS[1]);
  });

  it('restores a page in place, giving back exactly what was there', async () => {
    const removed = [{ ...SHEETS[0], removedAt: 't', removedBy: 'usr_1' }, SHEETS[1]];
    const { service, update } = makeService({ analogueSheets: removed });

    await service.restoreAnalogueSheet('doc_1', 'adm_1', 's1', OWNER, ACTOR);

    const out = writtenSheets(update);
    expect(out[0]).toEqual(SHEETS[0]);
    expect(out.map((s: { id: string }) => s.id)).toEqual(['s1', 's2']);
  });

  it('sets and trims a label without touching its neighbour', async () => {
    const { service, update } = makeService({ analogueSheets: SHEETS });

    await service.updateAnalogueSheet('doc_1', 'adm_1', 's1', OWNER, ACTOR, {
      label: '  Day 3 night  ',
    } as never);

    expect(writtenSheets(update)[0].label).toBe('Day 3 night');
    expect(writtenSheets(update)[1]).toEqual(SHEETS[1]);
  });

  it('clears a label when given an empty one', async () => {
    const { service, update } = makeService({ analogueSheets: [{ ...SHEETS[0], label: 'x' }] });

    await service.updateAnalogueSheet('doc_1', 'adm_1', 's1', OWNER, ACTOR, { label: '' } as never);

    expect('label' in writtenSheets(update)[0]).toBe(false);
  });

  it('writes exactly one audit line per operation, naming the actor', async () => {
    const { service, event } = makeService({ analogueSheets: SHEETS });

    await service.addAnalogueSheets(
      'doc_1',
      'adm_1',
      ASSISTANT,
      { ...ACTOR, role: 'Assistant' },
      ONE_PAGE,
    );

    expect(event).toHaveBeenCalledTimes(1);
    const { data } = event.mock.calls[0][0];
    expect(data.admissionId).toBe('adm_1');
    expect(data.author).toBe('Dr Test');
    expect(data.role).toBe('Assistant');
    expect(data.note).toContain('1 order-sheet page');
  });

  it('refuses an unknown page rather than writing a no-op', async () => {
    const { service, update } = makeService({ analogueSheets: SHEETS });
    await expect(
      service.removeAnalogueSheet('doc_1', 'adm_1', 'nope', OWNER, ACTOR),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses another doctor's admission", async () => {
    const { service, findFirst } = makeService({});
    findFirst.mockResolvedValueOnce(null);
    await expect(
      service.addAnalogueSheets('doc_2', 'adm_1', OWNER, ACTOR, ONE_PAGE),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // The doctor and their assistants act here exactly as they do on every other
  // field of this screen. Any OTHER actor — the ward-team login, when it is
  // built — needs the key. See assertMayEditAnalogue for why it is deliberately
  // not required of assistants.
  it('lets the doctor and assistants in, and holds any other actor to ipd.analogue', async () => {
    const team = { doctorId: 'doc_1', name: 'ward', role: 'team' as never, permissions: [] };
    const teamWithKey = { ...team, permissions: ['ipd.analogue'] };

    for (const ws of [OWNER, ASSISTANT, teamWithKey]) {
      const { service } = makeService({});
      await expect(
        service.addAnalogueSheets('doc_1', 'adm_1', ws, ACTOR, ONE_PAGE),
      ).resolves.toBeTruthy();
    }

    const { service, update } = makeService({});
    await expect(
      service.addAnalogueSheets('doc_1', 'adm_1', team, ACTOR, ONE_PAGE),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  // Json column: the stored value can be anything at all.
  it.each([
    null,
    'a string',
    { analogueSheets: 'not a list' },
    { analogueSheets: [null, 7, { noId: 1 }] },
  ])('starts from an empty list when the stored value is %p', async (stored) => {
    const { service, update } = makeService(stored);
    await service.addAnalogueSheets('doc_1', 'adm_1', OWNER, ACTOR, ONE_PAGE);
    expect(writtenSheets(update)).toHaveLength(1);
  });
});
