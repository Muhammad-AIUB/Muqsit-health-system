import { ActivityService } from './activity.service';
import type { PrismaService } from '../prisma/prisma.service';

// ⚕️ REGRESSION SPEC FOR A CROSS-PRACTICE LEAK (CSO audit finding 1, 2026-08-27).
//
// `ActivityController` hands this service the id `WorkstationGuard` already
// resolved (`@WorkstationDoctorId()`). The service used to resolve it a SECOND
// time, looking up `Assistant where assistantId = <that value>`. For a doctor
// who also assists another doctor — the dual role the workstation switcher
// exists for — the second lookup returned the OTHER doctor, so the feed showed
// that practice's patient names and clinical detail, and the doctor's own
// entries were filed under the wrong practice.
//
// These tests pin the boundary two ways, because either alone can be defeated:
// the query must carry EXACTLY the id it was given, and `prisma.assistant` must
// never be consulted at all. A future "helpful" re-derivation fails here rather
// than in a doctor's browser.

const OWN = 'doctor-who-also-assists';
const OTHER = 'the-practice-they-assist';

// `assistant` is present and would answer with OTHER if anything asked it —
// exactly the production shape that made the original bug fire.
const prismaWith = () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const create = jest.fn().mockResolvedValue({});
  const assistantFindFirst = jest.fn().mockResolvedValue({ doctorId: OTHER });
  return {
    prisma: {
      activityLog: { findMany, create },
      assistant: { findFirst: assistantFindFirst, findMany: assistantFindFirst },
    } as unknown as PrismaService,
    findMany,
    create,
    assistantFindFirst,
  };
};

describe('ActivityService — the practice is already resolved', () => {
  it('list() scopes to the id it was given, never a re-derived one', async () => {
    const { prisma, findMany, assistantFindFirst } = prismaWith();
    await new ActivityService(prisma).list(OWN);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where.doctorId).toBe(OWN);
    expect(assistantFindFirst).not.toHaveBeenCalled();
  });

  it('create() files the entry under the id it was given, never a re-derived one', async () => {
    const { prisma, create, assistantFindFirst } = prismaWith();
    await new ActivityService(prisma).create(OWN, 'Dr Someone', {
      section: 'Prescription',
      detail: 'Saved a prescription',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.doctorId).toBe(OWN);
    expect(assistantFindFirst).not.toHaveBeenCalled();
  });

  it('never consults the Assistant table — resolving the practice is WorkstationGuard’s job', async () => {
    const { prisma, assistantFindFirst } = prismaWith();
    const svc = new ActivityService(prisma);
    await svc.list(OWN, 10, 'patient-1');
    await svc.create(OWN, 'Dr Someone', { section: 'IPD', detail: 'Added a note' });

    expect(assistantFindFirst).not.toHaveBeenCalled();
  });

  it('still scopes to a patient when one is given, without widening the doctor scope', async () => {
    const { prisma, findMany } = prismaWith();
    await new ActivityService(prisma).list(OWN, 25, 'patient-1');

    const { where, take } = findMany.mock.calls[0][0];
    expect(where).toEqual({ doctorId: OWN, patientId: 'patient-1' });
    expect(take).toBe(25);
  });

  it('clamps the row cap to 1..200 so a caller cannot pull the whole feed', async () => {
    const { prisma, findMany } = prismaWith();
    const svc = new ActivityService(prisma);
    await svc.list(OWN, 100000);
    await svc.list(OWN, 0);

    expect(findMany.mock.calls[0][0].take).toBe(200);
    expect(findMany.mock.calls[1][0].take).toBe(1);
  });
});
