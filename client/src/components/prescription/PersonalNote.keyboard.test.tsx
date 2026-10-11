// @vitest-environment jsdom
//
// The personal note as a popup. What the note may contain and what prints is
// pinned in PersonalNote.test.ts; this pins the keyboard: Tab stays in the note,
// Escape closes it and gives the focus back, and the "how should it be
// printed?" question — raised INSIDE the note for one that holds sensitive
// text — owns both keys while it is up.

import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersonalNoteSection } from "./PersonalNote";
import { tabStopsOf } from "@/test/dialogKeyboard";

const note = vi.hoisted(() => ({ html: "<p>Prefers evening appointments.</p>", exists: true }));

vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    currentPatientId: "p1", ptName: "Test Patient Alpha", ptAge: "45", ptGender: "Male", ptAddress: "", ptPhone: "01700000031",
    activeWorkstation: null,
  }),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  patientNotesApi: {
    get: vi.fn(async () => (!note.exists ? null : {
      html: note.html,
      patientInfo: { name: "Test Patient Alpha", age: "45", sex: "Male", address: "", mobile: "01700000031" },
      updatedAt: "2026-10-09T11:04:00.000Z",
    })),
    save: vi.fn(),
  },
}));

afterEach(() => { cleanup(); note.html = "<p>Prefers evening appointments.</p>"; note.exists = true; });

const LABEL = "My Personal Note for This Patient";

const mount = (extra?: ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{extra}<PersonalNoteSection /></QueryClientProvider>);
};

// Open the note from its own button, as a doctor does, and wait for it to load.
const openNote = async () => {
  const opener = screen.getByRole("button", { name: LABEL });
  opener.focus();
  fireEvent.click(opener);
  await screen.findByText(/Last saved/);
  return { opener, panel: screen.getByRole("dialog", { name: LABEL }) };
};

const tab = (shiftKey = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab", shiftKey });
const escape = () => fireEvent.keyDown(document.body, { key: "Escape" });

describe("PersonalNote — the keyboard stays in the note", () => {
  it("⚕️ opening it takes the focus off the button behind it", async () => {
    // Left on that button, Enter would press it again from behind the note.
    mount();
    const { opener, panel } = await openNote();
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
    expect(document.activeElement).not.toBe(opener);
  });

  it("⚕️ Tab on the last control comes round to the first — not into the editor behind", async () => {
    mount();
    const { panel } = await openNote();
    const stops = tabStopsOf(panel);
    stops[stops.length - 1].focus();
    expect(tab()).toBe(false);
    expect(document.activeElement).toBe(stops[0]);
  });

  it("Shift+Tab on the first control goes to the last", async () => {
    mount();
    const { panel } = await openNote();
    const stops = tabStopsOf(panel);
    stops[0].focus();
    expect(tab(true)).toBe(false);
    expect(document.activeElement).toBe(stops[stops.length - 1]);
  });

  it("⚕️ focus left on the page behind is brought into the note", async () => {
    mount(<button type="button">Behind the note</button>);
    const { panel } = await openNote();
    screen.getByRole("button", { name: "Behind the note" }).focus();
    expect(tab()).toBe(false);
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("Escape closes it and puts the focus back on the button that opened it", async () => {
    mount();
    const { opener, panel } = await openNote();
    tabStopsOf(panel)[0].focus();
    escape();
    expect(screen.queryByRole("dialog", { name: LABEL })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("⚕️ a question raised over it owns Escape — the note stays open", async () => {
    mount();
    await openNote();
    const question = document.createElement("div");
    question.setAttribute("role", "alertdialog");
    document.body.appendChild(question);
    try {
      escape();
      expect(screen.queryByRole("dialog", { name: LABEL })).not.toBeNull();
    } finally {
      question.remove();
    }
  });
});

describe("PersonalNote — the print question, raised inside the note", () => {
  const askHowToPrint = async () => {
    note.html = '<p>Family history: <a href="mhs-sensitive:1">confidential detail</a></p>';
    mount();
    const opened = await openNote();
    const print = screen.getByRole("button", { name: /Print$/ });
    print.focus();
    fireEvent.click(print);
    return { ...opened, print, question: screen.getByRole("dialog", { name: "Print the note" }) };
  };

  it("⚕️ Escape closes the question only — the note under it stays open", async () => {
    await askHowToPrint();
    escape();
    expect(screen.queryByRole("dialog", { name: "Print the note" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: LABEL })).not.toBeNull();
  });

  it("⚕️ Tab stays on the question's own three buttons", async () => {
    const { question } = await askHowToPrint();
    const stops = tabStopsOf(question);
    expect(stops.map((b) => b.textContent?.trim())).toEqual([
      "Print with sensitive information", "Print without sensitive information", "Cancel",
    ]);
    stops[2].focus();
    expect(tab()).toBe(false);
    expect(document.activeElement).toBe(stops[0]);
    expect(tab(true)).toBe(false);
    expect(document.activeElement).toBe(stops[2]);
  });

  it("closing the question puts the focus back on Print", async () => {
    const { question, print } = await askHowToPrint();
    tabStopsOf(question)[2].focus();
    escape();
    expect(document.activeElement).toBe(print);
  });
});

// The editor reports its text every time the focus leaves it. Taken as "the
// doctor changed something", merely tabbing through an untouched note made it
// ask about unsaved changes that did not exist.
describe("PersonalNote — nothing typed is nothing to lose", () => {
  const openBlankNote = async () => {
    note.exists = false;
    mount();
    const opener = screen.getByRole("button", { name: LABEL });
    opener.focus();
    fireEvent.click(opener);
    const panel = await screen.findByRole("dialog", { name: LABEL });
    const editor = await waitFor(() => {
      const el = panel.querySelector<HTMLElement>('[contenteditable="true"]');
      if (!el) throw new Error("the editor has not opened yet");
      return el;
    });
    return { panel, editor };
  };

  it("⚕️ leaving the editor without typing does not make the note unsaved", async () => {
    const { editor } = await openBlankNote();
    editor.focus();
    fireEvent.blur(editor);
    escape();
    expect(screen.queryByText(/Unsaved changes/)).toBeNull();
    expect(screen.queryByRole("dialog", { name: LABEL })).toBeNull();
  });

  it("⚕️ text that WAS typed is still asked about before it is thrown away", async () => {
    const { editor } = await openBlankNote();
    editor.focus();
    editor.innerHTML = "Allergic to penicillin - told by the patient";
    fireEvent.input(editor);
    fireEvent.blur(editor);
    escape();
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: LABEL })).not.toBeNull();
  });
});
