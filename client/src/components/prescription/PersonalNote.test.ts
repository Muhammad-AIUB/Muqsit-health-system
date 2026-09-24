// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({}) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

import { personalNoteHtml } from "./PersonalNote";

const info = { name: "Rahim <Uddin>", age: "42", sex: "Male", address: "Mirpur, Dhaka", mobile: "01712345678" };

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
    const note = 'Watch K+ <span data-sensitive="1">HIV positive</span>';
    const withIt = personalNoteHtml(info, note, "24/09/2026", { sensitive: true });
    const without = personalNoteHtml(info, note, "24/09/2026", { sensitive: false });
    expect(withIt).toContain("HIV positive");
    expect(without).not.toContain("HIV positive");
    expect(without).toContain("Watch K+");
  });

  it("defaults to leaving sensitive information OUT", () => {
    expect(personalNoteHtml(info, '<span data-sensitive="1">secret</span>', "24/09/2026")).not.toContain("secret");
  });

  it("shows a dash for a detail that was never recorded", () => {
    expect(personalNoteHtml({ ...info, sex: "" }, "", "24/09/2026")).toContain("<th>Sex</th><td>—</td>");
  });
});
