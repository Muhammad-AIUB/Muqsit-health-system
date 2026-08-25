import type { IpdAnalogueSheet } from "./api";

// ── The paper ("analogue") order sheet: pure rules ──────────────────────────
// Everything here is a decision about a patient's record, so it lives outside
// the component and is unit-tested. The panel does the DOM; this file decides
// which files are allowed in, what a partial batch means, and what "removed"
// does to the list.

// A photographed A4 page at 1600px across is roughly 135 dpi — fine for printed
// report text, marginal for the handwriting a dispenser reads off a ward order
// sheet. These numbers are the whole reason `uploadImage` takes an option bag.
export const ANALOGUE_UPLOAD = { maxDim: 2400, quality: 0.9 } as const;

// The grid draws 150px squares. Without a small copy the browser downloads the
// full 2400px page to do it, which on a 20-page admission is tens of MB over
// ward wifi.
export const THUMB_MAX_DIM = 400;

export const MAX_FILES_PER_BATCH = 20;

// Matches the server's 8 MB body limit, which is deliberate and documented
// (`server/CLAUDE.md`): iPhone report photos are routinely 3-8 MB, and
// `compressImage` hands the ORIGINAL file back for HEIC and for anything the
// re-encode does not shrink. Rejecting here rather than at the server turns a
// confusing 413 into a named file the doctor can do something about.
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

// HEIC is on the list on purpose: iPhones produce it, the server's magic-byte
// check accepts it, and `compressImage` passes it through untouched.
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
];

export interface RejectedFile {
  name: string;
  reason: string;
}

export interface FileCheck {
  accepted: File[];
  rejected: RejectedFile[];
}

/**
 * Decide which dropped/picked files may be uploaded.
 *
 * A rejected file is NAMED and the rest still go through. An all-or-nothing
 * refusal on a six-page sheet because one frame was a screenshot means the
 * doctor re-does the whole thing, and the usual response to that is to stop
 * photographing the sheet at all.
 */
export function checkSheetFiles(files: File[]): FileCheck {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];

  for (const file of files) {
    if (accepted.length >= MAX_FILES_PER_BATCH) {
      rejected.push({ name: file.name, reason: `more than ${MAX_FILES_PER_BATCH} pages at once` });
      continue;
    }
    // Some browsers hand over an empty `type` for a dragged file; fall back to
    // the extension rather than refusing something that is probably fine.
    const type = file.type || guessTypeFromName(file.name);
    if (!ACCEPTED_TYPES.includes(type)) {
      rejected.push({ name: file.name, reason: "not an image" });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejected.push({ name: file.name, reason: `larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB` });
      continue;
    }
    accepted.push(file);
  }

  return { accepted, rejected };
}

function guessTypeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "avif") return "image/avif";
  return "";
}

export interface UploadedSheet {
  url: string;
  thumbUrl?: string;
}

export interface UploadOutcome {
  uploaded: UploadedSheet[];
  failed: RejectedFile[];
}

type Uploader = (file: File, opts?: { maxDim?: number; quality?: number }) => Promise<string>;

/**
 * Upload a batch, keeping whatever lands.
 *
 * Two rules, both about not losing a page of a patient's order sheet:
 *
 * 1. **A failed file never discards its neighbours.** The previous gallery used
 *    `Promise.all`, which rejects on the first failure — five successful uploads
 *    thrown away because the sixth timed out, reported as a bare "Upload failed".
 * 2. **The thumbnail is a convenience, the full image is the record.** If the
 *    thumbnail fails the page is still created and the grid falls back to the
 *    full image. If the FULL image fails there is no page, and the file is
 *    reported by name.
 *
 * `upload` is injected so this is testable without a network or a canvas.
 */
export async function uploadSheetFiles(files: File[], upload: Uploader): Promise<UploadOutcome> {
  const results = await Promise.allSettled(
    files.map(async (file) => {
      const url = await upload(file, ANALOGUE_UPLOAD);
      let thumbUrl: string | undefined;
      try {
        thumbUrl = await upload(file, { maxDim: THUMB_MAX_DIM, quality: 0.8 });
      } catch {
        /* best-effort: the page still has its full-resolution image */
      }
      return thumbUrl ? { url, thumbUrl } : { url };
    }),
  );

  const uploaded: UploadedSheet[] = [];
  const failed: RejectedFile[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") uploaded.push(r.value);
    else failed.push({ name: files[i].name, reason: reasonOf(r.reason) });
  });
  return { uploaded, failed };
}

const reasonOf = (e: unknown): string =>
  e instanceof Error && e.message ? e.message : "upload failed";

/**
 * One sentence a doctor can act on. Never "Upload failed" with no count — the
 * number of pages that landed is the thing they need to know before they walk
 * away from the patient.
 */
export function describeOutcome(added: number, failed: RejectedFile[]): string {
  if (failed.length === 0) return added === 1 ? "1 page added." : `${added} pages added.`;
  const names = failed.map((f) => `${f.name} (${f.reason})`).join(", ");
  if (added === 0) return `Nothing was added. ${failed.length} failed: ${names}`;
  return `${added} added, ${failed.length} failed: ${names}`;
}

// ── List rules ─────────────────────────────────────────────────────────────
// Removal is SOFT. The entry keeps its place and its data; it simply stops
// being listed. That is what makes a page recoverable after the Undo bar is
// gone, and what leaves `removedBy` on the record.

export const visibleSheets = (sheets?: IpdAnalogueSheet[] | null): IpdAnalogueSheet[] =>
  (Array.isArray(sheets) ? sheets : []).filter((s) => s && !s.removedAt);

/** Optimistic local mirror of the server's soft delete. */
export function withSheetRemoved(
  sheets: IpdAnalogueSheet[],
  id: string,
  at: string,
  by?: string,
): IpdAnalogueSheet[] {
  return sheets.map((s) => (s.id === id ? { ...s, removedAt: at, ...(by ? { removedBy: by } : {}) } : s));
}

/** Optimistic local mirror of the server's restore. Order is never disturbed. */
export function withSheetRestored(sheets: IpdAnalogueSheet[], id: string): IpdAnalogueSheet[] {
  return sheets.map((s) => {
    if (s.id !== id) return s;
    const { removedAt: _a, removedBy: _b, ...rest } = s;
    return rest;
  });
}

export function withSheetLabel(
  sheets: IpdAnalogueSheet[],
  id: string,
  label: string,
): IpdAnalogueSheet[] {
  const trimmed = label.trim();
  return sheets.map((s) => {
    if (s.id !== id) return s;
    if (!trimmed) {
      const { label: _l, ...rest } = s;
      return rest;
    }
    return { ...s, label: trimmed };
  });
}
