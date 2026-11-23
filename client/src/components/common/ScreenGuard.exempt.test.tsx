// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

let email: string | null = null;
vi.mock("@/context/AuthContext", () => ({
  useOptionalAuth: () => (email ? { user: { id: "u1", email, name: "T", role: "doctor" } } : null),
}));

import ScreenGuard, { isScreenGuardExempt } from "./ScreenGuard";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); email = null; });

describe("ScreenGuard — the testing account", () => {
  it("is exempt by email, ignoring case and spaces, and nobody else is", () => {
    expect(isScreenGuardExempt("dr.shahariar.dmc@gmail.com")).toBe(true);
    expect(isScreenGuardExempt("  Dr.Shahariar.DMC@Gmail.com ")).toBe(true);
    expect(isScreenGuardExempt("dr.shahariar.dmc@gmail.com.evil.com")).toBe(false);
    expect(isScreenGuardExempt("someone@else.com")).toBe(false);
    expect(isScreenGuardExempt(null)).toBe(false);
    expect(isScreenGuardExempt("")).toBe(false);
  });

  it("in production the testing account gets no watermark and no cover on blur", () => {
    vi.stubEnv("NODE_ENV", "production");
    email = "dr.shahariar.dmc@gmail.com";
    const { container } = render(<ScreenGuard />);
    act(() => { window.dispatchEvent(new Event("blur")); });
    expect(container.innerHTML).toBe("");
  });

  it("in production any other signed-in doctor is still guarded", () => {
    vi.stubEnv("NODE_ENV", "production");
    email = "doctor@example.com";
    const { container } = render(<ScreenGuard />);
    act(() => { window.dispatchEvent(new Event("blur")); });
    expect(container.querySelector("[data-screen-guard='watermark']")).not.toBeNull();
    expect(container.querySelector("[data-screen-guard='cover']")).not.toBeNull();
  });
});
