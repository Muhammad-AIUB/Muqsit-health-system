// @vitest-environment jsdom
//
// ⚕️ The line under the Save buttons was drawn in the "saved" green for every
// message it ever held — "Save failed: …", "Draft NOT saved …" and a refusal
// among them — and the root CLAUDE.md keeps green for done / normal / saved
// (`C.ok`). The line draws the KIND the store holds with its words; it never
// reads the words to guess. A save that did not happen is not this line at all:
// it is a box the doctor has to read (MuqsitContext.test.tsx).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { C } from "@/theme";
import SaveNoticeLine from "./SaveNoticeLine";

afterEach(cleanup);

describe("SaveNoticeLine", () => {
  it("a save that happened is green", () => {
    render(<SaveNoticeLine notice={{ kind: "ok", text: "Prescription saved!" }} />);
    const line = screen.getByRole("status");
    expect(line.textContent).toBe("Prescription saved!");
    expect(line.style.color).toBe(C.ok[600]);
  });

  it("a save that was refused for a reason the doctor can put right is amber, not green", () => {
    render(<SaveNoticeLine notice={{ kind: "warn", text: "Add a medicine or some clinical detail before saving." }} />);
    const line = screen.getByRole("status");
    expect(line.style.color).toBe(C.warn[800]);
    expect(line.style.color).not.toBe(C.ok[600]);
  });

  it("the colour comes from the kind, never from the words", () => {
    render(<SaveNoticeLine notice={{ kind: "warn", text: "Prescription saved!" }} />);
    expect(screen.getByRole("status").style.color).toBe(C.warn[800]);
  });

  // A region that arrives together with its words is often not read out; this
  // one is on the page from the start, empty.
  it("is on the page with nothing in it when there is nothing to say", () => {
    render(<SaveNoticeLine notice={null} />);
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
