import 'reflect-metadata';
import { getMetadataStorage } from 'class-validator';
import type { Prescription, PrescriptionItem } from '@prisma/client';
import { CreatePrescriptionDto, RxItemDto } from './dto/prescription.dto';
import { FLAG_FIELDS, ITEM_FIELDS, LIST_FIELDS, OTHER_FIELDS, TEXT_FIELDS, sameContent } from './repeat';

// ⚕️ A save is answered with the prescription on record only when it is that
// prescription: every field, every line. Every name here is made up.

const propsOf = (target: new () => unknown) =>
  new Set(getMetadataStorage().getTargetValidationMetadatas(target, '', true, false).map((m) => m.propertyName));

describe('repeat — what is compared', () => {
  it('every property the request can carry is compared — a field added to the DTO without a line in repeat.ts fails here', () => {
    expect(propsOf(CreatePrescriptionDto)).toEqual(
      new Set<string>([...LIST_FIELDS, ...TEXT_FIELDS, ...FLAG_FIELDS, ...OTHER_FIELDS]),
    );
    expect(propsOf(RxItemDto)).toEqual(new Set<string>(ITEM_FIELDS));
  });
});

const item = (over: Partial<PrescriptionItem> = {}): PrescriptionItem => ({
  id: 'i', prescriptionId: 'rx', drug: 'Tablet. Napa 500mg', dose: '1+1+1', duration: '7 days', instruction: '',
  order: 0, isNote: false, sf: null, isCont: null, ...over,
} as PrescriptionItem);

const stored = (over: Partial<Prescription> = {}, items = [item()]) => ({
  id: 'rx', patientId: 'pt', doctorId: 'doc',
  chiefComplaints: [], previousComplaints: [], history: [], investigation: [], drugHistory: [], onExamination: [],
  note: [], plan: [], provisionalDiagnosis: [], associatedIllness: [], finalDiagnosis: [], advice: [], adviceTest: [],
  followUpNum: null, followUpUnit: null, followUpMandatory: false,
  createdAt: new Date(), updatedAt: new Date(),
  ...over, items,
}) as Prescription & { items: PrescriptionItem[] };

const line = (over: Record<string, unknown> = {}) =>
  ({ drug: 'Tablet. Napa 500mg', dose: '1+1+1', duration: '7 days', instruction: '', order: 0, ...over }) as never;

describe('sameContent', () => {
  it('a field left out of the request is the stored default ([] / null / false)', () => {
    expect(sameContent(stored(), {}, [line()])).toBe(true);
  });

  it('a list that differs in one line, in order, or in length is another prescription', () => {
    const s = stored({ finalDiagnosis: ['A', 'B'] });
    expect(sameContent(s, { finalDiagnosis: ['A', 'B'] }, [line()])).toBe(true);
    expect(sameContent(s, { finalDiagnosis: ['B', 'A'] }, [line()])).toBe(false);
    expect(sameContent(s, { finalDiagnosis: ['A'] }, [line()])).toBe(false);
    expect(sameContent(s, { finalDiagnosis: ['A', 'b'] }, [line()])).toBe(false);
  });

  it('the follow-up counts', () => {
    expect(sameContent(stored({ followUpNum: '7' }), {}, [line()])).toBe(false);
    expect(sameContent(stored({ followUpNum: '7', followUpUnit: 'day' }), { followUpNum: '7', followUpUnit: 'day' }, [line()])).toBe(true);
    expect(sameContent(stored({ followUpMandatory: true }), {}, [line()])).toBe(false);
  });

  it('every property of a line counts: text, order, note, start date, >>>', () => {
    const s = stored();
    expect(sameContent(s, {}, [line({ dose: '1+0+1' })])).toBe(false);
    expect(sameContent(s, {}, [line({ instruction: 'After meal' })])).toBe(false);
    expect(sameContent(s, {}, [line({ order: 1 })])).toBe(false);
    expect(sameContent(s, {}, [line({ isNote: true })])).toBe(false);
    expect(sameContent(s, {}, [line({ sf: '17/06/2026' })])).toBe(false);
    expect(sameContent(s, {}, [line(), line({ order: 1 })])).toBe(false);
    expect(sameContent(s, {}, [])).toBe(false);
  });

  it('>>> is nullable on purpose: absent is null, and false is another answer', () => {
    expect(sameContent(stored(), {}, [line({ isCont: undefined })])).toBe(true);
    expect(sameContent(stored(), {}, [line({ isCont: false })])).toBe(false);
    expect(sameContent(stored({}, [item({ isCont: false })]), {}, [line({ isCont: false })])).toBe(true);
    expect(sameContent(stored({}, [item({ isCont: true })]), {}, [line({ isCont: false })])).toBe(false);
  });

  it('spacing and capitals are part of what was written', () => {
    expect(sameContent(stored(), {}, [line({ drug: 'Tablet. Napa 500mg ' })])).toBe(false);
    expect(sameContent(stored(), {}, [line({ drug: 'tablet. Napa 500mg' })])).toBe(false);
  });
});
