// A small `fetch` double for tests that go through `lib/api.ts`.
//
//   const api = installApiStub();          // in beforeEach
//   api.on("GET", "/patients/p1", { json: makePatient() });
//   api.on("POST", "/auth/refresh", { status: 200 });
//   …exercise the code…
//   expect(api.calls).toHaveLength(2);
//   api.restore();                         // in afterEach (asserts nothing was unexpected)
//
// Three rules, all so a test cannot pass by accident:
//  • Responses are QUEUED per `METHOD path` and each is served exactly once, in
//    order — a second request to the same route needs a second `on()`.
//  • An UNEXPECTED request fails loudly: the fetch promise rejects with a
//    message naming the request, it is recorded in `unexpected`, and
//    `restore()` / `assertDone()` throw even if the code under test swallowed
//    the rejection (much of the app resolves a failed lookup to `[]`).
//  • Every call is recorded with its method, path, headers, credentials mode
//    and parsed JSON body, so scoping headers can be asserted, not assumed.
//
// No network, no timers, no module mocking — it replaces `globalThis.fetch`
// and puts the original back.

export interface StubResponse {
  /** HTTP status. Default 200. */
  status?: number;
  /** JSON body. Omitted ⇒ an empty body (and `res.json()` rejects, as a real
   *  empty response does). */
  json?: unknown;
  /** Reject the fetch itself — a network failure, not an HTTP error. */
  networkError?: string;
  /** Hold the response until this promise settles — for "the save landed after
   *  the doctor had moved on" tests. See `deferred()`. */
  after?: Promise<unknown>;
}

/** A promise the test resolves by hand: `const gate = deferred(); … gate.release()`. */
export function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((r) => { release = r; });
  return { promise, release };
}

export interface RecordedCall {
  method: string;
  /** Path relative to the API root, query string included. */
  path: string;
  url: string;
  headers: Record<string, string>;
  credentials: RequestCredentials | undefined;
  /** Parsed JSON body, the raw string when it is not JSON, else undefined. */
  body: unknown;
}

export interface ApiStub {
  on(method: string, path: string, response?: StubResponse): ApiStub;
  calls: RecordedCall[];
  unexpected: string[];
  /** Calls made to one route. */
  callsTo(method: string, path: string): RecordedCall[];
  /** Throws if any request was unexpected or any queued response went unused. */
  assertDone(): void;
  /** Put the real `fetch` back, then `assertDone()` unless `{ check: false }`. */
  restore(opts?: { check?: boolean }): void;
}

const key = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

function headersToRecord(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (typeof Headers !== "undefined" && h instanceof Headers) {
    h.forEach((v, k) => { out[k] = v; });
  } else if (Array.isArray(h)) {
    for (const [k, v] of h) out[k] = v;
  } else {
    Object.assign(out, h as Record<string, string>);
  }
  return out;
}

function parseBody(body: unknown): unknown {
  if (typeof body !== "string") return body ?? undefined;
  try { return JSON.parse(body); } catch { return body; }
}

/**
 * Replace `globalThis.fetch`. `apiRoot` is stripped from each URL to give the
 * recorded `path`; it defaults to whatever precedes `/api` so tests do not have
 * to know `NEXT_PUBLIC_API_URL`.
 */
export function installApiStub(apiRoot?: string): ApiStub {
  const original = globalThis.fetch;
  const queues = new Map<string, StubResponse[]>();
  const calls: RecordedCall[] = [];
  const unexpected: string[] = [];

  const toPath = (url: string): string => {
    if (apiRoot && url.startsWith(apiRoot)) return url.slice(apiRoot.length);
    const i = url.indexOf("/api/");
    return i >= 0 ? url.slice(i + 4) : url;
  };

  const fake = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init.method ?? "GET").toUpperCase();
    const path = toPath(url);
    calls.push({
      method, path, url,
      headers: headersToRecord(init.headers),
      credentials: init.credentials,
      body: parseBody(init.body),
    });

    const next = queues.get(key(method, path))?.shift();
    if (!next) {
      const msg = `apiStub: unexpected request ${key(method, path)}`;
      unexpected.push(msg);
      throw new Error(msg);
    }
    if (next.after) await next.after.catch(() => {});
    if (next.networkError) throw new TypeError(next.networkError);

    const status = next.status ?? 200;
    const hasBody = next.json !== undefined;
    // A hand-rolled Response: the `Response` constructor refuses a body on 204
    // and is not present in every test environment.
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (!hasBody) throw new SyntaxError("Unexpected end of JSON input");
        return next.json;
      },
      text: async () => (hasBody ? JSON.stringify(next.json) : ""),
    } as unknown as Response;
  };

  const stub: ApiStub = {
    calls,
    unexpected,
    on(method, path, response = {}) {
      const k = key(method, path);
      queues.set(k, [...(queues.get(k) ?? []), response]);
      return stub;
    },
    callsTo: (method, path) => calls.filter((c) => c.method === method.toUpperCase() && c.path === path),
    assertDone() {
      if (unexpected.length) throw new Error(unexpected.join("\n"));
      const unused = [...queues.entries()].filter(([, q]) => q.length > 0).map(([k, q]) => `${k} ×${q.length}`);
      if (unused.length) throw new Error(`apiStub: queued responses never requested: ${unused.join(", ")}`);
    },
    restore(opts = {}) {
      globalThis.fetch = original;
      if (opts.check !== false) stub.assertDone();
    },
  };

  globalThis.fetch = fake as typeof fetch;
  return stub;
}
