// Whether "Save & print" should file another image into the patient's
// "All prescriptions(Image)" gallery.
//
// ⚕️ The rule (physician's decision, 2026-08-23): the first save files a
// snapshot; after that only a save whose PRINTED SHEET differs does. Clicking
// Save again on a visit nothing was changed on must not add the same sheet
// twice, however many times it is clicked.
//
// The comparison is on the sheet's HTML, never on the image bytes. Two captures
// of one prescription are not equal as files — html2canvas rasterises a live
// DOM, and `compressImage` re-encodes to JPEG lossily and only when that comes
// out smaller. The HTML is the thing that actually carries the document: the
// same string feeds the print window and the snapshot, so if it matches, the
// doctor is holding the same paper.
//
// Deliberately NOT normalised. The header date, the page size and the margins
// are part of that string, and a sheet printed on a different date or a
// different page IS a different document — the physician asked for any change
// to count, not only a change of wording.

/** Length of the hex digest `rxSnapshotKey` returns. */
export const RX_SNAPSHOT_KEY_LEN = 64;

/**
 * Fingerprint the printed sheet. Returns null when the browser gives us no
 * usable digest (`crypto.subtle` is absent outside a secure context, e.g. a
 * clinic reaching the app over plain http on a LAN address). Null is the
 * "cannot tell" answer, and `needsRxSnapshot` reads it as "take one" —
 * a duplicate in the gallery is a nuisance, a missing copy of a document the
 * doctor handed to a patient is not.
 */
export async function rxSnapshotKey(html: string): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(html));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/**
 * Decide whether to capture, upload and file a new gallery image.
 *
 * `key` is this sheet's fingerprint (null = could not be computed).
 * `lastKey` is what was stored for the newest auto snapshot (null/undefined =
 * nothing recorded — a patient from before this existed, a first save, or a
 * gallery holding only hand-added images).
 */
export function needsRxSnapshot(key: string | null, lastKey: string | null | undefined): boolean {
  if (!key) return true;      // cannot tell → keep the copy
  if (!lastKey) return true;  // nothing recorded yet → this is the first
  return key !== lastKey;     // same sheet → already in the gallery
}

/**
 * The gallery's gate for one patient: who is allowed to file the next image.
 *
 * `claim` is taken BEFORE the (slow) capture, so a second Save & print landing
 * mid-capture finds the sheet already spoken for instead of filing the same
 * paper twice. Whoever claims must finish with `file` or `release`.
 *
 * ⚕️ `release` is the safety half. If the capture or the upload fails, the
 * fingerprint goes back to what it was — otherwise the gate would believe a
 * sheet is in the gallery when nothing ever got there, and would go on
 * suppressing every identical save: a document the doctor printed and handed
 * over, with no copy on file.
 */
export interface RxSnapshotGate {
  /** True when this sheet should be captured; claims it. */
  claim(key: string | null): boolean;
  /** The image reached the gallery. */
  file(key: string | null): void;
  /** It did not — undo the claim. */
  release(): void;
  /** Switch patients, or reload one: adopt what the record says. */
  reset(key: string | null): void;
  /** The fingerprint the gate currently believes is in the gallery. */
  key(): string | null;
}

export function createRxSnapshotGate(initial: string | null = null): RxSnapshotGate {
  let current = initial;
  let previous: string | null = initial;
  return {
    claim(key) {
      if (!needsRxSnapshot(key, current)) return false;
      previous = current;
      current = key;
      return true;
    },
    file(key) { current = key; previous = key; },
    release() { current = previous; },
    reset(key) { current = key; previous = key; },
    key() { return current; },
  };
}
