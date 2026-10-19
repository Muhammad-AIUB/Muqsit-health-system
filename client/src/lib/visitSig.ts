// ⚕️ A visit's signature: what it says, to compare with what was printed
// (MuqsitContext). One of the two is read back from the database after a
// reload, and a JSON column gives an object's keys back in another order — so
// keys are sorted here, at every depth. An array keeps its order: the order of
// lines is part of a prescription. A key with no value is left out, as JSON and
// the database leave it out.
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}

/**
 * ⚕️ A short fingerprint of a value (its `stableJson`), never the value: it rides
 * the draft, the patient's parked copy and the device mirror, and holding the
 * visit's own TEXT there carried one patient's diagnosis and medicines into
 * another's record (third review, 19/10/2026). 53 bits (cyrb53): two different
 * visits read alike about once in 2^53 comparisons, and then a change after a
 * print is not parked — the old behaviour, never another patient's data.
 */
export function fingerprint(value: unknown): string {
  const text = stableJson(value);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

