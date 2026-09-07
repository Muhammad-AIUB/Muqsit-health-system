// ── Small copies for the patient's two document galleries ───────────────────
//
// `Patient.imageThumbs` is a side map, `{ [fullImageUrl]: thumbUrl }`, kept
// beside `prescriptionImages` / `reportImages` rather than folded into them.
// Those arrays ARE the record — their order is the order the doctor put them
// in, and the print, snapshot and mirror paths all read them as plain URL
// strings — so they were left exactly as they are. A gallery URL absent from
// this map simply falls back to the full image, which is how every image
// stored before the map existed reads.
//
// It is a `Json` column, so it arrives from the server as `unknown` and this
// file is where that stops. Nothing clinical is decided here — a wrong entry
// costs a blurry tile, never a wrong document — but the reader still has to be
// total: this map is read inside the patient records screen, and React unmounts
// the whole tree on an uncaught render error.

export type ThumbMap = Record<string, string>;

// 400px on the long side. Small enough that a records page carrying dozens of
// images is a fraction of the download it was, large enough that the ward's
// paper order sheet still renders a readable 270×370 tile from real pixels
// (see AnalogueSheetPanel). `lib/ipdAnalogue.ts` re-exports this — one number,
// so the two callers cannot drift apart.
export const THUMB_MAX_DIM = 400;

/** Upload options for a gallery thumbnail. */
export const THUMB_UPLOAD = { maxDim: THUMB_MAX_DIM, quality: 0.8 } as const;

/** Read the stored map, keeping only usable pairs and dropping anything else. */
export function safeThumbMap(value: unknown): ThumbMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ThumbMap = {};
  for (const [url, thumb] of Object.entries(value as Record<string, unknown>)) {
    if (typeof url === "string" && url && typeof thumb === "string" && thumb) {
      out[url] = thumb;
    }
  }
  return out;
}

/**
 * Fold newly uploaded pairs into the stored map.
 *
 * ⚕️ Additive on purpose. Orphaned keys — an image the doctor removed from the
 * gallery — are left alone rather than swept up: purging would mean deciding
 * from a display map which of a patient's images no longer exist, and the cost
 * of being wrong (a thumbnail pointing at nothing) is not worth the tidiness.
 * An entry whose image is gone is simply never looked up again.
 */
export function mergeThumbs(stored: unknown, added: ThumbMap): ThumbMap {
  return { ...safeThumbMap(stored), ...safeThumbMap(added) };
}

/** The image to draw in a tile: the small copy when there is one. */
export function thumbFor(map: ThumbMap, url: string): string | undefined {
  return map[url];
}
