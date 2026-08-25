import type { IpdClinical } from "./api";

// ⚕️ The IPD clinical sheet is written WHOLESALE.
//
// `IpdDetailView` sends the entire `clinical` object on every save and
// `ipd.service.ts#update` writes it verbatim (`data = { ...dto }`). There is no
// per-field patch and no version check, so a key this build does not know about
// is not merely ignored — it is destroyed the next time anyone presses Save.
//
// That has already been a live risk twice over:
//   • a new key added by a later build, saved by an older tab still open on a
//     ward PC, and
//   • a rollback of the build that introduced the key, which turns every
//     subsequent save into a silent delete of the data it wrote.
//
// So the payload is never built from the known fields alone. It starts from the
// admission's stored `clinical` and lays this build's fields on top, which makes
// "I don't know about this key" mean "leave it alone" instead of "remove it".
// The server does the same for `analogueSheets` (see `ipd.service.ts`); the two
// layers guard different failure modes and neither replaces the other.
export function mergeIpdClinical(
  prev: IpdClinical | null | undefined,
  fields: IpdClinical,
): IpdClinical {
  // A non-object `prev` (null, or a Json column that came back as a string /
  // array) contributes nothing rather than throwing — this runs on the doctor's
  // save path and must never be the reason a visit fails to record.
  const base =
    prev && typeof prev === "object" && !Array.isArray(prev) ? prev : {};
  return { ...base, ...fields };
}
