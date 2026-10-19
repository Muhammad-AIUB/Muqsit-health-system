import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { CHECK_CONNECTION, SERVER_COULD_NOT_SAVE, SERVER_REFUSED_AS_WRITTEN, SIGN_IN_AGAIN, STILL_HERE, historyNotUpdated, notSavedBody, whyNotSaved } from "./saveNotice";

// ⚕️ What a doctor is told when Save & print or "Save to complete later" did
// NOT reach the record. Two of these sentences used to end "Is the API
// running?" — a question a doctor cannot answer and a server they cannot start
// (root CLAUDE.md, the `LoadError` rule). The rest showed the server's text,
// which is the framework's words more often than a person's.

describe("whyNotSaved", () => {
  it("no answer at all is the connection", () => {
    expect(whyNotSaved(new TypeError("Failed to fetch"))).toBe(CHECK_CONNECTION);
    // An answer that was not JSON — a hospital Wi-Fi's sign-in page in its place.
    expect(whyNotSaved(new SyntaxError("Unexpected token '<'"))).toBe(CHECK_CONNECTION);
    expect(CHECK_CONNECTION).toBe("Check your internet connection and try again.");
  });

  it("a refusal (403) is worded by the server for a person, and is shown as written — as a sentence", () => {
    expect(whyNotSaved(new ApiError(403, "You do not have permission to save prescriptions")))
      .toBe("You do not have permission to save prescriptions.");
    expect(whyNotSaved(new ApiError(403, "You do not have access to this workstation.")))
      .toBe("You do not have access to this workstation.");
  });

  it("a 403 with nothing of the server's own to say falls back to the server's failure", () => {
    expect(whyNotSaved(new ApiError(403, "  "))).toBe(SERVER_COULD_NOT_SAVE);
    // A proxy's or a firewall's page, not JSON: apiFetch's own stand-in, not a sentence for a doctor.
    expect(whyNotSaved(new ApiError(403, "Request failed (403)"))).toBe(SERVER_COULD_NOT_SAVE);
  });

  // apiFetch has already tried to renew the session once. When the renewal is
  // refused the app goes to the sign-in page and the editor with it, so the box
  // must not say "everything you wrote is still here" over the sign-in page.
  it("a 401 says the sign-in could not be renewed, and promises nothing about the editor", () => {
    expect(whyNotSaved(new ApiError(401, "Unauthorized"))).toBe(SIGN_IN_AGAIN);
    expect(notSavedBody(new ApiError(401, "Unauthorized"))).toBe(SIGN_IN_AGAIN);
    expect(SIGN_IN_AGAIN).not.toContain(STILL_HERE);
  });

  it("every other failure ends by saying nothing was lost", () => {
    expect(notSavedBody(new TypeError("Failed to fetch"))).toBe(`${CHECK_CONNECTION} ${STILL_HERE}`);
    expect(notSavedBody(new ApiError(500, "Internal server error"))).toBe(`${SERVER_COULD_NOT_SAVE} ${STILL_HERE}`);
    expect(STILL_HERE).toBe("Everything you wrote is still here.");
  });

  it("what was sent and refused (400, 413) is said as that — trying again would not help", () => {
    expect(whyNotSaved(new ApiError(400, "note.each value must be shorter than or equal to 2000 characters"))).toBe(SERVER_REFUSED_AS_WRITTEN);
    expect(whyNotSaved(new ApiError(413, "request entity too large"))).toBe(SERVER_REFUSED_AS_WRITTEN);
  });

  it("the framework's words are never shown", () => {
    for (const [status, text] of [
      [500, "Internal server error"],
      [429, "ThrottlerException: Too Many Requests"],
      [502, "Request failed (502)"],
      [404, "Cannot POST /api/prescriptions"],
    ] as const) {
      expect(whyNotSaved(new ApiError(status, text)), `${status}`).toBe(SERVER_COULD_NOT_SAVE);
    }
  });

  it("no sentence names the API, or asks the doctor to start anything", () => {
    for (const s of [CHECK_CONNECTION, SERVER_COULD_NOT_SAVE, SERVER_REFUSED_AS_WRITTEN, SIGN_IN_AGAIN, STILL_HERE]) {
      expect(s).not.toMatch(/\bAPI\b|running/i);
    }
  });
});

// ⚕️ The prescription is saved; part of the patient's record was not brought
// up to date with it. The box names only what failed — it said all three
// histories when one PATCH of three had failed.
describe("historyNotUpdated", () => {
  const TITLE = "Prescription saved, but the patient's history could not be updated.";
  const SAVED = "The prescription itself is saved, with everything written on it.";

  it("names the one history that was not updated", () => {
    expect(historyNotUpdated(["investigation history"])).toEqual({
      title: TITLE,
      body: `The investigation history kept in the patient's record was not updated. ${SAVED}`,
      tone: "danger",
    });
  });

  it("names two, and three, as a list", () => {
    expect(historyNotUpdated(["examination history", "drug history"]).body)
      .toBe(`The examination history and drug history kept in the patient's record were not updated. ${SAVED}`);
    expect(historyNotUpdated(["investigation history", "examination history", "drug history"]).body)
      .toBe(`The investigation history, examination history and drug history kept in the patient's record were not updated. ${SAVED}`);
  });

  it("when it cannot be known what was written, says so rather than naming any", () => {
    expect(historyNotUpdated(null).body)
      .toBe(`The patient's record may not have been brought up to date with this visit. ${SAVED}`);
  });
});
