// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import PatientAvatar from "./PatientAvatar";

afterEach(cleanup);

const iconOf = (c: HTMLElement) => c.querySelector("svg")?.getAttribute("data-icon");

describe("PatientAvatar", () => {
  it("shows the stored picture when there is one", () => {
    const { container } = render(<PatientAvatar url="https://example.test/a.jpg" sex="Male" name="mr test 5" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.test/a.jpg");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("without a picture, shows the app's placeholder icon for the sex", () => {
    for (const [sex, icon] of [["Male", "male"], ["Female", "female"], ["", "user"], [null, "user"], [undefined, "user"], ["Other", "user"]] as const) {
      const { container, unmount } = render(<PatientAvatar url={null} sex={sex} name="x" />);
      expect(container.querySelector("img")).toBeNull();
      expect(iconOf(container)).toBe(icon);
      unmount();
    }
  });

  it("a picture that cannot be loaded falls back to the icon for the sex", () => {
    const { container } = render(<PatientAvatar url="https://example.test/gone.jpg" sex="Female" name="x" />);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(iconOf(container)).toBe("female");
  });

  it("a new url after a failed one is tried again", () => {
    const { container, rerender } = render(<PatientAvatar url="https://example.test/gone.jpg" sex="Male" name="x" />);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    rerender(<PatientAvatar url="https://example.test/new.jpg" sex="Male" name="x" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.test/new.jpg");
  });

  it("is named for a screen reader by the patient", () => {
    const { getByRole, getAllByRole } = render(<PatientAvatar url="https://example.test/a.jpg" sex="Male" name="mr test 5" />);
    expect(getByRole("img", { name: "Photo of mr test 5" })).toBeTruthy();
    expect(getAllByRole("img")).toHaveLength(1);
  });
});
