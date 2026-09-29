// ── Decoding the formats the browser cannot draw ───────────────────────────
//
// HEIC (every iPhone's default) and TIFF (what most document scanners produce)
// are refused by Chrome and Firefox. `createImageBitmap` throws on both, which
// is why `compressImage` used to hand the ORIGINAL file back — and the upload
// then filed bytes into a patient's record that no desktop browser could ever
// draw. The tile showed "Did not load" and nothing said why.
//
// ⚕️ So they are converted to JPEG HERE, before the upload, and a conversion
// that fails THROWS rather than falling back to the original. That asymmetry is
// the whole point: for a format the browser can read, falling back to the
// original is safe (it still renders); for one it cannot, the fallback is an
// unviewable document in a medical record. A named error the doctor sees now
// beats a blank tile someone finds in a year.
//
// Both decoders are loaded with a dynamic `import()`, so a doctor uploading an
// ordinary JPEG never downloads a byte of either.

import type { ImageKind } from './imageFormats';

export class ImageDecodeError extends Error {
  constructor(
    readonly kind: ImageKind,
    readonly fileName: string,
    message: string,
  ) {
    super(message);
    this.name = 'ImageDecodeError';
  }
}

/** A doctor-facing sentence. `apiFetch` joins these into the save banner. */
const failure = (kind: ImageKind, name: string) =>
  kind === 'heic'
    ? `"${name}" is an iPhone HEIC photo that could not be converted. Re-send it as JPEG ` +
      `(on iPhone: Settings → Camera → Formats → Most Compatible), or take a screenshot of it.`
    : `"${name}" is a TIFF scan that could not be converted. Save or export it as JPEG or PNG and try again.`;

/**
 * Turn a HEIC or TIFF file into a JPEG Blob the rest of the pipeline can treat
 * like any other image. Throws `ImageDecodeError` if it cannot.
 */
export async function decodeToJpeg(file: File, kind: ImageKind, quality = 0.9): Promise<Blob> {
  try {
    if (kind === 'heic') return await heicToJpeg(file, quality);
    if (kind === 'tiff') return await tiffToJpeg(file, quality);
  } catch (e) {
    // A refusal that already names its reason (a multi-page TIFF) keeps it.
    if (e instanceof ImageDecodeError) throw e;
    throw new ImageDecodeError(kind, file.name, failure(kind, file.name));
  }
  throw new ImageDecodeError(kind, file.name, failure(kind, file.name));
}

async function heicToJpeg(file: File, quality: number): Promise<Blob> {
  const { default: heic2any } = await import('heic2any');
  const out = (await heic2any({ blob: file, toType: 'image/jpeg', quality })) as Blob | Blob[];
  // A Live Photo / burst is a HEIC SEQUENCE and comes back as an array. The
  // first frame is the photograph the doctor took; the rest are the motion.
  const blob = Array.isArray(out) ? out[0] : out;
  if (!blob || blob.size === 0) throw new Error('heic2any produced nothing');
  return blob;
}

async function tiffToJpeg(file: File, quality: number): Promise<Blob> {
  const UTIF = (await import('utif')).default as typeof import('utif');
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  if (!ifds.length) throw new Error('no image in TIFF');
  // A scanned report is routinely a MULTI-PAGE TIFF, and one upload stores one
  // image. Converting page 1 and dropping pages 2..n of a report would be a
  // silent clinical data loss, so a multi-page file is refused by name.
  const pages = countPages(ifds);
  if (pages > 1) {
    throw new ImageDecodeError(
      'tiff',
      file.name,
      `"${file.name}" is a ${pages}-page TIFF scan. Only one page can be added per image, so nothing was uploaded. ` +
        `Export each page as JPEG or PNG (or scan the pages separately) and add them all.`,
    );
  }
  UTIF.decodeImage(buf, ifds[0]);
  const rgba = UTIF.toRGBA8(ifds[0]);
  const w = ifds[0].width;
  const h = ifds[0].height;
  if (!w || !h) throw new Error('TIFF has no dimensions');

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  // putImageData replaces pixels (no compositing), so a background fill would be
  // ignored — flatten the alpha onto white in the pixel data before encoding.
  ctx.putImageData(new ImageData(flattenOntoWhite(rgba), w, h), 0, 0);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('canvas produced nothing');
  return blob;
}

/**
 * RGBA pixels composited onto an opaque white background. JPEG has no alpha, so
 * a transparent pixel encodes as black — black text on a transparent page came
 * out black-on-black.
 */
export function flattenOntoWhite(rgba: ArrayLike<number>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    out[i] = rgba[i] * a + 255 * (1 - a);
    out[i + 1] = rgba[i + 1] * a + 255 * (1 - a);
    out[i + 2] = rgba[i + 2] * a + 255 * (1 - a);
    out[i + 3] = 255;
  }
  return out;
}

/**
 * How many pages a TIFF holds. Returns 1 for anything it cannot read, so a
 * caller never warns about page loss that is not happening.
 */
export async function tiffPageCount(file: File): Promise<number> {
  try {
    const UTIF = (await import('utif')).default as typeof import('utif');
    return countPages(UTIF.decode(await file.arrayBuffer())) || 1;
  } catch {
    return 1;
  }
}

/**
 * Real pages in a decoded TIFF. A reduced-resolution thumbnail directory
 * (NewSubfileType, tag 254, bit 0 set) is a preview of a page, not a page.
 */
function countPages(ifds: ReadonlyArray<object>): number {
  return ifds.filter((ifd) => {
    const t = (ifd as { t254?: number[] }).t254;
    return !(t && t[0] & 1);
  }).length;
}
