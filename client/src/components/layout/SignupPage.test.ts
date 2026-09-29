// PHI: an abandoned signup used to leave the NID number, mobile, email and the
// NID/certificate image URLs in localStorage with no expiry, and the password
// in sessionStorage in plain text. These pin where each draft field may live.

import { describe, expect, it, vi } from "vitest";

// SignupPage imports app modules that need a browser/router; only the pure
// draft helpers are under test here.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ register: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ ApiError: class extends Error {}, authApi: {}, uploadImage: vi.fn() }));
vi.mock("@/lib/ocr", () => ({ verifyNidNumber: vi.fn() }));

import {
  SIGNUP_LOCAL_FIELDS, SIGNUP_SESSION_FIELDS, readSignupDraft, splitSignupDraft,
} from "./SignupPage";

const FULL = {
  name: "Dr A", email: "a@example.com", mobile: "01700000000", profession: "doctor",
  registrationNo: "A-123", nidNo: "1234567890", designation: "MO", specialty: "Medicine",
  registrationCertUrl: "https://x/cert.jpg", nidFrontUrl: "https://x/nf.jpg",
  nidBackUrl: "https://x/nb.jpg", profilePictureUrl: "https://x/pp.jpg",
  password: "Secret#123", retype: "Secret#123",
};

describe("signup draft storage", () => {
  it("keeps NID, contact details and every document URL out of localStorage", () => {
    const { local } = splitSignupDraft(FULL);
    for (const k of ["nidNo", "mobile", "email", "registrationCertUrl", "nidFrontUrl", "nidBackUrl", "profilePictureUrl"]) {
      expect(local).not.toHaveProperty(k);
    }
    const blob = JSON.stringify(local);
    expect(blob).not.toContain("1234567890");
    expect(blob).not.toContain("01700000000");
  });

  it("never stores the password in either store", () => {
    const { local, session } = splitSignupDraft(FULL);
    const blob = JSON.stringify(local) + JSON.stringify(session);
    expect(blob).not.toContain("Secret#123");
    expect([...SIGNUP_LOCAL_FIELDS, ...SIGNUP_SESSION_FIELDS]).not.toContain("password");
    expect([...SIGNUP_LOCAL_FIELDS, ...SIGNUP_SESSION_FIELDS]).not.toContain("retype");
  });

  it("round-trips the draft through the two stores", () => {
    const { local, session } = splitSignupDraft(FULL);
    const back = readSignupDraft(JSON.stringify(local), JSON.stringify(session));
    const { password: _p, retype: _r, ...rest } = FULL;
    expect(back).toEqual(rest);
  });

  it("ignores identity fields left in localStorage by an older draft", () => {
    const legacyLocal = JSON.stringify(FULL);
    const back = readSignupDraft(legacyLocal, null);
    expect(back.name).toBe("Dr A");
    expect(back).not.toHaveProperty("nidNo");
    expect(back).not.toHaveProperty("nidFrontUrl");
    expect(back).not.toHaveProperty("password");
  });

  it("survives corrupt or missing storage", () => {
    expect(readSignupDraft("{not json", null)).toEqual({});
    expect(readSignupDraft(null, null)).toEqual({});
  });
});
