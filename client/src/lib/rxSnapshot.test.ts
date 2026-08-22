import { describe, expect, it } from "vitest";
import { createRxSnapshotGate, needsRxSnapshot, rxSnapshotKey, RX_SNAPSHOT_KEY_LEN } from "./rxSnapshot";

describe("rxSnapshotKey", () => {
  it("gives the same sheet the same key, every time", async () => {
    const html = "<html><body>Tablet. Napa 500 mg</body></html>";
    expect(await rxSnapshotKey(html)).toBe(await rxSnapshotKey(html));
    expect((await rxSnapshotKey(html))!.length).toBe(RX_SNAPSHOT_KEY_LEN);
  });

  it("changes when ANY part of the printed sheet changes", async () => {
    const base = await rxSnapshotKey("<b>Napa</b> 500 mg · 23/08/2026");
    // A dose, a date, a single character — all are a different document.
    expect(await rxSnapshotKey("<b>Napa</b> 665 mg · 23/08/2026")).not.toBe(base);
    expect(await rxSnapshotKey("<b>Napa</b> 500 mg · 24/08/2026")).not.toBe(base);
    expect(await rxSnapshotKey("<b>Napa</b> 500 mg · 23/08/2026 ")).not.toBe(base);
  });
});

describe("needsRxSnapshot", () => {
  it("files the first snapshot when nothing has been recorded", () => {
    // A brand-new patient, and every patient that existed before the key column.
    expect(needsRxSnapshot("abc", null)).toBe(true);
    expect(needsRxSnapshot("abc", undefined)).toBe(true);
    expect(needsRxSnapshot("abc", "")).toBe(true);
  });

  it("files nothing when the sheet is the one already in the gallery", () => {
    // However many times Save is clicked.
    expect(needsRxSnapshot("abc", "abc")).toBe(false);
  });

  it("files a new snapshot as soon as the sheet differs", () => {
    expect(needsRxSnapshot("abc", "abd")).toBe(true);
  });

  it("keeps the copy when the key could not be computed", () => {
    // ⚕️ A duplicate is a nuisance; a missing copy of a document the doctor
    // handed to a patient is not. Uncertainty must never suppress.
    expect(needsRxSnapshot(null, "abc")).toBe(true);
    expect(needsRxSnapshot(null, null)).toBe(true);
  });
});

describe("createRxSnapshotGate", () => {
  it("files the first sheet, then refuses the same one however often it is saved", () => {
    const gate = createRxSnapshotGate(null);          // a patient with no snapshot yet
    expect(gate.claim("sheet-1")).toBe(true);
    gate.file("sheet-1");
    expect(gate.claim("sheet-1")).toBe(false);
    expect(gate.claim("sheet-1")).toBe(false);
    expect(gate.claim("sheet-1")).toBe(false);
  });

  it("files again as soon as the doctor changes something", () => {
    const gate = createRxSnapshotGate("sheet-1");
    expect(gate.claim("sheet-2")).toBe(true);
    gate.file("sheet-2");
    expect(gate.claim("sheet-2")).toBe(false);
    // ...and back to the earlier wording is a change too — it differs from what
    // the gallery last received.
    expect(gate.claim("sheet-1")).toBe(true);
  });

  it("refuses a second click that lands while the first is still capturing", () => {
    // The claim is taken before the capture, which is the slow part.
    const gate = createRxSnapshotGate("old");
    expect(gate.claim("new")).toBe(true);   // click 1, capture starts
    expect(gate.claim("new")).toBe(false);  // click 2, mid-capture
    gate.file("new");                       // click 1 finishes
    expect(gate.key()).toBe("new");
  });

  it("⚕️ gives the sheet back when the capture fails, so it is not lost", () => {
    const gate = createRxSnapshotGate("old");
    expect(gate.claim("new")).toBe(true);
    gate.release();                          // capture or upload threw
    expect(gate.key()).toBe("old");
    expect(gate.claim("new")).toBe(true);    // the retry must still be allowed
  });

  it("adopts the record when the patient changes", () => {
    const gate = createRxSnapshotGate("patient-a-sheet");
    gate.reset("patient-b-sheet");
    expect(gate.claim("patient-b-sheet")).toBe(false);
    expect(gate.claim("patient-a-sheet")).toBe(true);
    // A patient with nothing on file always gets a snapshot.
    gate.reset(null);
    expect(gate.claim("anything")).toBe(true);
  });

  it("never suppresses when the key could not be computed", () => {
    const gate = createRxSnapshotGate("old");
    expect(gate.claim(null)).toBe(true);
    gate.file(null);
    expect(gate.claim(null)).toBe(true);
  });
});
