import { describe, expect, it } from "vitest";
import { mergeIpdClinical } from "./ipdClinical";
import type { IpdClinical } from "./api";

// ⚕️ This file guards one thing: an IPD save must never delete a key it does not
// know about. The admission's `clinical` column is replaced wholesale on every
// save, so a key missing from the payload is gone from the patient's record —
// there is no separate delete to review, and nothing tells the doctor.
describe("mergeIpdClinical", () => {
  const fields: IpdClinical = { diagnosis: ["febrile convulsion"], plan: ["Bed rest"] };

  it("keeps a key this build has never heard of", () => {
    const stored = { ...fields, somethingAFutureBuildAdded: [1, 2, 3] } as IpdClinical;
    const out = mergeIpdClinical(stored, fields) as Record<string, unknown>;
    expect(out.somethingAFutureBuildAdded).toEqual([1, 2, 3]);
  });

  it("round-trips analogueSheets when the payload does not carry them", () => {
    const sheets = [
      { id: "s1", url: "/uploads/a.jpg", addedAt: "2026-08-26T04:00:00.000Z" },
      { id: "s2", url: "/uploads/b.jpg", thumbUrl: "/uploads/b-t.jpg", addedAt: "2026-08-26T04:01:00.000Z" },
    ];
    const out = mergeIpdClinical({ ...fields, analogueSheets: sheets }, fields);
    expect(out.analogueSheets).toEqual(sheets);
  });

  it("lets this build's fields win over the stored ones", () => {
    const out = mergeIpdClinical({ diagnosis: ["old"], plan: ["old plan"] }, fields);
    expect(out.diagnosis).toEqual(["febrile convulsion"]);
    expect(out.plan).toEqual(["Bed rest"]);
  });

  it("still writes an empty list — clearing a field is not the same as omitting it", () => {
    const out = mergeIpdClinical({ diagnosis: ["gone"] }, { diagnosis: [] });
    expect(out.diagnosis).toEqual([]);
  });

  // The Json column can come back as anything. None of these may throw on the
  // doctor's save path.
  it("survives a missing, null or malformed stored value", () => {
    expect(mergeIpdClinical(undefined, fields)).toEqual(fields);
    expect(mergeIpdClinical(null, fields)).toEqual(fields);
    expect(mergeIpdClinical("not an object" as unknown as IpdClinical, fields)).toEqual(fields);
    expect(mergeIpdClinical([] as unknown as IpdClinical, fields)).toEqual(fields);
  });

  it("does not mutate the stored object", () => {
    const stored: IpdClinical = { diagnosis: ["old"] };
    mergeIpdClinical(stored, fields);
    expect(stored.diagnosis).toEqual(["old"]);
  });
});
