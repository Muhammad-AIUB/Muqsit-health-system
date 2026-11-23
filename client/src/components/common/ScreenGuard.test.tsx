// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import ScreenGuard, { isCaptureKey } from "./ScreenGuard";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

const key = (o: Partial<KeyboardEvent>) => ({ key: "", code: "", shiftKey: false, metaKey: false, ctrlKey: false, ...o });

describe("ScreenGuard", () => {
  it("renders nothing outside production (dev and the E2E run)", () => {
    vi.stubEnv("NODE_ENV", "development");
    const { container } = render(<ScreenGuard />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing in production when switched off", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SCREEN_GUARD", "off");
    const { container } = render(<ScreenGuard />);
    expect(container.innerHTML).toBe("");
  });

  it("in production shows a watermark, covers on blur and uncovers on focus", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { container } = render(<ScreenGuard />);
    expect(container.querySelector("[data-screen-guard='watermark']")).not.toBeNull();
    expect(container.querySelector("[data-screen-guard='cover']")).toBeNull();
    act(() => { window.dispatchEvent(new Event("blur")); });
    expect(container.querySelector("[data-screen-guard='cover']")).not.toBeNull();
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(container.querySelector("[data-screen-guard='cover']")).toBeNull();
  });

  it("does not cover when focus moves into an iframe (the Save & print sheet)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { container } = render(<><ScreenGuard /><iframe title="p" /></>);
    const frame = container.querySelector("iframe")!;
    frame.focus();
    act(() => { window.dispatchEvent(new Event("blur")); });
    expect(container.querySelector("[data-screen-guard='cover']")).toBeNull();
  });

  it("covers when a capture key is pressed", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { container } = render(<ScreenGuard />);
    act(() => { window.dispatchEvent(new KeyboardEvent("keyup", { key: "PrintScreen", code: "PrintScreen" })); });
    expect(container.querySelector("[data-screen-guard='cover']")).not.toBeNull();
  });
});

describe("isCaptureKey", () => {
  it("recognises the capture shortcuts and nothing else", () => {
    expect(isCaptureKey(key({ key: "PrintScreen" }))).toBe(true);
    expect(isCaptureKey(key({ key: "4", metaKey: true, shiftKey: true }))).toBe(true);
    expect(isCaptureKey(key({ key: "S", metaKey: true, shiftKey: true }))).toBe(true);
    expect(isCaptureKey(key({ key: "s", ctrlKey: true }))).toBe(false);
    expect(isCaptureKey(key({ key: "a" }))).toBe(false);
  });
});
