// @vitest-environment jsdom
//
// The personal note's box, used as a doctor uses it: whose note it is, what its
// ONE text is, and what Print puts on paper. (The printable page as a string is
// pinned in PersonalNote.test.ts, the keyboard in PersonalNote.keyboard.test.tsx.)
//
// Three things the fourth review found by reading, with every test green:
//  • the box followed the editor's patient while it stood open — text typed for
//    one patient was saved into the next one's note, under their details;
//  • Save marked everything "saved", also what was typed while the request was
//    on its way — which was then shown as saved, or thrown away;
//  • nothing tested what Print prints: it could print the wrong text, or the
//    sensitive words under "without", and no test would have said so.
// So every test here presses the real buttons and reads the real print frame.
// The patients, the notes and every word in them are made up.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersonalNoteSection } from "./PersonalNote";

type Info = { name: string; age: string; sex: string; address: string; mobile: string };
type Note = { html: string; patientInfo: Info; updatedAt: string };
type Header = { currentPatientId: string | null; ptName: string; ptAge: string; ptGender: string; ptAddress: string; ptPhone: string };

const ALPHA: Header = { currentPatientId: "p1", ptName: "Test Patient Alpha", ptAge: "45", ptGender: "Male", ptAddress: "House 1", ptPhone: "01700000031" };
const BETA: Header = { currentPatientId: "p2", ptName: "Test Patient Beta", ptAge: "60", ptGender: "Female", ptAddress: "House 2", ptPhone: "01700000032" };
const NOBODY: Header = { currentPatientId: null, ptName: "", ptAge: "", ptGender: "", ptAddress: "", ptPhone: "" };
const infoOf = (h: Header): Info => ({ name: h.ptName, age: h.ptAge, sex: h.ptGender, address: h.ptAddress, mobile: h.ptPhone });
const noteOf = (h: Header, html: string): Note => ({ html, patientInfo: infoOf(h), updatedAt: "2026-10-09T11:04:00.000Z" });
const sensitive = (words: string) => `<a href="mhs-sensitive:1">${words}</a>`;

// The editor's patient (what useMuqsit answers) and the server's notes.
const app = vi.hoisted(() => ({
  header: {} as Record<string, unknown>,
  notes: {} as Record<string, unknown>,
  saves: [] as { patientId: string; html: string; patientInfo: unknown }[],
  hold: false,
  finish: null as null | (() => void),
}));

vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ ...app.header, activeWorkstation: null }) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  patientNotesApi: {
    get: vi.fn(async (patientId: string) => app.notes[patientId] ?? null),
    // The server keeps the patient details of the FIRST save, and stores the
    // text as it was sent (server/src/patient-notes).
    save: vi.fn((patientId: string, input: { html: string; patientInfo: unknown }) => new Promise((resolve) => {
      app.saves.push({ patientId, html: input.html, patientInfo: input.patientInfo });
      const finish = () => {
        const before = app.notes[patientId] as Note | undefined;
        const note = { html: input.html, patientInfo: before?.patientInfo ?? input.patientInfo, updatedAt: "2026-10-12T09:30:00.000Z" };
        app.notes[patientId] = note;
        resolve(note);
      };
      if (app.hold) app.finish = finish; else finish();
    })),
  },
}));

const LABEL = "My Personal Note for This Patient";

beforeEach(() => { app.header = { ...ALPHA }; app.notes = {}; app.saves = []; app.hold = false; app.finish = null; });
afterEach(() => { cleanup(); document.querySelectorAll("iframe").forEach((f) => f.remove()); });

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <QueryClientProvider client={qc}><PersonalNoteSection /></QueryClientProvider>;
  const view = render(tree());
  return {
    /** The editor moves on: another patient is loaded behind the open note. */
    editorMovesTo: async (h: Header) => {
      app.header = { ...h };
      view.rerender(tree());
      await settle();
    },
  };
};

// Lets everything that is already on its way arrive: a request the (mocked)
// server has answered, and the render after it.
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

const openNote = async () => {
  fireEvent.click(screen.getByRole("button", { name: LABEL }));
  const panel = await screen.findByRole("dialog", { name: LABEL });
  await settle();
  return panel;
};
const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const editorIn = (panel: HTMLElement) => panel.querySelector<HTMLElement>('[contenteditable="true"]');
const type = (panel: HTMLElement, html: string) => {
  const el = editorIn(panel);
  if (!el) throw new Error("the note is not open for writing");
  el.focus();
  el.innerHTML = html;
  fireEvent.input(el);
};
const shownIn = (panel: HTMLElement) => panel.querySelector(".pn-view")?.textContent ?? "";

// What went to the printer: the note's own print frame. jsdom neither prints
// nor moves the window's focus, so those two are stood in for — nothing else.
const printed = () => {
  const frames = Array.from(document.body.querySelectorAll<HTMLIFrameElement>(":scope > iframe"));
  return frames.map((frame) => {
    const win = frame.contentWindow as Window;
    win.print = vi.fn();
    win.focus = vi.fn();
    const doc = frame.contentDocument as Document;
    return {
      note: doc.querySelector(".note")?.textContent ?? "",
      details: Array.from(doc.querySelectorAll("td")).map((td) => td.textContent ?? ""),
    };
  });
};

describe("PersonalNote — what Print prints", () => {
  it("a note with nothing sensitive in it prints at once: the note on the screen, under the patient's details", async () => {
    app.notes.p1 = noteOf(ALPHA, "<p>Prefers evening appointments.</p>");
    mount();
    await openNote();
    fireEvent.click(button(/Print$/));
    expect(screen.queryByRole("dialog", { name: "Print the note" })).toBeNull();
    const pages = printed();
    expect(pages).toHaveLength(1);
    expect(pages[0].note).toBe("Prefers evening appointments.");
    expect(pages[0].details).toEqual(["Test Patient Alpha", "45", "Male", "House 1", "01700000031"]);
  });

  describe("a note with sensitive text", () => {
    const askHowToPrint = async () => {
      app.notes.p1 = noteOf(ALPHA, `<p>Family history: ${sensitive("confidential detail")}</p>`);
      mount();
      await openNote();
      fireEvent.click(button(/Print$/));
      return screen.getByRole("dialog", { name: "Print the note" });
    };

    it("⚕️ prints nothing until the question is answered", async () => {
      await askHowToPrint();
      expect(printed()).toEqual([]);
    });

    it("⚕️ 'without' prints the note with the sensitive words left out", async () => {
      await askHowToPrint();
      fireEvent.click(button("Print without sensitive information"));
      const pages = printed();
      expect(pages).toHaveLength(1);
      expect(pages[0].note).toContain("Family history:");
      expect(pages[0].note).not.toContain("confidential detail");
    });

    it("'with' prints them", async () => {
      await askHowToPrint();
      fireEvent.click(button("Print with sensitive information"));
      const pages = printed();
      expect(pages).toHaveLength(1);
      expect(pages[0].note).toBe("Family history: confidential detail");
    });

    it("Cancel prints nothing, and takes the question away", async () => {
      await askHowToPrint();
      fireEvent.click(button("Cancel"));
      expect(printed()).toEqual([]);
      expect(screen.queryByRole("dialog", { name: "Print the note" })).toBeNull();
    });
  });

  it("⚕️ what has been TYPED is what prints — and what is asked about — not the note as it was saved", async () => {
    app.notes.p1 = noteOf(ALPHA, "<p>Prefers evening appointments.</p>");
    mount();
    const panel = await openNote();
    fireEvent.click(button("Edit"));
    type(panel, `<p>Lives alone. ${sensitive("made-up private words")}</p>`);
    fireEvent.click(button(/Print$/));
    // The saved text has nothing sensitive in it; the typed text has.
    expect(screen.queryByRole("dialog", { name: "Print the note" })).not.toBeNull();
    fireEvent.click(button("Print without sensitive information"));
    const pages = printed();
    expect(pages).toHaveLength(1);
    expect(pages[0].note).toContain("Lives alone.");
    expect(pages[0].note).not.toContain("made-up private words");
    expect(pages[0].note).not.toContain("Prefers evening appointments.");
  });

  it("⚕️ a note emptied out IS empty — the saved words do not come back, on the screen, on paper or in the save", async () => {
    app.notes.p1 = noteOf(ALPHA, "<p>Prefers evening appointments.</p>");
    mount();
    const panel = await openNote();
    fireEvent.click(button("Edit"));
    type(panel, "");
    expect(button("Save").disabled).toBe(false); // everything deleted is a change too
    fireEvent.click(button(/Print$/));
    expect(printed()[0].note).toBe("");
    fireEvent.click(button("Save"));
    await settle();
    expect(app.saves.map((s) => s.html)).toEqual([""]);
    expect(panel.textContent).toContain("No note yet.");
    expect(panel.textContent).not.toContain("Prefers evening appointments.");
  });
});

// Save is not instant, and the box stays open for writing while the request is
// on its way. Only what was SENT has been saved.
describe("PersonalNote — typing while a save is on its way", () => {
  const SAVED = "<p>Prefers evening appointments.</p>";
  const startASave = async (typed: string) => {
    app.notes.p1 = noteOf(ALPHA, SAVED);
    app.hold = true;
    mount();
    const panel = await openNote();
    fireEvent.click(button("Edit"));
    type(panel, typed);
    fireEvent.click(button("Save"));
    await settle();
    expect(app.saves.map((s) => s.html)).toEqual([typed]);
    return panel;
  };
  const theSaveComesBack = async () => { await act(async () => { app.finish?.(); }); await settle(); };

  it("a save with nothing typed after it closes the editor and shows the note as saved", async () => {
    const panel = await startASave("<p>Prefers mornings now.</p>");
    await theSaveComesBack();
    expect(editorIn(panel)).toBeNull();
    expect(shownIn(panel)).toBe("Prefers mornings now.");
    expect(button("Save").disabled).toBe(true);
  });

  it("⚕️ what was typed after pressing Save is still there, still open, and still unsaved", async () => {
    const panel = await startASave("<p>Prefers mornings now.</p>");
    type(panel, "<p>Prefers mornings now. Call the daughter first.</p>");
    await theSaveComesBack();
    expect(editorIn(panel)?.textContent).toBe("Prefers mornings now. Call the daughter first.");
    expect(button("Save").disabled).toBe(false);
    // …and closing asks about it instead of dropping it.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy();
    // Saved again, it is the later text that goes.
    app.hold = false;
    fireEvent.click(button("Save"));
    await settle();
    expect(app.saves.map((s) => s.html)).toEqual(["<p>Prefers mornings now.</p>", "<p>Prefers mornings now. Call the daughter first.</p>"]);
    expect(shownIn(panel)).toBe("Prefers mornings now. Call the daughter first.");
  });

  // The case the review traced: the text sent is the text already saved (typed,
  // then typed back), so the saved note "does not change" when the answer
  // comes — and the later words stayed on the screen marked as saved, while
  // Print read the saved note and never asked its question.
  it("⚕️ Print asks about the sensitive words on the screen, though the note last saved has none", async () => {
    const panel = await startASave("<p>Prefers evening appointments. x</p>");
    await theSaveComesBack();
    fireEvent.click(button("Edit"));
    type(panel, "<p>Prefers evening appointments. x</p>");
    type(panel, "<p>Prefers evening appointments. x </p>");
    type(panel, "<p>Prefers evening appointments. x</p>"); // typed back: the same as saved, and still "changed"
    app.hold = true;
    fireEvent.click(button("Save"));
    await settle();
    type(panel, `<p>Prefers evening appointments. x ${sensitive("made-up private words")}</p>`);
    await theSaveComesBack();
    fireEvent.click(button(/Print$/));
    expect(screen.queryByRole("dialog", { name: "Print the note" })).not.toBeNull();
    expect(printed()).toEqual([]);
    fireEvent.click(button("Print with sensitive information"));
    expect(printed()[0].note).toBe("Prefers evening appointments. x made-up private words");
  });

  it("a save that fails keeps the text, the editor and the message", async () => {
    app.notes.p1 = noteOf(ALPHA, SAVED);
    const api = await import("@/lib/api");
    vi.mocked(api.patientNotesApi.save).mockRejectedValueOnce(new Error("offline"));
    mount();
    const panel = await openNote();
    fireEvent.click(button("Edit"));
    type(panel, "<p>Prefers mornings now.</p>");
    fireEvent.click(button("Save"));
    await settle();
    expect(screen.getByText(/Note NOT saved/)).toBeTruthy();
    expect(editorIn(panel)?.textContent).toBe("Prefers mornings now.");
    expect(button("Save").disabled).toBe(false);
  });
});

// The box is opened FOR a patient. Another device can move the editor on to
// the next patient while it stands open (device mirroring), and a patient
// chosen from the OPD queue loads a moment after the page has changed.
describe("PersonalNote — the editor moves on to another patient while the note is open", () => {
  it("⚕️ what was typed is saved into the note it was typed in — never the next patient's, never under their details", async () => {
    const app_ = mount();
    const panel = await openNote(); // no note yet: straight into writing
    type(panel, "<p>Made-up words about Alpha.</p>");
    await app_.editorMovesTo(BETA);
    fireEvent.click(button("Save"));
    await settle();
    expect(app.saves).toEqual([{ patientId: "p1", html: "<p>Made-up words about Alpha.</p>", patientInfo: infoOf(ALPHA) }]);
    expect(app.notes.p2).toBeUndefined();
  });

  it("⚕️ the box goes on showing the note it was opened for, under that patient's details", async () => {
    app.notes.p1 = noteOf(ALPHA, "<p>Made-up words about Alpha.</p>");
    app.notes.p2 = noteOf(BETA, "<p>Made-up words about Beta.</p>");
    const app_ = mount();
    const panel = await openNote();
    await app_.editorMovesTo(BETA);
    expect(shownIn(panel)).toBe("Made-up words about Alpha.");
    expect(panel.textContent).toContain("Test Patient Alpha");
    expect(panel.textContent).not.toContain("Test Patient Beta");
  });

  it("⚕️ a print question asked about one patient's note never prints another's", async () => {
    app.notes.p1 = noteOf(ALPHA, `<p>Alpha: ${sensitive("made-up words of Alpha")}</p>`);
    app.notes.p2 = noteOf(BETA, `<p>Beta: ${sensitive("made-up words of Beta")}</p>`);
    const app_ = mount();
    await openNote();
    fireEvent.click(button(/Print$/));
    await app_.editorMovesTo(BETA);
    fireEvent.click(button("Print with sensitive information"));
    const pages = printed();
    expect(pages).toHaveLength(1);
    expect(pages[0].note).toBe("Alpha: made-up words of Alpha");
    expect(pages[0].details[0]).toBe("Test Patient Alpha");
  });

  // Once open, the box takes nothing more from the editor's patient — not even
  // that there is one. (In the app a CLEARED editor is redrawn whole, by
  // `PatientGate`, and the note closes with it; this is the section by itself.)
  it("⚕️ once open it does not depend on the editor's patient at all: cleared, then another, it is the same note", async () => {
    app.notes.p1 = noteOf(ALPHA, "<p>Made-up words about Alpha.</p>");
    app.notes.p2 = noteOf(BETA, "<p>Made-up words about Beta.</p>");
    const app_ = mount();
    await openNote();
    await app_.editorMovesTo(NOBODY);
    expect(shownIn(screen.getByRole("dialog", { name: LABEL }))).toBe("Made-up words about Alpha.");
    await app_.editorMovesTo(BETA);
    expect(shownIn(screen.getByRole("dialog", { name: LABEL }))).toBe("Made-up words about Alpha.");
  });

  it("closed and opened again, it is the patient now in the editor", async () => {
    app.notes.p1 = noteOf(ALPHA, "<p>Made-up words about Alpha.</p>");
    app.notes.p2 = noteOf(BETA, "<p>Made-up words about Beta.</p>");
    const app_ = mount();
    await openNote();
    await app_.editorMovesTo(BETA);
    fireEvent.click(button("Close"));
    expect(screen.queryByRole("dialog", { name: LABEL })).toBeNull();
    const panel = await openNote();
    expect(shownIn(panel)).toBe("Made-up words about Beta.");
    expect(panel.textContent).toContain("Test Patient Beta");
  });
});
