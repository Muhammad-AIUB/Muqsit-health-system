import { blocksFrom, sanitiseContLines, RxItemLike } from './rx-habits.service';

// ⚕️ Block assembly decides WHAT gets learned from a prescription. A mistake
// here does not throw — it quietly teaches the wrong instruction, or attaches a
// tapering line to the wrong medicine. Every case below is either a rule from
// the design or a shape found in the production data on 2026-08-16.

const item = (over: Partial<RxItemLike> & { drug: string }): RxItemLike => ({
  dose: '',
  duration: '',
  instruction: '',
  isNote: false,
  ...over,
});

describe('blocksFrom — head / continuation / note walk', () => {
  it('reads a plain medicine line as one block', () => {
    const [b] = blocksFrom([
      item({ drug: 'Tablet. Napa 500mg', dose: '1+1+1', instruction: 'food', duration: '7 days', order: 0 }),
    ]);
    expect(b.drugLabel).toBe('Tablet. Napa 500mg');
    expect(b.drugKey).toBe('tablet. napa 500mg');
    expect(b.searchKey).toBe('napa 500mg');
    expect(b).toMatchObject({ dose: '1+1+1', food: 'food', duration: '7 days' });
    expect(b.contLines).toEqual([]);
  });

  it('attaches a blank-drug line as a continuation of the block above', () => {
    const blocks = blocksFrom([
      item({ drug: 'Tablet. Uparen 15mg', dose: '0+0+3', instruction: 'after meal', duration: '1 month', order: 0 }),
      item({ drug: '', dose: '0+0+1', instruction: 'after meal', duration: 'continue', order: 1 }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].contLines).toEqual([
      { dose: '0+0+1', food: 'after meal', duration: 'continue' },
    ]);
  });

  it('keeps continuation ORDER — a 3→1 taper is not a 1→3 taper', () => {
    const down = blocksFrom([
      item({ drug: 'Tablet. X 5mg', dose: '3', order: 0 }),
      item({ drug: '', dose: '1', order: 1 }),
    ]);
    const up = blocksFrom([
      item({ drug: 'Tablet. X 5mg', dose: '1', order: 0 }),
      item({ drug: '', dose: '3', order: 1 }),
    ]);
    expect(down[0].signature).not.toBe(up[0].signature);
  });

  it('walks items by `order`, not by array position', () => {
    const blocks = blocksFrom([
      item({ drug: '', dose: 'cont', order: 1 }),
      item({ drug: 'Tablet. X 5mg', dose: 'head', order: 0 }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].dose).toBe('head');
    expect(blocks[0].contLines).toEqual([{ dose: 'cont', food: '', duration: '' }]);
  });

  it('lets a note TERMINATE the block above it', () => {
    const blocks = blocksFrom([
      item({ drug: 'Tablet. Napa 500mg', dose: '1+1+1', order: 0 }),
      item({ drug: 'Take plenty of water', isNote: true, order: 1 }),
      item({ drug: '', dose: '0+0+1', order: 2 }), // orphaned by the note
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].contLines).toEqual([]);
  });

  it('never learns from a note line itself', () => {
    expect(blocksFrom([item({ drug: 'Avoid alcohol', isNote: true, order: 0 })])).toEqual([]);
  });

  it('discards a continuation that arrives before any head — never guesses', () => {
    const blocks = blocksFrom([
      item({ drug: '', dose: '0+0+1', duration: 'continue', order: 0 }),
      item({ drug: 'Tablet. Napa 500mg', dose: '1+1+1', order: 1 }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].drugLabel).toBe('Tablet. Napa 500mg');
    expect(blocks[0].contLines).toEqual([]);
  });
});

describe('blocksFrom — isCont, and why the blank-drug test is not enough', () => {
  // `savePrescription` fills the medicine's name back into every continuation
  // so the printed sheet is self-contained. Of 187 production PrescriptionItem
  // rows, ZERO have a blank drug — so without `isCont` a tapering schedule is
  // learned as two unrelated medicines and 5.docx's D4 never fires.
  it('reads a taper stored WITH the drug name repeated as ONE block', () => {
    const blocks = blocksFrom([
      item({ drug: 'Capsule. Levat 4 mg', dose: '0+0+1', duration: '7 days', order: 0, isCont: false }),
      item({ drug: 'Capsule. Levat 4 mg', dose: '0+0+2', duration: 'Continue', order: 1, isCont: true }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].dose).toBe('0+0+1');
    expect(blocks[0].contLines).toEqual([{ dose: '0+0+2', food: '', duration: 'Continue' }]);
  });

  it('without the flag, the same two rows stay two separate habits', () => {
    // A row saved before 2026-08-17 carries no flag. Two full medicine lines is
    // all the record says, and inventing a taper from them would be a guess.
    const blocks = blocksFrom([
      item({ drug: 'Capsule. Levat 4 mg', dose: '0+0+1', duration: '7 days', order: 0 }),
      item({ drug: 'Capsule. Levat 4 mg', dose: '0+0+2', duration: 'Continue', order: 1 }),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.contLines.length === 0)).toBe(true);
  });

  it('treats isCont === false as a real answer, not a missing one', () => {
    const blocks = blocksFrom([
      item({ drug: 'Tablet. A 5mg', dose: '1', order: 0, isCont: false }),
      item({ drug: 'Tablet. B 5mg', dose: '2', order: 1, isCont: false }),
    ]);
    expect(blocks).toHaveLength(2);
  });

  it('still honours a blank drug when no flag is present (drafts, templates)', () => {
    const blocks = blocksFrom([
      item({ drug: 'Tablet. A 5mg', dose: '1', order: 0 }),
      item({ drug: '', dose: '2', order: 1 }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].contLines).toHaveLength(1);
  });

  it('lets a note terminate a flagged taper too', () => {
    const blocks = blocksFrom([
      item({ drug: 'Tablet. A 5mg', dose: '1', order: 0, isCont: false }),
      item({ drug: 'Drink water', isNote: true, order: 1 }),
      item({ drug: 'Tablet. A 5mg', dose: '2', order: 2, isCont: true }),
    ]);
    // The taper was orphaned by the note and has no head to attach to.
    expect(blocks).toHaveLength(1);
    expect(blocks[0].contLines).toEqual([]);
  });

  it('keeps a 2-step taper distinct from the same two doses as separate lines', () => {
    const taper = blocksFrom([
      item({ drug: 'Tablet. X 5mg', dose: '3', order: 0, isCont: false }),
      item({ drug: 'Tablet. X 5mg', dose: '1', order: 1, isCont: true }),
    ]);
    const separate = blocksFrom([
      item({ drug: 'Tablet. X 5mg', dose: '3', order: 0, isCont: false }),
      item({ drug: 'Tablet. X 5mg', dose: '1', order: 1, isCont: false }),
    ]);
    expect(taper).toHaveLength(1);
    expect(separate).toHaveLength(2);
    expect(taper[0].signature).not.toBe(separate[0].signature);
  });
});

describe('blocksFrom — an empty block is not a habit', () => {
  it('drops a head with dose, food and duration all blank', () => {
    // Production, 2026-08-16: "Capsule. Tycil 500 mg" was saved blank TWICE
    // while its real 1+1+1 · 7 days was saved once. Without this rule the blank
    // block outranks the instruction the doctor actually wanted.
    expect(blocksFrom([item({ drug: 'Capsule. Tycil 500 mg', order: 0 })])).toEqual([]);
  });

  it('drops a head whose fields are whitespace only', () => {
    expect(
      blocksFrom([item({ drug: 'Capsule. Tycil 500 mg', dose: '  ', instruction: ' ', duration: '', order: 0 })]),
    ).toEqual([]);
  });

  it('KEEPS a blank head that carries a continuation line', () => {
    const blocks = blocksFrom([
      item({ drug: 'Tablet. X 5mg', order: 0 }),
      item({ drug: '', dose: '0+0+1', order: 1 }),
    ]);
    expect(blocks).toHaveLength(1);
  });

  it('KEEPS a partly-blank block — that is what the record says', () => {
    const blocks = blocksFrom([
      item({ drug: 'Tablet. Barcavir 0.5 mg', dose: '1+0+0', duration: '', order: 0 }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].duration).toBe('');
  });

  it('keeps a blank-duration block SEPARATE from its "continue" twin', () => {
    // Production: Barcavir 0.5mg exists both ways. Almost certainly the same
    // intent — but merging them would be guessing, so both appear until the
    // doctor hides one.
    const withDur = blocksFrom([item({ drug: 'Tablet. Barcavir 0.5 mg', dose: '1+0+0', duration: 'continue', order: 0 })]);
    const noDur = blocksFrom([item({ drug: 'Tablet. Barcavir 0.5 mg', dose: '1+0+0', duration: '', order: 0 })]);
    expect(withDur[0].signature).not.toBe(noDur[0].signature);
  });
});

describe('blocksFrom — one prescription is one contribution', () => {
  it('deduplicates the same block written twice on one sheet', () => {
    const blocks = blocksFrom([
      item({ drug: 'Tablet. Napa 500mg', dose: '1+1+1', duration: '7 days', order: 0 }),
      item({ drug: 'Tablet. Napa 500mg', dose: '1+1+1', duration: '7 days', order: 1 }),
    ]);
    expect(blocks).toHaveLength(1);
  });

  it('keeps two DIFFERENT instructions for the same medicine', () => {
    const blocks = blocksFrom([
      item({ drug: 'Tablet. Napa 500mg', dose: '1+1+1', duration: '7 days', order: 0 }),
      item({ drug: 'Tablet. Napa 500mg', dose: '1+0+1', duration: 'if pain', order: 1 }),
    ]);
    expect(blocks).toHaveLength(2);
  });

  it('keeps two strengths of one brand apart', () => {
    const blocks = blocksFrom([
      item({ drug: 'Tablet. Napa 500mg', dose: '1+1+1', order: 0 }),
      item({ drug: 'Tablet. Napa 665mg', dose: '1+1+1', order: 1 }),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].drugKey).not.toBe(blocks[1].drugKey);
  });

  it('survives an empty item list', () => {
    expect(blocksFrom([])).toEqual([]);
  });
});

describe('sanitiseContLines — the Json column is unknown until proven otherwise', () => {
  it('reads a well-formed array', () => {
    expect(sanitiseContLines([{ dose: '1', food: '', duration: 'continue' }])).toEqual([
      { dose: '1', food: '', duration: 'continue' },
    ]);
  });

  it('treats null / undefined as "no continuation lines"', () => {
    expect(sanitiseContLines(null)).toEqual([]);
    expect(sanitiseContLines(undefined)).toEqual([]);
  });

  it('reads an empty array as no continuation lines', () => {
    expect(sanitiseContLines([])).toEqual([]);
  });

  it('REFUSES a non-array — the block is dropped whole, never partially', () => {
    expect(sanitiseContLines({ dose: '1', food: '', duration: '' })).toBeNull();
    expect(sanitiseContLines('1+0+1')).toBeNull();
    expect(sanitiseContLines(7)).toBeNull();
    expect(sanitiseContLines(true)).toBeNull();
  });

  it('REFUSES an entry with a missing key', () => {
    expect(sanitiseContLines([{ dose: '1', food: '' }])).toBeNull();
  });

  it('REFUSES an entry with a non-string value', () => {
    expect(sanitiseContLines([{ dose: 1, food: '', duration: '' }])).toBeNull();
    expect(sanitiseContLines([{ dose: null, food: '', duration: '' }])).toBeNull();
  });

  it('REFUSES a null or nested-array entry', () => {
    expect(sanitiseContLines([null])).toBeNull();
    expect(sanitiseContLines([['1', '', '']])).toBeNull();
  });

  it('refuses the WHOLE list when only the second entry is bad', () => {
    expect(
      sanitiseContLines([{ dose: '1', food: '', duration: '' }, { dose: '2' }]),
    ).toBeNull();
  });

  it('never throws, whatever it is handed', () => {
    const nasty: unknown[] = [Symbol('x'), () => 1, new Map(), NaN, Infinity, [[]], {}];
    for (const v of nasty) expect(() => sanitiseContLines(v)).not.toThrow();
  });
});
