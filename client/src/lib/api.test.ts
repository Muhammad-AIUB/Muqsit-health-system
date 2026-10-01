import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  authApi,
  medicinesApi,
  onAuthFailure,
  patientsApi,
  setActiveWorkstationId,
} from "./api";
import { installApiStub, type ApiStub } from "@/test/apiStub";
import { makePatient } from "@/test/fixtures";

// `apiFetch` is the one door every request leaves through (client/CLAUDE.md:
// "all HTTP through src/lib/api.ts (apiFetch: credentials, X-Workstation header,
// silent 401 refresh)"). Three things about it are safety, not plumbing:
//   • X-Workstation decides WHOSE practice a request acts on (root CLAUDE.md,
//     "Scoping is a safety boundary");
//   • a silent refresh must not double-send, loop, or log a doctor out because
//     the dev server blinked;
//   • a server refusal must reach the doctor as the server's own sentence.

let api: ApiStub;
beforeEach(() => {
  api = installApiStub();
  setActiveWorkstationId(null);
});
afterEach(async () => {
  setActiveWorkstationId(null);
  // `attemptRefresh` releases its in-flight promise on a 0 ms timer; let it.
  await new Promise((r) => setTimeout(r, 0));
  api.restore();
});

describe("apiFetch — every request", () => {
  it("sends the session cookie and JSON, to the API root", async () => {
    api.on("GET", "/patients/p1", { json: makePatient({ id: "p1" }) });
    const p = await patientsApi.get("p1");
    expect(p.id).toBe("p1");
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].credentials).toBe("include");
    expect(api.calls[0].headers["Content-Type"]).toBe("application/json");
    expect(api.calls[0].url).toMatch(/\/api\/patients\/p1$/);
  });

  it("returns undefined for 204 No Content instead of failing to parse a body", async () => {
    api.on("POST", "/auth/logout", { status: 204 });
    await expect(authApi.logout()).resolves.toBeUndefined();
  });

  it("sends a body as JSON", async () => {
    api.on("PATCH", "/patients/p1", { json: makePatient({ id: "p1" }) });
    await patientsApi.update("p1", { drugHistory: ["07/09/2026: Tablet. Napa 500 mg — 1+1+1 — food — 5 days"] });
    expect(api.calls[0].body).toEqual({ drugHistory: ["07/09/2026: Tablet. Napa 500 mg — 1+1+1 — food — 5 days"] });
  });

  it("percent-encodes what is typed into a query", async () => {
    api.on("GET", "/medicines/search?q=napa%20%26%20co%2F500", { json: [] });
    await medicinesApi.search("napa & co/500");
  });
});

describe("apiFetch — ⚕️ X-Workstation scopes the request to a practice", () => {
  it("sends no header on the user's own account", async () => {
    api.on("GET", "/patients", { json: [] });
    await patientsApi.list();
    expect(api.calls[0].headers).not.toHaveProperty("X-Workstation");
  });

  it("sends the active workstation on every request while one is set", async () => {
    setActiveWorkstationId("doctor-B");
    api.on("GET", "/patients", { json: [] }).on("PATCH", "/patients/p1", { json: makePatient() }).on("DELETE", "/patients/p1", { json: { id: "p1" } });
    await patientsApi.list();
    await patientsApi.update("p1", { tags: [] });
    await patientsApi.remove("p1");
    expect(api.calls.map((c) => c.headers["X-Workstation"])).toEqual(["doctor-B", "doctor-B", "doctor-B"]);
  });

  it("stops sending it the moment the workstation is cleared — the next doctor never inherits it", async () => {
    setActiveWorkstationId("doctor-B");
    api.on("GET", "/patients", { json: [] }).on("GET", "/patients", { json: [] });
    await patientsApi.list();
    setActiveWorkstationId(null);
    await patientsApi.list();
    expect(api.calls[0].headers["X-Workstation"]).toBe("doctor-B");
    expect(api.calls[1].headers).not.toHaveProperty("X-Workstation");
  });

  it("the retry after a silent refresh carries the same workstation", async () => {
    setActiveWorkstationId("doctor-B");
    api.on("GET", "/patients", { status: 401 }).on("POST", "/auth/refresh", { status: 200 }).on("GET", "/patients", { json: [] });
    await patientsApi.list();
    expect(api.callsTo("GET", "/patients").map((c) => c.headers["X-Workstation"])).toEqual(["doctor-B", "doctor-B"]);
  });
});

describe("apiFetch — silent 401 refresh", () => {
  it("refreshes once and retries the original request", async () => {
    api.on("GET", "/patients/p1", { status: 401, json: { message: "Unauthorized" } })
      .on("POST", "/auth/refresh", { status: 200 })
      .on("GET", "/patients/p1", { json: makePatient({ id: "p1" }) });
    const p = await patientsApi.get("p1");
    expect(p.id).toBe("p1");
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /patients/p1", "POST /auth/refresh", "GET /patients/p1"]);
    expect(api.calls[1].credentials).toBe("include");
  });

  it("retries a write exactly once, with the same body — never a third time", async () => {
    api.on("PATCH", "/patients/p1", { status: 401 }).on("POST", "/auth/refresh", { status: 200 }).on("PATCH", "/patients/p1", { status: 401, json: { message: "Unauthorized" } });
    await expect(patientsApi.update("p1", { tags: ["x"] })).rejects.toMatchObject({ status: 401 });
    expect(api.callsTo("PATCH", "/patients/p1")).toHaveLength(2);
    expect(api.callsTo("PATCH", "/patients/p1").map((c) => c.body)).toEqual([{ tags: ["x"] }, { tags: ["x"] }]);
    expect(api.callsTo("POST", "/auth/refresh")).toHaveLength(1);
  });

  it("a refused refresh is a real session loss: listeners are told, and the request fails as 401", async () => {
    const lost = vi.fn();
    const off = onAuthFailure(lost);
    api.on("GET", "/patients", { status: 401, json: { message: "Unauthorized" } }).on("POST", "/auth/refresh", { status: 401 });
    const err = await patientsApi.list().catch((e) => e);
    off();
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(api.callsTo("GET", "/patients")).toHaveLength(1); // no retry
  });

  it("an unreachable server is NOT a session loss: nobody is logged out", async () => {
    const lost = vi.fn();
    const off = onAuthFailure(lost);
    api.on("GET", "/patients", { status: 401 }).on("POST", "/auth/refresh", { networkError: "Failed to fetch" });
    await expect(patientsApi.list()).rejects.toMatchObject({ status: 401 });
    off();
    expect(lost).not.toHaveBeenCalled();
  });

  it("a burst of 401s shares ONE refresh call (each refresh rotates the token)", async () => {
    api.on("GET", "/patients", { status: 401 }).on("GET", "/patients/watched", { status: 401 })
      .on("POST", "/auth/refresh", { status: 200 })
      .on("GET", "/patients", { json: [] }).on("GET", "/patients/watched", { json: [] });
    await Promise.all([patientsApi.list(), patientsApi.watched()]);
    expect(api.callsTo("POST", "/auth/refresh")).toHaveLength(1);
  });

  it("never tries to refresh for a failed sign-in — the 401 there means wrong credentials", async () => {
    const lost = vi.fn();
    const off = onAuthFailure(lost);
    api.on("POST", "/auth/login", { status: 401, json: { message: "Invalid credentials" } });
    const err = await authApi.login("someone@example.test", "not-the-password", false).catch((e) => e);
    off();
    expect(err.message).toBe("Invalid credentials");
    expect(api.calls).toHaveLength(1);
    expect(lost).not.toHaveBeenCalled();
  });

  it("an expired cookie on /auth/me DOES refresh, so a reload keeps the session", async () => {
    api.on("GET", "/auth/me", { status: 401 }).on("POST", "/auth/refresh", { status: 200 })
      .on("GET", "/auth/me", { json: { id: "u1", email: "d@example.test", name: "Dr Test", role: "doctor" } });
    await expect(authApi.me()).resolves.toMatchObject({ id: "u1" });
  });

  it("an unsubscribed listener is not called", async () => {
    const lost = vi.fn();
    onAuthFailure(lost)();
    api.on("GET", "/patients", { status: 401 }).on("POST", "/auth/refresh", { status: 401 });
    await patientsApi.list().catch(() => {});
    expect(lost).not.toHaveBeenCalled();
  });
});

describe("apiFetch — a refusal reaches the doctor in the server's words", () => {
  it("uses the server's message", async () => {
    api.on("POST", "/patients", { status: 400, json: { message: "Date of birth cannot be in the future" } });
    const err = await patientsApi.create({ name: "Patient" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(400);
    expect(err.message).toBe("Date of birth cannot be in the future");
  });

  it("joins a list of validation messages into one line", async () => {
    api.on("POST", "/patients", { status: 400, json: { message: ["name should not be empty", "dob must be a valid ISO 8601 date string"] } });
    await expect(patientsApi.create({ name: "" })).rejects.toThrow("name should not be empty, dob must be a valid ISO 8601 date string");
  });

  it("falls back to the status when the error body is not JSON or carries no message", async () => {
    api.on("GET", "/patients", { status: 502 }).on("GET", "/patients", { status: 500, json: {} });
    await expect(patientsApi.list()).rejects.toThrow("Request failed (502)");
    await expect(patientsApi.list()).rejects.toThrow("Request failed (500)");
  });

  it("does not refresh or log anyone out for a 403 / 404 / 409", async () => {
    const lost = vi.fn();
    const off = onAuthFailure(lost);
    for (const status of [403, 404, 409]) {
      api.on("GET", "/patients/p1", { status, json: { message: `refused ${status}` } });
      await expect(patientsApi.get("p1")).rejects.toMatchObject({ status, message: `refused ${status}` });
    }
    off();
    expect(api.callsTo("POST", "/auth/refresh")).toHaveLength(0);
    expect(lost).not.toHaveBeenCalled();
  });
});

describe("apiStub — the double itself fails loudly", () => {
  it("rejects a request nobody queued, and restore() reports it even if the caller swallowed it", async () => {
    const local = installApiStub();
    await patientsApi.get("nobody-asked").catch(() => {});
    expect(local.unexpected).toEqual(["apiStub: unexpected request GET /patients/nobody-asked"]);
    expect(() => local.restore()).toThrow(/unexpected request GET \/patients\/nobody-asked/);
    // (restore() has put the outer stub back, as it found it.)
  });

  it("reports a queued response that was never requested", () => {
    const local = installApiStub();
    local.on("GET", "/patients", { json: [] });
    expect(() => local.restore()).toThrow(/never requested: GET \/patients ×1/);
  });

  it("serves queued responses for one route in order, once each", async () => {
    api.on("GET", "/patients", { json: [makePatient({ id: "first" })] }).on("GET", "/patients", { json: [] });
    expect((await patientsApi.list()).map((p) => p.id)).toEqual(["first"]);
    expect(await patientsApi.list()).toEqual([]);
  });
});
