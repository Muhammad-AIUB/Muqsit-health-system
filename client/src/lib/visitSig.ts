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
