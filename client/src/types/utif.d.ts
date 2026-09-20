// `utif` (3.1.0) ships no type declarations, and there is no @types package.
//
// This declares ONLY the three functions `lib/decodeImage.ts` calls, with the
// shapes it actually relies on — deliberately narrow rather than `declare
// module "utif"` (which would make the whole module `any` and let a typo in a
// field name through silently). A TIFF here is a scanned medical report; the
// width/height this describes decide the pixels a doctor reads a dose off.
declare module 'utif' {
  /** One image file directory — a single page of the TIFF. */
  interface IFD {
    width: number;
    height: number;
    [key: string]: unknown;
  }

  /** Parse the container. One IFD per page; a scan is often multi-page. */
  export function decode(buffer: ArrayBuffer | Uint8Array): IFD[];

  /** Decompress one page's pixel data into the IFD, in place. */
  export function decodeImage(buffer: ArrayBuffer | Uint8Array, ifd: IFD): void;

  /** The decoded page as RGBA bytes, 4 per pixel, row-major. */
  export function toRGBA8(ifd: IFD): Uint8Array;

  const UTIF: {
    decode: typeof decode;
    decodeImage: typeof decodeImage;
    toRGBA8: typeof toRGBA8;
  };
  export default UTIF;
}
