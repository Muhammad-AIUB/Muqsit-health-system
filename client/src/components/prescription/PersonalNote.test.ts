// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({}) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

import { noteTextNow, personalNoteHtml } from "./PersonalNote";

const info = { name: "Rahim <Uddin>", age: "42", sex: "Male", address: "Mirpur, Dhaka", mobile: "01712345678" };

// The note box holds a `draft`, and a note that has just loaded reaches it one
// render late: for that instant the box says "loaded" with an empty draft. Print
// reads the draft — so Print pressed in that instant printed an EMPTY note, and
// skipped the question a note with sensitive text must ask. (It could not leak:
// there was nothing in the draft to print.) No hand is that fast; a test is,
// and three tests of the print question failed one run in four until the
// flaky-test detector named them (2026-10-12).
describe("the note's text as it stands right now", () => {
  const SAVED = '<p>Family history: <a href="mhs-sensitive:1">confidential detail</a></p>';

  it("⚕️ a note that has just loaded is its SAVED text — though the draft has not caught up yet", () => {
    expect(noteTextNow(false, "", SAVED)).toBe(SAVED);
  });

  it("once something has been typed, it is what was typed", () => {
    expect(noteTextNow(true, "<p>typed</p>", SAVED)).toBe("<p>typed</p>");
    expect(noteTextNow(true, "", SAVED)).toBe(""); // everything deleted is a change too
  });

  it("with no note saved yet, it is the draft", () => {
    expect(noteTextNow(false, "", null)).toBe("");
    expect(noteTextNow(false, "", undefined)).toBe("");
    expect(noteTextNow(true, "<p>first words</p>", null)).toBe("<p>first words</p>");
  });
});

describe("the printed personal note", () => {
  it("prints the patient details and the note, and nothing from the prescription", () => {
    const html = personalNoteHtml(info, "<b>Watch K+</b> next visit", "24/09/2026");
    expect(html).toContain("My Personal Note for This Patient");
    expect(html).toContain("<td>42</td>");
    expect(html).toContain("<td>01712345678</td>");
    expect(html).toContain("<b>Watch K+</b> next visit");
    expect(html).toContain("printed 24/09/2026");
    expect(html).not.toMatch(/℞|rx-table|Advice/);
  });

  it("escapes the patient details and sanitises the note", () => {
    const html = personalNoteHtml(info, 'ok<script>alert(1)</script><img src=x onerror=alert(1)>', "24/09/2026");
    expect(html).toContain("Rahim &lt;Uddin&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("onerror");
  });

  it("prints sensitive information only when asked to", () => {
    const note = 'Watch K+ <a href="mhs-sensitive:1">HIV positive</a>';
    const withIt = personalNoteHtml(info, note, "24/09/2026", { sensitive: true });
    const without = personalNoteHtml(info, note, "24/09/2026", { sensitive: false });
    expect(withIt).toContain("HIV positive");
    expect(without).not.toContain("HIV positive");
    expect(without).toContain("Watch K+");
  });

  it("defaults to leaving sensitive information OUT", () => {
    expect(personalNoteHtml(info, '<a href="mhs-sensitive:1">secret</a>', "24/09/2026")).not.toContain("secret");
  });

  it("shows a dash for a detail that was never recorded", () => {
    expect(personalNoteHtml({ ...info, sex: "" }, "", "24/09/2026")).toContain("<th>Sex</th><td>—</td>");
  });
});
