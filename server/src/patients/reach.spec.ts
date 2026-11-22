import { patientReachWhere } from './reach';

// ⚕️ `patientReachWhere` is the ONE statement of whose patient a practice can
// reach. It is a `where` — the database decides — so its SHAPE is what is pinned
// here; test/patient-access.int-spec.ts runs it against real rows.

describe('patientReachWhere — the shape of who can reach a patient', () => {
  const where = patientReachWhere('doc-1') as { OR: Record<string, unknown>[] };

  it('is an OR of exactly three ways in: own, supervising, opened with the patient\'s code', () => {
    expect(where.OR).toHaveLength(3);
  });

  it('1. the patient is the practice\'s own', () => {
    expect(where.OR[0]).toEqual({ doctorId: 'doc-1' });
  });

  it('2. the practice is assigned as a supervising doctor', () => {
    expect(where.OR[1]).toEqual({ supervisors: { some: { doctorId: 'doc-1' } } });
  });

  it('3. a grant counts only while the practice holding it is not isolated', () => {
    const and = (where.OR[2] as { AND: unknown[] }).AND;
    expect(and[0]).toEqual({ accessGrants: { some: { doctorId: 'doc-1', doctor: { isolated: false } } } });
  });

  it('3. …and only while the patient\'s owner is not isolated — an owner who is gone has none to isolate', () => {
    const and = (where.OR[2] as { AND: unknown[] }).AND;
    expect(and[1]).toEqual({ OR: [{ doctorId: null }, { doctor: { isolated: false } }] });
  });

  it('names the practice it was asked for, and no other (no id leaks between two calls)', () => {
    const a = JSON.stringify(patientReachWhere('doc-1'));
    const b = JSON.stringify(patientReachWhere('doc-2'));
    expect(a).not.toContain('doc-2');
    expect(b).not.toContain('doc-1');
    expect(a.split('doc-1')).toHaveLength(4); // own, supervising, grant — each names the practice once
  });

  it('the isolation of the OWNER never closes the owner\'s own door, nor a supervising doctor\'s', () => {
    // isolation sits inside the third way only: ways 1 and 2 carry no `isolated`
    expect(JSON.stringify(where.OR[0])).not.toContain('isolated');
    expect(JSON.stringify(where.OR[1])).not.toContain('isolated');
  });
});
