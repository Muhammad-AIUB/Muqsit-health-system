// @vitest-environment jsdom
//
// "Remove MHS logo" (admin Profile settings, physician's sheet 16/11/2026): the
// tile in the header of both shells is drawn by one component that asks the
// practice's setting — only an explicit true takes it away.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const practice: { current: null | { hideMhsLogo?: unknown } } = { current: null };
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ activeWorkstation: practice.current }) }));

import MhsMark from "./MhsMark";

afterEach(() => { cleanup(); practice.current = null; });

const draw = () => render(<MhsMark size={{ width: 32, height: 32 }} radius={8} fontSize={10} letterSpacing="0.02em" />);

describe("MhsMark", () => {
  it("is drawn while no practice has been chosen yet — a brand is never taken off for want of an answer", () => {
    const { container } = draw();
    expect(container.querySelector("[data-mhs-logo]")?.textContent).toBe("MHS+");
  });

  it.each([[{ hideMhsLogo: false }], [{}], [{ hideMhsLogo: "true" }], [{ hideMhsLogo: 1 }]])(
    "is drawn for a practice whose setting is %j",
    (p) => {
      practice.current = p;
      expect(draw().container.querySelector("[data-mhs-logo]")).not.toBeNull();
    },
  );

  it("is NOT drawn for a practice that removed it — nothing at all, no empty tile left behind", () => {
    practice.current = { hideMhsLogo: true };
    const { container } = draw();
    expect(container.querySelector("[data-mhs-logo]")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("carries the size it is given (the desktop and the phone tile differ)", () => {
    const { container } = render(<MhsMark size={{ width: 30, height: 26 }} radius={7} fontSize={8.5} />);
    const el = container.querySelector<HTMLElement>("[data-mhs-logo]")!;
    expect([el.style.width, el.style.height, el.style.borderRadius, el.style.fontSize]).toEqual(["30px", "26px", "7px", "8.5px"]);
  });
});
