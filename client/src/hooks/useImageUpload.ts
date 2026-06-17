import { useState } from "react";
import { ApiError, uploadImage } from "@/lib/api";

// Shared file-input → upload handler for the image pickers across the app
// (profile photo, document scans, certificate slots, patient picture, signup).
// Returns the in-flight `busy` flag and an `onPick` change-handler that uploads
// the selected file, calls `onChange` with the hosted URL, and surfaces failures
// through `onError`. The input is reset afterwards so the same file can be
// re-picked (e.g. to retry after an error).
export function useImageUpload(
  onChange: (url: string) => void,
  onError: (msg: string) => void,
) {
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    onError("");
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return { busy, onPick };
}
