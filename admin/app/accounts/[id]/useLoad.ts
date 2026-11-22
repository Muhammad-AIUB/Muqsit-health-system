"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

// One read of the server, keyed. The key is what the answer is ABOUT (a doctor, a
// chamber, a month): when it changes the old answer is dropped at once, so the
// screen says "Loading numbers…" instead of showing last month's bars under this
// month's name (the doctor app's Statistics rule, `docs/rules/statistics.md`), and
// an answer that arrives for a key that is no longer wanted is thrown away.
//
// `read` turns the raw answer into what is drawn and throws on anything that is
// not the numbers (`lib/statistics.ts#read…`) — an empty body or a sign-in page
// is an error with Try again, never "nobody came".
export function useLoad<T>(read: () => Promise<T>, key: string, failure: string) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key });
  const [again, setAgain] = useState(0);
  const latest = useRef(read);
  latest.current = read;

  useEffect(() => {
    let wanted = true;
    setState({ key });
    latest.current().then(
      (data) => { if (wanted) setState({ key, data }); },
      (e) => { if (wanted) setState({ key, error: e instanceof ApiError ? e.message : failure }); },
    );
    return () => { wanted = false; };
  }, [key, again, failure]);

  // A render between the key changing and the effect running must not show the
  // previous key's answer.
  const current = state.key === key ? state : { key };
  return {
    data: current.data,
    error: current.error,
    loading: current.data === undefined && current.error === undefined,
    retry: () => setAgain((n) => n + 1),
  };
}
