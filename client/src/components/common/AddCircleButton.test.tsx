// @vitest-environment jsdom
// The circled plus (physician, 02/11/2026: "joto jaygay plus icon ase eta hobe
// pluser upore round er moto"): the round add beside a label and the words of
// an "add" button both carry the `plusCircle` icon, never a "+" character.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AddCircleButton, { PlusLabel } from "./AddCircleButton";

afterEach(cleanup);

describe("AddCircleButton", () => {
  it("is the circled plus, named, with the larger touch target, and presses", () => {
    const onClick = vi.fn();
    render(<AddCircleButton aria-label="Add Chief complaints" onClick={onClick} />);
    const b = screen.getByRole("button", { name: "Add Chief complaints" });
    expect(b.querySelector('svg[data-icon="plusCircle"]')).not.toBeNull();
    expect(b.textContent).toBe("");
    expect(b.className).toContain("hit-area");
    expect(b.getAttribute("type")).toBe("button");
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("draws the plus heavier than its ring", () => {
    render(<AddCircleButton aria-label="Add" />);
    const paths = Array.from(document.querySelectorAll('svg[data-icon="plusCircle"] path'));
    expect(paths).toHaveLength(3);
    expect(paths[0].getAttribute("stroke-width")).toBeNull(); // the ring: the icon's own 1.8
    expect(paths.slice(1).map((p) => p.getAttribute("stroke-width"))).toEqual(["2.6", "2.6"]);
  });
});

describe("PlusLabel", () => {
  it("puts the icon in front of the words; the button's name is the words alone", () => {
    render(<button type="button"><PlusLabel>Add medicine</PlusLabel></button>);
    const b = screen.getByRole("button", { name: "Add medicine" });
    expect(b.querySelector('svg[data-icon="plusCircle"]')).not.toBeNull();
    expect(b.textContent).toBe("Add medicine");
  });
});
