// Work that must reach the server while the session still exists. `logout()`
// (AuthContext) runs every job registered here BEFORE it asks the server to end
// the session: Revision Notes typed and not yet saved, sent after it, were
// answered 401 and existed only in that tab's memory (second review, 18/10/2026).
// A job that fails does not stop the logout, and none is waited for longer
// than `timeoutMs` — a dead connection must not keep a doctor signed in.

type Job = () => Promise<unknown>;
const jobs = new Set<Job>();

/** Registers `job`; returns the function that takes it off again. */
export function onBeforeLogout(job: Job): () => void {
  jobs.add(job);
  return () => { jobs.delete(job); };
}

export async function runBeforeLogout(timeoutMs = 5000): Promise<void> {
  if (!jobs.size) return;
  const all = Promise.allSettled(Array.from(jobs).map((j) => Promise.resolve().then(j)));
  await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
}
