"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import NewBuildBanner from "@/components/common/NewBuildBanner";

// One retry, and only for failures a retry can fix: a network drop or a 5xx.
// A 4xx is an answer (validation, permission, not found) and repeating the
// same request just repeats it; 429 is the exception — the server asked us to
// wait, and apiFetch has already waited once when Retry-After was short.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  const status = error instanceof ApiError ? error.status : 0;
  if (status >= 400 && status < 500 && status !== 429) return false;
  return true;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: shouldRetry,
            // Honour Retry-After when the server gave one; otherwise the
            // usual short backoff.
            retryDelay: (attempt, error) => {
              const wait = error instanceof ApiError ? error.retryAfterSec : null;
              return wait !== null ? wait * 1000 : Math.min(1000 * 2 ** attempt, 15_000);
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <NewBuildBanner />
      </AuthProvider>
    </QueryClientProvider>
  );
}
