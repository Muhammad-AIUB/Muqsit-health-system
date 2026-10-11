"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import DialogHost from "@/components/common/DialogHost";
import { installCaptionFocus } from "@/lib/captionFocus";

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  // Pressing a caption puts the cursor in the box it names — one rule for every
  // form, instead of an id on every box (lib/captionFocus.ts).
  useEffect(() => installCaptionFocus(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      {/* The app's own "are you sure?" and "this did not work" (lib/dialogs.ts).
          Last, so it is the popup on top of every other. */}
      <DialogHost />
    </QueryClientProvider>
  );
}
