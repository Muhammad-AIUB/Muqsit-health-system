/**
 * ⚕️ What makes two written phrases "the same" instruction.
 *
 * A red test in the FOLDS block means the doctor stops seeing a line they use
 * every day. A red test in the DOES NOT FOLD block is worse: it means two
 * different instructions were merged, and the count on one of them is a lie.
 */
import {
  MIN_PHRASE_LEN,
  isLearnablePhrase,
  isPhraseSource,
  phraseSignature,
} from './normalise';

describe('phraseSignature — folds typography', () => {
  it('folds letter case', () => {
    expect(phraseSignature('Insulin as before')).toBe(phraseSignature('insulin as before'));
    expect(phraseSignature('INSULIN AS BEFORE')).toBe(phraseSignature('Insulin as before'));
  });

  it('folds leading, trailing and repeated whitespace', () => {
    expect(phraseSignature('  Insulin as before ')).toBe('insulin as before');
    expect(phraseSignature('Insulin   as\tbefore')).toBe('insulin as before');
    expect(phraseSignature('Insulin as\nbefore')).toBe('insulin as before');
  });

  it('folds one trailing full stop', () => {
    expect(phraseSignature('Insulin as before.')).toBe('insulin as before');
    expect(phraseSignature('Insulin as before . ')).toBe('insulin as before');
  });

  it('gives the doctor the same key however they typed it that day', () => {
    const forms = ['Insulin as before', 'insulin as before.', '  INSULIN   as before  '];
    expect(new Set(forms.map(phraseSignature)).size).toBe(1);
  });
});

describe('phraseSignature — DOES NOT fold anything that carries meaning', () => {
  // ⚕️ The medicine key keeps the strength for exactly this reason: two doses
  // that fold into one are two clinical facts reported as one.
  it('keeps a dosage-form prefix', () => {
    expect(phraseSignature('Inj. Insulin as before'))
      .not.toBe(phraseSignature('Insulin as before'));
  });

  it('keeps numbers', () => {
    expect(phraseSignature('Review after 7 days')).not.toBe(phraseSignature('Review after 15 days'));
    expect(phraseSignature('Insulin 10 units')).not.toBe(phraseSignature('Insulin 20 units'));
  });

  it('keeps units and parenthesised qualifiers', () => {
    expect(phraseSignature('Insulin 10 u')).not.toBe(phraseSignature('Insulin 10 mg'));
    expect(phraseSignature('Insulin (short acting) as before'))
      .not.toBe(phraseSignature('Insulin as before'));
  });

  it('keeps internal punctuation, and a dot that is not the last character', () => {
    expect(phraseSignature('Stop. Review in 3 days')).toBe('stop. review in 3 days');
    expect(phraseSignature('Insulin as before, recheck sugar'))
      .not.toBe(phraseSignature('Insulin as before recheck sugar'));
  });

  it('keeps negation — the difference a patient would feel', () => {
    expect(phraseSignature('Continue insulin')).not.toBe(phraseSignature('Do not continue insulin'));
  });
});

describe('phraseSignature — bad input', () => {
  it('is an empty string for anything that is not text', () => {
    expect(phraseSignature('')).toBe('');
    expect(phraseSignature('   ')).toBe('');
    expect(phraseSignature('.')).toBe('');
    expect(phraseSignature(null)).toBe('');
    expect(phraseSignature(undefined)).toBe('');
    expect(phraseSignature(42)).toBe('');
  });
});

describe('isLearnablePhrase', () => {
  it('learns a real instruction', () => {
    expect(isLearnablePhrase('Insulin as before')).toBe(true);
    expect(isLearnablePhrase('NPO')).toBe(true); // exactly the minimum
  });

  // A stray keystroke at the top of a list the doctor is meant to trust is
  // worse than one missing suggestion.
  it('refuses a stray keystroke', () => {
    expect(MIN_PHRASE_LEN).toBe(3);
    expect(isLearnablePhrase('x')).toBe(false);
    expect(isLearnablePhrase('ab')).toBe(false);
    expect(isLearnablePhrase('   ')).toBe(false);
    expect(isLearnablePhrase('.')).toBe(false);
  });
});

describe('isPhraseSource', () => {
  it('accepts the two surfaces and nothing else', () => {
    expect(isPhraseSource('advice')).toBe(true);
    expect(isPhraseSource('rxNote')).toBe(true);
    expect(isPhraseSource('Advice')).toBe(false);
    expect(isPhraseSource('note')).toBe(false);
    expect(isPhraseSource('')).toBe(false);
    expect(isPhraseSource(undefined)).toBe(false);
  });
});
