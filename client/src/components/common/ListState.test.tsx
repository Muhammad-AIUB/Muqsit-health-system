// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LoadError, Loading } from "./ListState";

afterEach(cleanup);

describe("Loading", () => {
  it("says what is loading, as a status, with something moving beside it", () => {
    render(<Loading label="Loading queue…" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading queue…");
    expect(status.querySelector(".spinner")).not.toBeNull();
    // The ring is decoration: a screen reader hears the words only.
    expect(status.querySelector(".spinner")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("has a plain default", () => {
    render(<Loading />);
    expect(screen.getByText("Loading…")).toBeTruthy();
  });
});

describe("LoadError", () => {
  it("says what did not load and the one thing the doctor can check", () => {
    render(<LoadError title="Could not load the OPD queue." />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Could not load the OPD queue.");
    expect(alert.textContent).toContain("Check your internet connection and try again.");
  });

  it("a reason the server gave replaces the general line", () => {
    render(<LoadError title="Could not load patients." detail="Your session has expired. Sign in again." />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Your session has expired. Sign in again.");
    expect(alert.textContent).not.toContain("Check your internet connection");
  });

  it("⚕️ offers to ask again in place, so nobody reloads the app with a prescription half written", () => {
    const onRetry = vi.fn();
    render(<LoadError title="Could not load the ward." onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("while it is asking again the button says so and cannot be pressed twice", () => {
    const onRetry = vi.fn();
    render(<LoadError title="Could not load the ward." onRetry={onRetry} retrying />);
    const button = screen.getByRole("button", { name: "Trying again…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("shows no button when there is nothing to ask again", () => {
    render(<LoadError title="Could not load wards." />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
