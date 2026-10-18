// Work that must reach the server while the session still exists — Revision
// Notes typed and not yet saved (second review, 18/10/2026): sent after the
// server's logout it is answered 401 and lost.

import { afterEach, describe, expect, it, vi } from "vitest";
import { onBeforeLogout, runBeforeLogout } from "./beforeLogout";

const offs: (() => void)[] = [];
afterEach(() => { offs.splice(0).forEach((f) => f()); vi.useRealTimers(); });

describe("runBeforeLogout", () => {
  it("waits for every job", async () => {
    const done: string[] = [];
    offs.push(onBeforeLogout(async () => { await Promise.resolve(); done.push("a"); }));
    offs.push(onBeforeLogout(async () => { done.push("b"); }));
    await runBeforeLogout();
    expect(done.sort()).toEqual(["a", "b"]);
  });

  it("a job that fails does not stop the logout", async () => {
    offs.push(onBeforeLogout(async () => { throw new Error("offline"); }));
    await expect(runBeforeLogout()).resolves.toBeUndefined();
  });

  it("a job that hangs is waited for only so long", async () => {
    vi.useFakeTimers();
    offs.push(onBeforeLogout(() => new Promise(() => {})));
    const p = runBeforeLogout(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(p).resolves.toBeUndefined();
  });

  it("a job taken off is not run", async () => {
    const job = vi.fn(async () => {});
    onBeforeLogout(job)();
    await runBeforeLogout();
    expect(job).not.toHaveBeenCalled();
  });
});
