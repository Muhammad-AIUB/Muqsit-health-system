import { normaliseDrugKey, searchKeyOf, signatureOf, ALGO_VERSION } from './normalise';

// ⚕️ These are CLINICAL assertions, not string-formatting ones. A failure here
// means two medicines that must stay apart have been folded into one habit — a
// silent change with no visible symptom in the app. House precedent:
// client/src/lib/rxAlerts.test.ts pins each rule string for the same reason.
//
// Every "must never fold" pair below was found in the production data on
// 2026-08-16 (design § Data validation), not invented for the test.

describe('normaliseDrugKey — what must NEVER fold', () => {
  it('keeps two strengths of the same brand apart', () => {
    expect(normaliseDrugKey('Tablet. Napa 500mg')).not.toBe(
      normaliseDrugKey('Tablet. Napa 665mg'),
    );
  });

  it('keeps a decimal strength apart from a whole one', () => {
    expect(normaliseDrugKey('Tablet. Barcavir 0.5 mg')).not.toBe(
      normaliseDrugKey('Tablet. Barcavir 5 mg'),
    );
  });

  it('never converts between units — 0.5g is not 500mg', () => {
    expect(normaliseDrugKey('Tablet. X 0.5g')).not.toBe(normaliseDrugKey('Tablet. X 500mg'));
  });

  it('keeps an enteric-coated tablet apart from a plain one', () => {
    expect(normaliseDrugKey('Tablet (Enteric Coated). Pantonix 40 mg')).toBe(
      'tablet (enteric coated). pantonix 40mg',
    );
    expect(normaliseDrugKey('Tablet (Enteric Coated). Pantonix 40 mg')).not.toBe(
      normaliseDrugKey('Tablet. Pantonix 40 mg'),
    );
  });

  it('keeps modified- and extended-release apart from plain and from each other', () => {
    const mr = normaliseDrugKey('Tablet (Modified Release). Dimerol MR 30 mg');
    const er = normaliseDrugKey('Tablet (Extended Release). Alfumax ER 10 mg');
    expect(mr).toBe('tablet (modified release). dimerol mr 30mg');
    expect(er).toBe('tablet (extended release). alfumax er 10mg');
    expect(mr).not.toBe(normaliseDrugKey('Tablet. Dimerol MR 30 mg'));
  });

  it('keeps an enteric-coated capsule apart from a plain capsule', () => {
    expect(normaliseDrugKey('Capsule (Enteric Coated). Sergel 20 mg')).not.toBe(
      normaliseDrugKey('Capsule. Sergel 20 mg'),
    );
  });

  it('keeps SC Injection apart from plain Injection — SC is not IV', () => {
    expect(normaliseDrugKey('SC Injection. Diasulin')).toBe('sc injection. diasulin');
    expect(normaliseDrugKey('SC Injection. Diasulin')).not.toBe(
      normaliseDrugKey('Injection. Diasulin'),
    );
  });
});

describe('normaliseDrugKey — what SHOULD fold (typography only)', () => {
  it('folds case and repeated whitespace', () => {
    expect(normaliseDrugKey('  TABLET.   Napa   500mg ')).toBe('tablet. napa 500mg');
  });

  it('expands an abbreviated form: cap. → capsule.', () => {
    expect(normaliseDrugKey('Cap. Tycil 500 mg')).toBe(normaliseDrugKey('Capsule. Tycil 500mg'));
    expect(normaliseDrugKey('Cap. Tycil 500 mg')).toBe('capsule. tycil 500mg');
  });

  it('expands a dot-less abbreviation the way a doctor free-types it', () => {
    expect(normaliseDrugKey('tab Seclo')).toBe('tablet. seclo');
    expect(normaliseDrugKey('inj. Halopid')).toBe('injection. halopid');
    expect(normaliseDrugKey('Syp. Ambrox')).toBe(normaliseDrugKey('Syr. Ambrox'));
  });

  it('expands an abbreviation that sits beside a qualifier, keeping the qualifier', () => {
    expect(normaliseDrugKey('SC Inj. Diasulin')).toBe('sc injection. diasulin');
  });

  it('closes the gap between a strength number and its unit', () => {
    expect(normaliseDrugKey('Tablet. Napa 500 mg')).toBe(normaliseDrugKey('Tablet. Napa 500mg'));
  });

  it('closes the gap in a compound strength', () => {
    expect(normaliseDrugKey('Oral Solution. Avolac 3.35 gm/5 ml')).toBe(
      'oral solution. avolac 3.35gm/5ml',
    );
  });

  it('drops a trailing n/a — "strength not recorded" is not a strength', () => {
    expect(normaliseDrugKey('Tablet. Bicozin N/A')).toBe(normaliseDrugKey('Tablet. Bicozin'));
    expect(normaliseDrugKey('Tablet. Bicozin N/A')).toBe('tablet. bicozin');
  });

  it('drops n/a only at the end, never mid-label', () => {
    expect(normaliseDrugKey('Tablet. N/A Brand 5mg')).toBe('tablet. n/a brand 5mg');
  });
});

describe('normaliseDrugKey — input with no dosage form', () => {
  it('leaves a bare generic + strength alone', () => {
    expect(normaliseDrugKey('Metformin 500mg')).toBe('metformin 500mg');
    expect(normaliseDrugKey('Metformin 500 mg')).toBe('metformin 500mg');
  });

  it('does not mistake a decimal point for a dosage-form separator', () => {
    // "napa 0" contains a digit, so it is a strength, not a form token.
    expect(normaliseDrugKey('Napa 0.5 mg')).toBe('napa 0.5mg');
  });

  it('is empty for empty input', () => {
    expect(normaliseDrugKey('')).toBe('');
    expect(normaliseDrugKey('   ')).toBe('');
  });
});

describe('searchKeyOf', () => {
  it('strips the form token', () => {
    expect(searchKeyOf('Tablet. Napa 500mg')).toBe('napa 500mg');
  });

  it('strips the form token AND its parenthesised qualifier', () => {
    expect(searchKeyOf('Tablet (Enteric Coated). Pantonix 40 mg')).toBe('pantonix 40mg');
    expect(searchKeyOf('SC Injection. Diasulin')).toBe('diasulin');
  });

  it('maps every way of typing the same medicine onto one lookup', () => {
    expect(searchKeyOf('tab napa')).toBe('napa');
    expect(searchKeyOf('Tablet. Napa')).toBe('napa');
    expect(searchKeyOf('napa')).toBe('napa');
  });

  it('leaves a form-less query alone', () => {
    expect(searchKeyOf('metformin 500 mg')).toBe('metformin 500mg');
  });
});

describe('signatureOf', () => {
  const line = (dose: string, food: string, duration: string) => ({ dose, food, duration });

  it('folds case and outer whitespace only', () => {
    expect(signatureOf(line(' 1+1+1 ', 'After Meal', '7 Days'))).toBe(
      signatureOf(line('1+1+1', 'after meal', '7 days')),
    );
  });

  it('keeps a blank field distinct from a filled one', () => {
    expect(signatureOf(line('1+0+0', '', 'continue'))).not.toBe(
      signatureOf(line('1+0+0', '', '')),
    );
  });

  it('treats a tapering block as one unit — a head alone is not the block', () => {
    expect(signatureOf(line('0+0+3', 'after meal', '1 month'))).not.toBe(
      signatureOf(line('0+0+3', 'after meal', '1 month'), [
        line('0+0+1', 'after meal', 'continue'),
      ]),
    );
  });

  it('keeps continuation ORDER — a 3→1 taper is not a 1→3 taper', () => {
    const head = line('0+0+3', '', '1 month');
    const down = signatureOf(head, [line('0+0+1', '', 'continue')]);
    const up = signatureOf(line('0+0+1', '', '1 month'), [line('0+0+3', '', 'continue')]);
    expect(down).not.toBe(up);
  });

  it('never confuses a field boundary with a value the doctor typed', () => {
    // "a | b" style separators would collide with free text; the ASCII unit
    // separator cannot appear in anything typed on the pad.
    expect(signatureOf(line('1+0+1', '', ''))).not.toBe(signatureOf(line('1', '0+1', '')));
  });
});

describe('normaliseDrugKey — the client mirror must agree', () => {
  // ⚕️ This table is duplicated VERBATIM in
  // client/src/lib/rxHabitKey.test.ts, which runs the client's copy of this
  // function (client/src/lib/rxHabitKey.ts). The copy exists so a habit clicked
  // in the ℞ pad can borrow a generic name from the medicine results already
  // loaded — without it, generic-based drug-drug alerts go blind on the fastest
  // path through the editor.
  //
  // If either copy is edited alone, one of the two suites goes red. Change an
  // expectation here and you must change it there, and only after checking why
  // the rule exists.
  const cases: Array<[string, string]> = [
    ['  TABLET.   Napa   500mg ', 'tablet. napa 500mg'],
    ['Tablet. Napa 500 mg', 'tablet. napa 500mg'],
    ['Cap. Tycil 500 mg', 'capsule. tycil 500mg'],
    ['tab Seclo', 'tablet. seclo'],
    ['inj. Halopid', 'injection. halopid'],
    ['Tablet (Enteric Coated). Pantonix 40 mg', 'tablet (enteric coated). pantonix 40mg'],
    ['Tablet (Modified Release). Dimerol MR 30 mg', 'tablet (modified release). dimerol mr 30mg'],
    ['Tablet (Extended Release). Alfumax ER 10 mg', 'tablet (extended release). alfumax er 10mg'],
    ['SC Injection. Diasulin', 'sc injection. diasulin'],
    ['SC Inj. Diasulin', 'sc injection. diasulin'],
    ['Oral Solution. Avolac 3.35 gm/5 ml', 'oral solution. avolac 3.35gm/5ml'],
    ['Tablet. Bicozin N/A', 'tablet. bicozin'],
    ['Tablet. N/A Brand 5mg', 'tablet. n/a brand 5mg'],
    ['Metformin 500 mg', 'metformin 500mg'],
    ['Napa 0.5 mg', 'napa 0.5mg'],
    ['', ''],
    ['   ', ''],
  ];

  it.each(cases)('%j → %j', (input, expected) => {
    expect(normaliseDrugKey(input)).toBe(expected);
  });
});

describe('ALGO_VERSION', () => {
  it('is an integer that rows are stamped with', () => {
    expect(Number.isInteger(ALGO_VERSION)).toBe(true);
    expect(ALGO_VERSION).toBeGreaterThanOrEqual(1);
  });
});
