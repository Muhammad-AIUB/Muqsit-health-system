// @vitest-environment jsdom
//
// The ☀ / ☾ switch in the header (physician's request, 2026-10-15).

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import ThemeToggle from "./ThemeToggle";
import { setTheme } from "@/lib/theme";

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

afterEach(() => {
  cleanup();
  act(() => setTheme("light"));
  window.localStorage.clear();
});

const light = () => screen.getByRole("button", { name: "Light mode" });
const night = () => screen.getByRole("button", { name: "Night mode" });

describe("ThemeToggle", () => {
  it("starts in light, and says which side is on", () => {
    render(<ThemeToggle />);
    expect(light().getAttribute("aria-pressed")).toBe("true");
    expect(night().getAttribute("aria-pressed")).toBe("false");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("a press turns night on and remembers it for this user", () => {
    render(<ThemeToggle />);
    fireEvent.click(night());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(night().getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem("mhs_theme:u1")).toBe("dark");
    fireEvent.click(light());
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(window.localStorage.getItem("mhs_theme:u1")).toBe("light");
  });

  it("restores this user's saved mode when it appears", () => {
    window.localStorage.setItem("mhs_theme:u1", "dark");
    render(<ThemeToggle />);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(night().getAttribute("aria-pressed")).toBe("true");
  });

  it("a user with nothing saved keeps what the device shows", () => {
    act(() => setTheme("dark"));
    render(<ThemeToggle />);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
