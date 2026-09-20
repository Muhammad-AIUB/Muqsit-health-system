// ── Which image formats this app accepts, in ONE place ─────────────────────
//
// Before this file there were FIVE disagreeing allowlists — `compressImage`,
// the IPD analogue panel's `ACCEPTED_TYPES`, the server's multer MIME filter,
// the server's magic-byte check, and PatientChat's `isImageUrl`. A format could
// pass one gate and fail another, and which screen broke depended on which list
// it hit: the server accepted BMP and GIF while the ward's order-sheet panel
// refused them, and the chat rendered SVG (which the server never stores) but
// not AVIF (which it does).
//
// ⚕️ The rule this file exists to hold: **never store a document the doctor
// cannot open.** A report photographed as HEIC and filed unviewable is worse
// than one refused at the door, because the refusal is visible immediately and
// the unviewable file is discovered months later, by someone who needed it.
//
// The server mirrors the same table in `src/uploads/upload.service.ts`
// (`checkMagic` / `safeExt`). The two are deliberate copies rather than a shared
// package — they fail for different reasons and at different moments — and
// `imageFormats.test.ts` pins the table so a change on one side is visible.

export type ImageKind = 'jpeg' | 'png' | 'gif' | 'bmp' | 'webp' | 'avif' | 'heic' | 'tiff';

/** Formats a browser can draw straight into an `<img>` or a canvas. */
export const BROWSER_RENDERABLE: readonly ImageKind[] = ['jpeg', 'png', 'gif', 'bmp', 'webp', 'avif'];

/**
 * Formats no mainstream desktop browser can draw. They are accepted, but they
 * are CONVERTED to JPEG before upload (`lib/decodeImage.ts`) — never stored as
 * they arrived. HEIC is the iPhone default; TIFF is what most document scanners
 * produce, and both routinely reach a doctor's machine.
 */
export const NEEDS_DECODE: readonly ImageKind[] = ['heic', 'tiff'];

export const ALL_KINDS: readonly ImageKind[] = [...BROWSER_RENDERABLE, ...NEEDS_DECODE];

/**
 * The `accept` attribute for every file input in the app.
 *
 * `image/*` ALONE IS NOT ENOUGH, and that is not a style preference: Windows
 * has no registered MIME type for `.heic` or `.tif` on a stock install, so a
 * picker filtered on `image/*` greys the doctor's own scan out and they cannot
 * select the file at all. The explicit extensions put them back.
 */
export const IMAGE_ACCEPT = 'image/*,.heic,.heif,.hif,.tif,.tiff';

const MIME_OF: Record<ImageKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  tiff: 'image/tiff',
};

export const mimeOf = (kind: ImageKind): string => MIME_OF[kind];

// ── Detection ───────────────────────────────────────────────────────────────
// Content first, name second. A file's declared MIME type is the LEAST reliable
// signal here: iPhone photos routinely arrive as `application/octet-stream`, and
// a `.jpg` extension on HEIC bytes is common enough to be ordinary. The bytes
// are the only thing that cannot be wrong.

const ascii = (b: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...Array.from(b.slice(from, to)));

// The ISO-BMFF brands that mean "a still image in a HEIF container". `mif1` and
// `msf1` are generic HEIF brands an iPhone also emits, so they belong here.
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'heif', 'mif1', 'msf1'];

/** The format of these bytes, read from the signature alone, or null. */
export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (ascii(bytes, 0, 4) === 'GIF8') return 'gif';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
  // TIFF: "II*\0" little-endian, "MM\0*" big-endian. Checked BEFORE the ftyp
  // branch because a TIFF's first bytes can otherwise look like nothing else.
  if (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) return 'tiff';
  if (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a) return 'tiff';
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (HEIF_BRANDS.includes(brand)) return 'heic';
  }
  return null;
}

/** Last resort when the bytes cannot be read: the filename, then the MIME. */
export function kindFromNameOrType(name: string, type = ''): ImageKind | null {
  const ext = (/\.([a-z0-9]+)$/i.exec(name || '')?.[1] ?? '').toLowerCase();
  const byExt: Record<string, ImageKind> = {
    jpg: 'jpeg', jpeg: 'jpeg', jpe: 'jpeg', jfif: 'jpeg',
    png: 'png', gif: 'gif', bmp: 'bmp', dib: 'bmp', webp: 'webp', avif: 'avif',
    heic: 'heic', heif: 'heic', hif: 'heic',
    tif: 'tiff', tiff: 'tiff',
  };
  if (byExt[ext]) return byExt[ext];
  const sub = (type.split('/')[1] ?? '').toLowerCase();
  const byMime: Record<string, ImageKind> = {
    jpeg: 'jpeg', jpg: 'jpeg', png: 'png', gif: 'gif', bmp: 'bmp', webp: 'webp',
    avif: 'avif', heic: 'heic', heif: 'heic', 'heic-sequence': 'heic', tiff: 'tiff',
  };
  return byMime[sub] ?? null;
}

/**
 * What this file actually is. Reads the first bytes; falls back to the name and
 * the declared type only when the read fails (an unreadable File object, a
 * browser that refuses the slice).
 */
export async function detectImageKind(file: File): Promise<ImageKind | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const sniffed = sniffImageKind(head);
    if (sniffed) return sniffed;
  } catch {
    /* fall through to the name */
  }
  return kindFromNameOrType(file.name, file.type);
}

export const needsDecode = (kind: ImageKind | null): boolean =>
  kind !== null && NEEDS_DECODE.includes(kind);

/**
 * Does this stored URL point at something an `<img>` can draw? Used by the chat,
 * which decides between rendering an attachment and linking to it.
 *
 * `.svg` is deliberately absent: the server's magic-byte check has never stored
 * one, and an SVG is a script-bearing document — rendering one inline in a
 * medical app is an XSS surface, not a format gap. Do not add it.
 */
export function imageUrlIsRenderable(url: string): boolean {
  return /\.(jpe?g|jpe|jfif|png|gif|bmp|dib|webp|avif)(\?|#|$)/i.test(url);
}
