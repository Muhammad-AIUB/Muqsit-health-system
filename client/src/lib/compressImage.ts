// ── Client-side image compression ─────────────────────────────
// Phone photos are 3–8 MB; documents/NID don't need that resolution.
// Shrinking to ≤1600px JPEG before upload makes uploads ~10x faster
// and saves Cloudinary storage. Falls back to the original file if
// anything fails or compression wouldn't help.

export async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<File> {
  // GIFs (animation) and non-images pass through untouched.
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    // Only use the compressed version if it's actually smaller.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
