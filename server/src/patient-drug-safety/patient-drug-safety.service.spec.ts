import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { PatientDrugSafetyService } from './patient-drug-safety.service';
import { AddDrugSafetyDto, UpdateDrugSafetyDto } from './dto/drug-safety.dto';
import { brandShown, entryLines } from './lines';
import type { PrismaService } from '../prisma/prisma.service';
import type { PatientsService } from '../patients/patients.service';

// ⚕️ "H/O drug hypersensitivity and High-Alert Medication" (physician's sheet,
// 31/10/2026). Pinned here: reach is the patient's, nothing is ever deleted, an
// entry with nothing ticked is refused, and another practice's entry is not
// changed by a supervising practice. The HTTP side is in
// test/patient-drug-safety.int-spec.ts.

type Row = Record<string, unknown> & {
  id: string;
  patientId: string;
  removedAt: Date | null;
};

const OWNER = 'owner-doc';
const SUPER = 'super-doc';
const actor = { userId: 'u1', name: 'Dr. One' };

function make(
  opts: { reachable?: boolean; owner?: string; rows?: Row[] } = {},
) {
  const rows: Row[] = opts.rows ?? [];
  let n = 0;
  const patientDrugSafety = {
    findMany: jest.fn(
      async (a: { where: { patientId: string; removedAt: null } }) =>
        rows.filter(
          (r) => r.patientId === a.where.patientId && r.removedAt === null,
        ),
    ),
    findFirst: jest.fn(
      async (a: { where: { id: string; patientId: string } }) =>
        rows.find(
          (r) => r.id === a.where.id && r.patientId === a.where.patientId,
        ) ?? null,
    ),
    create: jest.fn(async (a: { data: Record<string, unknown> }) => {
      const r = {
        id: `e${++n}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        removedAt: null,
        removedById: null,
        ...a.data,
      } as unknown as Row;
      rows.push(r);
      return r;
    }),
    update: jest.fn(
      async (a: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = rows.find((x) => x.id === a.where.id)!;
        Object.assign(r, a.data);
        return r;
      },
    ),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  const activityLog = { create: jest.fn(async () => ({})) };
  const tx = { $queryRaw: jest.fn(async () => []), patientDrugSafety };
  const prisma = {
    patientDrugSafety,
    activityLog,
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const get = jest.fn(async () => {
    if (opts.reachable === false)
      throw new NotFoundException('Patient not found');
    return { id: 'p1', name: 'Rahim', doctorId: opts.owner ?? OWNER };
  });
  const patients = { get } as unknown as PatientsService;
  return {
    svc: new PatientDrugSafetyService(prisma, patients),
    rows,
    patientDrugSafety,
    activityLog,
    get,
  };
}

const drug = (over: Partial<AddDrugSafetyDto> = {}): AddDrugSafetyDto =>
  ({
    kind: 'drug',
    brand: 'Napa',
    generic: 'Paracetamol',
    hypersensitive: true,
    highAlert: false,
    ...over,
  }) as AddDrugSafetyDto;

describe('PatientDrugSafetyService', () => {
  it('reads through the patient’s reach — 404 before any entry is touched', async () => {
    const { svc, patientDrugSafety, get } = make({ reachable: false });
    await expect(svc.list(OWNER, 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.add(OWNER, actor, 'p1', drug())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(get).toHaveBeenCalledWith(OWNER, 'p1');
    expect(patientDrugSafety.findMany).not.toHaveBeenCalled();
    expect(patientDrugSafety.create).not.toHaveBeenCalled();
  });

  it('lists only entries that were not removed', async () => {
    const { svc, rows } = make();
    await svc.add(OWNER, actor, 'p1', drug());
    await svc.add(OWNER, actor, 'p1', {
      kind: 'text',
      text: 'Patient is hypersensitive to sulphar containing drug',
    } as AddDrugSafetyDto);
    await svc.remove(OWNER, actor, 'p1', rows[0].id);
    const list = await svc.list(OWNER, 'p1');
    expect(list.map((e) => e.text || e.brand)).toEqual([
      'Patient is hypersensitive to sulphar containing drug',
    ]);
  });

  it('stores a drug with the generic it was given, and a text line exactly as typed (trimmed)', async () => {
    const { svc, rows } = make();
    const d = await svc.add(OWNER, actor, 'p1', drug({ highAlert: true }));
    expect(d).toMatchObject({
      kind: 'drug',
      brand: 'Napa',
      generic: 'Paracetamol',
      hypersensitive: true,
      highAlert: true,
      editable: true,
    });
    await svc.add(OWNER, actor, 'p1', {
      kind: 'text',
      text: '  Patient is hypersensitive to sulphar containing drug ',
    } as AddDrugSafetyDto);
    expect(rows[1].text).toBe(
      'Patient is hypersensitive to sulphar containing drug',
    );
    expect(rows[0]).toMatchObject({
      practiceDoctorId: OWNER,
      createdById: 'u1',
      createdByName: 'Dr. One',
    });
  });

  it('never invents a generic: none given is stored as none', async () => {
    const { svc, rows } = make();
    await svc.add(
      OWNER,
      actor,
      'p1',
      drug({ generic: undefined, brand: 'Unknownol' }),
    );
    expect(rows[0].generic).toBeNull();
  });

  it('refuses a medicine with nothing ticked, an empty name and an empty line', async () => {
    const { svc, patientDrugSafety } = make();
    await expect(
      svc.add(
        OWNER,
        actor,
        'p1',
        drug({ hypersensitive: false, highAlert: false }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.add(OWNER, actor, 'p1', drug({ brand: '  ' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.add(OWNER, actor, 'p1', {
        kind: 'text',
        text: ' ',
      } as AddDrugSafetyDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(patientDrugSafety.create).not.toHaveBeenCalled();
  });

  it('refuses the same medicine (or the same line) twice, capitals and spaces set aside', async () => {
    const { svc } = make();
    await svc.add(OWNER, actor, 'p1', drug());
    await expect(
      svc.add(OWNER, actor, 'p1', drug({ brand: ' napa ', highAlert: true })),
    ).rejects.toBeInstanceOf(ConflictException);
    await svc.add(OWNER, actor, 'p1', {
      kind: 'text',
      text: 'Sulpha allergy',
    } as AddDrugSafetyDto);
    await expect(
      svc.add(OWNER, actor, 'p1', {
        kind: 'text',
        text: 'sulpha  ALLERGY',
      } as AddDrugSafetyDto),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('removal is SOFT — the row stays, with who removed it — and restore puts it back', async () => {
    const { svc, rows, patientDrugSafety } = make();
    const e = await svc.add(OWNER, actor, 'p1', drug());
    await svc.remove(OWNER, actor, 'p1', e.id);
    expect(patientDrugSafety.delete).not.toHaveBeenCalled();
    expect(patientDrugSafety.deleteMany).not.toHaveBeenCalled();
    expect(rows[0].removedAt).toBeInstanceOf(Date);
    expect(rows[0].removedById).toBe('u1');
    const back = await svc.restore(OWNER, actor, 'p1', e.id);
    expect(back.id).toBe(e.id);
    expect(rows[0].removedAt).toBeNull();
  });

  it('does not restore an entry the list holds again already', async () => {
    const { svc } = make();
    const e = await svc.add(OWNER, actor, 'p1', drug());
    await svc.remove(OWNER, actor, 'p1', e.id);
    await svc.add(OWNER, actor, 'p1', drug());
    await expect(svc.restore(OWNER, actor, 'p1', e.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('edits a drug entry by its ticks, never to none ticked; a text entry by its words, never to blank', async () => {
    const { svc } = make();
    const d = await svc.add(OWNER, actor, 'p1', drug());
    expect(
      (
        await svc.update(OWNER, actor, 'p1', d.id, {
          highAlert: true,
        } as UpdateDrugSafetyDto)
      ).highAlert,
    ).toBe(true);
    await expect(
      svc.update(OWNER, actor, 'p1', d.id, {
        hypersensitive: false,
        highAlert: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.update(OWNER, actor, 'p1', d.id, { text: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const t = await svc.add(OWNER, actor, 'p1', {
      kind: 'text',
      text: 'Sulpha allergy',
    } as AddDrugSafetyDto);
    expect(
      (
        await svc.update(OWNER, actor, 'p1', t.id, {
          text: ' Sulphonamide allergy ',
        })
      ).text,
    ).toBe('Sulphonamide allergy');
    await expect(
      svc.update(OWNER, actor, 'p1', t.id, { text: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("a supervising practice adds, and changes only what IT added — never the owner's entries", async () => {
    const { svc } = make({ owner: OWNER });
    const ownerEntry = await svc.add(OWNER, actor, 'p1', drug());
    const superEntry = await svc.add(
      SUPER,
      actor,
      'p1',
      drug({
        brand: 'Insulin',
        generic: 'Insulin',
        hypersensitive: false,
        highAlert: true,
      }),
    );
    const seen = await svc.list(SUPER, 'p1');
    expect(seen.find((e) => e.id === ownerEntry.id)?.editable).toBe(false);
    expect(seen.find((e) => e.id === superEntry.id)?.editable).toBe(true);
    await expect(
      svc.remove(SUPER, actor, 'p1', ownerEntry.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.update(SUPER, actor, 'p1', ownerEntry.id, { highAlert: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // The owner's practice may change any entry.
    await svc.remove(OWNER, actor, 'p1', superEntry.id);
  });

  it('an entry id from another patient is not found', async () => {
    const { svc } = make();
    const e = await svc.add(OWNER, actor, 'p1', drug());
    await expect(svc.remove(OWNER, actor, 'p2', e.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('logs to the ACTING practice’s feed, the detail capped at 400, and a failed log never fails the write', async () => {
    const { svc, activityLog } = make();
    (activityLog.create as jest.Mock).mockRejectedValueOnce(
      new Error('feed down'),
    );
    await expect(svc.add(OWNER, actor, 'p1', drug())).resolves.toBeTruthy();
    await svc.add(SUPER, actor, 'p1', {
      kind: 'text',
      text: 'x'.repeat(500),
    } as AddDrugSafetyDto);
    const arg = (activityLog.create as jest.Mock).mock.calls[1][0] as {
      data: { doctorId: string; detail: string; patientId: string };
    };
    expect(arg.data.doctorId).toBe(SUPER);
    expect(arg.data.detail.length).toBeLessThanOrEqual(400);
    expect(arg.data.patientId).toBe('p1');
  });
});

describe('drug-safety words (the physician’s examples)', () => {
  const base = {
    kind: 'drug',
    brand: 'Napa',
    generic: 'Paracetamol',
    hypersensitive: false,
    highAlert: false,
    text: '',
  };
  it('writes "Hypersensitive to NAPA(Paracetamol)" and "High-alert drug: NAPA(Paracetamol)"', () => {
    expect(entryLines({ ...base, hypersensitive: true })).toEqual([
      'Hypersensitive to NAPA(Paracetamol)',
    ]);
    expect(entryLines({ ...base, highAlert: true })).toEqual([
      'High-alert drug: NAPA(Paracetamol)',
    ]);
    expect(
      entryLines({ ...base, hypersensitive: true, highAlert: true }),
    ).toHaveLength(2);
  });
  it('shows the brand alone when no generic is known, and keeps a typed strength as typed', () => {
    expect(
      entryLines({ ...base, generic: null, hypersensitive: true }),
    ).toEqual(['Hypersensitive to NAPA']);
    expect(brandShown('Napa 500 mg')).toBe('NAPA 500 mg');
  });
  it('a text entry is its words', () => {
    expect(
      entryLines({
        ...base,
        kind: 'text',
        text: 'Patient is hypersensitive to sulphar containing drug',
      }),
    ).toEqual(['Patient is hypersensitive to sulphar containing drug']);
  });
});

describe('DTO whitelist', () => {
  const pipe = new ValidationPipe({ whitelist: true });
  const run = (dto: unknown, metatype: unknown) =>
    pipe.transform(dto, { type: 'body', metatype: metatype as never });
  it('drops an undeclared field (a client-sent doctor or creator is never taken)', async () => {
    const out = (await run(
      {
        kind: 'drug',
        brand: 'Napa',
        hypersensitive: true,
        doctorId: 'x',
        createdById: 'y',
      },
      AddDrugSafetyDto,
    )) as Record<string, unknown>;
    expect(out.doctorId).toBeUndefined();
    expect(out.createdById).toBeUndefined();
  });
  it('refuses an unknown kind and an over-long line', async () => {
    await expect(run({ kind: 'other' }, AddDrugSafetyDto)).rejects.toBeTruthy();
    await expect(
      run({ kind: 'text', text: 'x'.repeat(501) }, AddDrugSafetyDto),
    ).rejects.toBeTruthy();
    await expect(
      run({ hypersensitive: 'yes' }, UpdateDrugSafetyDto),
    ).rejects.toBeTruthy();
  });
});
