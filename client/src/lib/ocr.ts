// ── Client-side OCR for NID verification ─────────────────────
// Uses tesseract.js (runs in the browser, no API key). Reads the
// digits off an uploaded NID image so we can compare them with the
// number the user typed. OCR is imperfect, so callers should treat
// the result as an advisory signal — final approval is still manual.

import Tesseract from "tesseract.js";

export type NidMatch = "match" | "mismatch" | "unreadable";

// Pull every run of digits (length >= 6) out of arbitrary OCR text.
function digitRuns(text: string): string[] {
  return (text.match(/\d[\d\s-]{5,}\d/g) ?? []).map((s) => s.replace(/\D/g, "")).filter(Boolean);
}

/**
 * Run OCR on an image and decide whether `expected` (the typed NID)
 * appears in it.
 *  - "match":      the typed number was found in the image
 *  - "mismatch":   digits were read, but the typed number wasn't among them
 *  - "unreadable": OCR couldn't extract usable digits at all
 */
export async function verifyNidNumber(file: File, expected: string): Promise<NidMatch> {
  const target = expected.replace(/\D/g, "");
  if (!target) return "unreadable";

  const { data } = await Tesseract.recognize(file, "eng");
  const allDigits = (data.text.match(/\d/g) ?? []).join("");
  if (allDigits.length < 6) return "unreadable";

  // Direct substring match against the full digit stream…
  if (allDigits.includes(target)) return "match";

  // …or against any individual digit run (handles spacing/line breaks).
  const runs = digitRuns(data.text);
  if (runs.some((r) => r.includes(target) || target.includes(r))) return "match";

  return "mismatch";
}
