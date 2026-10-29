# OPD Print Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Print Queue" button on the OPD tab prints the open day's serial list (Serial, Name, Gender, Age, Mobile, Appointment time) on A4, behind a preview.

**Architecture:** A pure builder `buildQueueDoc` makes the sheet's HTML from rows already loaded in `OpdView`; the existing `PrintSheetModal` shows and prints it. No server, DB or API change.

**Tech Stack:** Next.js 14 / React, vitest + Testing Library (jsdom). Spec: `docs/superpowers/specs/2026-10-30-opd-print-queue-design.md`.

## Global Constraints

- Medical software: show exactly what was stored; a missing age, gender or mobile is `—`; nothing guessed, nothing truncated (root CLAUDE.md, prime directive 4).
- The appointment time is `clockText` of the `times` array `OpdView` already computes from the SAVED schedule, never a half-typed box. No saved time → `—`.
- The doctor named is the workstation's doctor: `activeWorkstation.name` from `useMuqsit()`, never `user.displayName` (an assistant is signed in as themself). No workstation → no name line.
- Sex is shown through `sexLabel` (`@/lib/sex`), age as `34y` like the screen, mobile as stored.
- Dates `dd/mm/yyyy` via `dayLabel` (`@/lib/opdDay`).
- The builder imports no theme. Its colours are plain greys; the file goes on `rawColours.test.ts`'s `SKIP` list.
- Any queue day, including a past one, can be printed.
- Do not touch `server/`, `docs/API.md`, or the prescription's print sheet look. Work in a copy of the sources if the dev servers on :3000/:4000 are running (root CLAUDE.md: the dev DB is production); copy the finished files into the checkout together.
- Commits: `Muhammad-AIUB <mjubayer.aiub@gmail.com>`, conventional, ending `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Never use the Fable model for any subagent; set `model` to `sonnet` or `opus`.

---

## File Structure

- Create `client/src/lib/opdQueueDoc.ts` — pure HTML builder.
- Create `client/src/lib/opdQueueDoc.test.ts` — its tests.
- Modify `client/src/theme/rawColours.test.ts:55` — add the file to `SKIP`.
- Modify `client/src/components/prescription/PrintSheetModal.tsx` — a `label` prop (default `"Prescription"`) for the dialog's `aria-label` and the frame's `title`.
- Modify `client/src/components/prescription/PrintSheetModal.test.tsx` — one test for the prop.
- Modify `client/src/components/tabs/OpdView.tsx` — button, builder call, modal.
- Create `client/src/components/tabs/OpdView.print.test.tsx` — button tests.
- Modify docs: `FUNCTIONAL-AUDIT.md`, `docs/DOMAIN.md`, `client/CLAUDE.md` (Task 3).

---

### Task 1: The sheet builder

**Files:**
- Create: `client/src/lib/opdQueueDoc.ts`
- Create: `client/src/lib/opdQueueDoc.test.ts`
- Modify: `client/src/theme/rawColours.test.ts:55`

**Interfaces:**
- Consumes: `clockText(minutes: number): string` (`@/lib/opdSchedule`), `dayLabel(day: string): string` (`@/lib/opdDay`), `sexLabel(raw: string | null | undefined): string` (`@/lib/sex`), `PRINT_FONT` (`@/lib/prescriptionDoc`).
- Produces: `buildQueueDoc(input: QueueDocInput): string` and the types below, used by Task 2.

```ts
export interface QueueDocRow { name: string; phone: string | null; age: number | null; gender: string | null }
export interface QueueDocInput {
  doctorName: string;            // "" prints no name line
  day: string;                   // yyyy-mm-dd
  rows: QueueDocRow[];           // serial order
  times: (number | undefined)[]; // minutes since midnight, index = row index; empty = none shown
}
```

- [ ] **Step 1: Write the failing test** — create `client/src/lib/opdQueueDoc.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildQueueDoc, type QueueDocRow } from "./opdQueueDoc";

const row = (name: string, over: Partial<QueueDocRow> = {}): QueueDocRow =>
  ({ name, phone: "01810101515", age: 34, gender: "Male", ...over });

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const cellsOf = (html: string) =>
  Array.from(parse(html).querySelectorAll("tbody tr")).map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent));

describe("buildQueueDoc", () => {
  it("heads the sheet with the doctor, the day and the number of patients", () => {
    const doc = parse(buildQueueDoc({ doctorName: "Dr. Rahim", day: "2026-10-30", rows: [row("A"), row("B")], times: [] }));
    const head = doc.querySelector("header")?.textContent ?? "";
    expect(head).toContain("Dr. Rahim");
    expect(head).toContain("30/10/2026");
    expect(head).toContain("2");
  });

  it("prints no name line when no doctor is known", () => {
    const doc = parse(buildQueueDoc({ doctorName: "", day: "2026-10-30", rows: [row("A")], times: [] }));
    expect(doc.querySelector("[data-doctor]")).toBeNull();
  });

  it("lists the six columns in the serial order given", () => {
    const html = buildQueueDoc({ doctorName: "", day: "2026-10-30", rows: [row("Zed"), row("Amy", { gender: "F", age: 7 })], times: [18 * 60, 18 * 60 + 10] });
    const heads = Array.from(parse(html).querySelectorAll("thead th")).map((th) => th.textContent);
    expect(heads).toEqual(["Serial", "Name", "Gender", "Age", "Mobile", "Appointment time"]);
    expect(cellsOf(html)).toEqual([
      ["1", "Zed", "Male", "34y", "01810101515", "6:00 PM"],
      ["2", "Amy", "Female", "7y", "01810101515", "6:10 PM"],
    ]);
  });

  it("shows a dash for what is not recorded, and for a time the screen does not show", () => {
    const html = buildQueueDoc({ doctorName: "", day: "2026-10-30", rows: [row("A", { phone: null, age: null, gender: null })], times: [] });
    expect(cellsOf(html)).toEqual([["1", "A", "—", "—", "—", "—"]]);
  });

  it("keeps an age of 0 (a newborn is not 'not recorded')", () => {
    expect(cellsOf(buildQueueDoc({ doctorName: "", day: "2026-10-30", rows: [row("A", { age: 0 })], times: [] }))[0][3]).toBe("0y");
  });

  it("escapes what was typed", () => {
    const html = buildQueueDoc({ doctorName: "Dr <b>X</b>", day: "2026-10-30", rows: [row("<img src=x onerror=alert(1)>", { phone: "&<" })], times: [] });
    const doc = parse(html);
    expect(doc.querySelector("img")).toBeNull();
    expect(doc.querySelector("b")).toBeNull();
    expect(cellsOf(html)[0][1]).toBe("<img src=x onerror=alert(1)>");
    expect(cellsOf(html)[0][4]).toBe("&<");
  });

  it("prints every one of 300 patients, whole", () => {
    const long = "Mohammad Abdul Rahman Chowdhury Al-Mamun bin Kashem ".repeat(3).trim();
    const rows = Array.from({ length: 300 }, (_, i) => row(i === 299 ? long : `Patient ${i + 1}`));
    const cells = cellsOf(buildQueueDoc({ doctorName: "", day: "2026-10-30", rows, times: [] }));
    expect(cells).toHaveLength(300);
    expect(cells[299][0]).toBe("300");
    expect(cells[299][1]).toBe(long);
  });

  it("is an A4 page whose table head repeats and whose rows do not split", () => {
    const html = buildQueueDoc({ doctorName: "", day: "2026-10-30", rows: [row("A")], times: [] });
    expect(html).toMatch(/@page\s*{\s*size:\s*A4/);
    expect(html).toMatch(/thead\s*{[^}]*display:\s*table-header-group/);
    expect(html).toMatch(/tr\s*{[^}]*break-inside:\s*avoid/);
    expect(html).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run src/lib/opdQueueDoc.test.ts`
Expected: FAIL — cannot find module `./opdQueueDoc`.

- [ ] **Step 3: Write the builder** — create `client/src/lib/opdQueueDoc.ts`:

```ts
// The printed OPD queue (physician's sheet, 28/10/2026, "Print Queue").
//
// ⚕️ A sheet that is handed to reception: it shows exactly what the queue holds.
// A value that is not recorded is a dash — never a guess — and a name is never
// cut to fit. The appointment time is the one the screen shows, worked out from
// the day's SAVED schedule by the caller; with none it is a dash.
//
// Like prescriptionDoc.ts it imports no theme: it is a printed page in a frame of
// its own, the same in both modes, and its colours are plain greys.

import { dayLabel } from "@/lib/opdDay";
import { clockText } from "@/lib/opdSchedule";
import { PRINT_FONT } from "@/lib/prescriptionDoc";
import { sexLabel } from "@/lib/sex";

export interface QueueDocRow { name: string; phone: string | null; age: number | null; gender: string | null }

export interface QueueDocInput {
  /** The practice's doctor. "" prints no name line. */
  doctorName: string;
  /** The queue day, yyyy-mm-dd. */
  day: string;
  /** In serial order. */
  rows: QueueDocRow[];
  /** Minutes since midnight, by row index; shorter than `rows` (or empty) = no time. */
  times: (number | undefined)[];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const DASH = "—";

export function buildQueueDoc({ doctorName, day, rows, times }: QueueDocInput): string {
  const body = rows
    .map((r, i) => {
      const t = times[i];
      const cells = [
        String(i + 1),
        r.name.trim() || DASH,
        sexLabel(r.gender),
        r.age == null ? DASH : `${r.age}y`,
        r.phone?.trim() || DASH,
        t === undefined ? DASH : clockText(t),
      ];
      return `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
    })
    .join("");

  const name = doctorName.trim();
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>OPD queue ${esc(dayLabel(day))}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: ${PRINT_FONT}; color: #1a1a1a; margin: 0; padding: 14mm; background: #fff; font-size: 13px; }
  header { margin-bottom: 14px; }
  .doctor { font-size: 18px; font-weight: 700; }
  .meta { margin-top: 4px; color: #444; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 12px; border-bottom: 1.5px solid #1a1a1a; padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 0.5px solid #bbb; vertical-align: top; overflow-wrap: anywhere; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  td:first-child, th:first-child { width: 48px; }
  @media print { body { padding: 0; } }
</style></head><body>
<header>
${name ? `<div class="doctor" data-doctor>${esc(name)}</div>` : ""}
<div class="meta">OPD queue · ${esc(dayLabel(day))} · Total patients: ${rows.length}</div>
</header>
<table>
<thead><tr><th>Serial</th><th>Name</th><th>Gender</th><th>Age</th><th>Mobile</th><th>Appointment time</th></tr></thead>
<tbody>${body}</tbody>
</table>
</body></html>`;
}
```

- [ ] **Step 4: Allow its greys** — in `client/src/theme/rawColours.test.ts`, change line 55 to:

```ts
const SKIP = /\.test\.|prescriptionDoc\.ts$|opdQueueDoc\.ts$|galleryPdf\.ts$|compressImage\.ts$|decodeImage\.ts$/;
```

(Reason, as for `prescriptionDoc.ts`: a printed page in its own frame, the same in both modes.)

- [ ] **Step 5: Run to verify it passes**

Run: `cd client && npx vitest run src/lib/opdQueueDoc.test.ts src/theme/rawColours.test.ts && npx tsc --noEmit`
Expected: all PASS, tsc clean.

- [ ] **Step 6: Check the test can fail** — in a COPY of the sources, never in the checkout (root CLAUDE.md), change `r.age == null` to `!r.age` and confirm "keeps an age of 0" goes red; change `esc` to return `s` and confirm "escapes" goes red.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/opdQueueDoc.ts client/src/lib/opdQueueDoc.test.ts client/src/theme/rawColours.test.ts
git commit -m "feat(opd): the printed queue sheet builder"
```

(message ends with the Co-Authored-By line from Global Constraints)

---

### Task 2: The button, and the modal's label

**Files:**
- Modify: `client/src/components/prescription/PrintSheetModal.tsx` (props, `aria-label`, iframe `title`)
- Modify: `client/src/components/prescription/PrintSheetModal.test.tsx`
- Modify: `client/src/components/tabs/OpdView.tsx`
- Create: `client/src/components/tabs/OpdView.print.test.tsx`

**Interfaces:**
- Consumes: `buildQueueDoc`, `QueueDocRow` from Task 1; `activeWorkstation` (`Workstation | null`, `.name`) from `useMuqsit()`; in `OpdView`: `queue`, `times`, `day`, `isLoading`, `error`.
- Produces: `PrintSheetModal` prop `label?: string` (default `"Prescription"`).

- [ ] **Step 1: Failing test for the modal label** — add to `PrintSheetModal.test.tsx` inside the first `describe`:

```tsx
  it("names itself by the label it is given, 'Prescription' by default", () => {
    const { unmount } = render(<PrintSheetModal html={SHEET} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Prescription" })).toBeTruthy();
    unmount();
    render(<PrintSheetModal html={SHEET} onClose={() => {}} label="OPD queue" />);
    expect(screen.getByRole("dialog", { name: "OPD queue" })).toBeTruthy();
    expect(screen.getByTitle("OPD queue")).toBeTruthy();
  });
```

Run: `cd client && npx vitest run src/components/prescription/PrintSheetModal.test.tsx` — Expected: the new test FAILS (no `label` prop).

- [ ] **Step 2: Implement the label** — in `PrintSheetModal.tsx` add `label = "Prescription"` to the destructured props, `label?: string;` (doc comment: "What the popup is called, for a screen reader. The sheet is a prescription unless a caller says otherwise.") to the prop types, and replace `aria-label="Prescription"` and `title="Prescription"` with `aria-label={label}` and `title={label}`. Run the file's tests: all PASS (the existing keyboard suite still finds "Prescription").

- [ ] **Step 3: Failing button tests** — create `client/src/components/tabs/OpdView.print.test.tsx`:

```tsx
// @vitest-environment jsdom
//
// "Print Queue" (physician's sheet, 28/10/2026): the open day's serial list on a
// sheet, behind the same preview as a prescription. Any day can be printed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dhakaToday, shiftDay } from "@/lib/opdDay";

const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  schedule: { startTime: "18:00", breakStart: null as string | null, breakEnd: null as string | null, minutesPerPatient: 10, saved: true },
  scheduleLoading: false,
  queueLoading: false,
  workstation: { doctorId: "d1", name: "Dr. Rahim", role: "owner", permissions: [] } as { name: string } | null,
}));

vi.mock("@/lib/api", () => ({ patientsApi: { byMobile: vi.fn(), relativesByMobile: () => Promise.resolve([]), create: vi.fn(), link: vi.fn(), get: vi.fn() } }));
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    setPtName: vi.fn(), setPtAge: vi.fn(), setPtGender: vi.fn(), setPtPhone: vi.fn(), setActiveTab: vi.fn(),
    setRxItems: vi.fn(), setCurrentPatientId: vi.fn(), setPtInfo: vi.fn(), resetEditor: vi.fn(), flushEditorDraft: vi.fn(), loadPatientById: vi.fn(),
    activeWorkstationId: null, activeWorkstation: mocks.workstation,
  }),
}));
vi.mock("@/hooks/useOpd", () => ({
  useOpdQueue: (day?: string) => ({ data: mocks.rows[day ?? ""] ?? [], isLoading: mocks.queueLoading, error: null, refetch: vi.fn(), isFetching: false }),
  useOpdSchedule: (day: string) => ({ data: mocks.scheduleLoading ? undefined : { day, ...mocks.schedule }, isLoading: mocks.scheduleLoading, error: null, refetch: vi.fn(), isFetching: false }),
  useAddOpdVisit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetOpdStatus: () => ({ mutate: vi.fn() }),
  useSetOpdPresence: () => ({ mutate: vi.fn() }),
  useMoveOpdVisit: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveOpdSchedule: () => ({ mutateAsync: vi.fn() }),
}));

import OpdView from "./OpdView";

vi.setConfig({ testTimeout: 30_000 });

const TODAY = dhakaToday();
const PAST = shiftDay(TODAY, -2);

const visit = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, token: "T-01", status: "waiting", type: "New", phone: "01810101515", age: 34, gender: "Male", patientId: id,
  rxStatus: null, queueDate: TODAY, position: null, presentAt: null, criticallyIll: false, urgent: false, ...over,
});

beforeEach(() => {
  mocks.rows = {};
  mocks.schedule = { startTime: "18:00", breakStart: null, breakEnd: null, minutesPerPatient: 10, saved: true };
  mocks.scheduleLoading = false;
  mocks.queueLoading = false;
  mocks.workstation = { name: "Dr. Rahim" };
});
afterEach(cleanup);

const printButton = () => screen.getByRole("button", { name: "Print Queue" }) as HTMLButtonElement;
const sheetText = () => (screen.getByTitle("OPD queue") as HTMLIFrameElement).contentDocument?.body.textContent ?? "";

describe("OPD queue — Print Queue", () => {
  it("is off while the day holds no one", () => {
    render(<OpdView />);
    expect(printButton().disabled).toBe(true);
  });

  it("opens a sheet of the day's patients with the workstation doctor's name and saved times", () => {
    mocks.rows[TODAY] = [visit("a", "Amy Khan"), visit("b", "Bob Roy", { age: null })];
    render(<OpdView />);
    expect(printButton().disabled).toBe(false);
    fireEvent.click(printButton());
    expect(screen.getByRole("dialog", { name: "OPD queue" })).toBeTruthy();
    const text = sheetText();
    expect(text).toContain("Dr. Rahim");
    expect(text).toContain("Amy Khan");
    expect(text).toContain("6:00 PM");
    expect(text).toContain("Bob Roy");
    expect(text).toContain("6:10 PM");
  });

  it("prints a day that has passed", () => {
    mocks.rows[PAST] = [visit("p", "Past Patient", { queueDate: PAST })];
    mocks.schedule = { ...mocks.schedule, saved: true };
    render(<OpdView />);
    fireEvent.click(screen.getByRole("button", { name: /^Date: / }));
    fireEvent.click(document.querySelector(`[data-day="${PAST}"]`) as Element);
    fireEvent.click(printButton());
    expect(sheetText()).toContain("Past Patient");
  });

  it("shows no time where the screen shows none (a past day never given a schedule)", () => {
    mocks.rows[PAST] = [visit("p", "Past Patient", { queueDate: PAST })];
    mocks.schedule = { ...mocks.schedule, saved: false };
    render(<OpdView />);
    fireEvent.click(screen.getByRole("button", { name: /^Date: / }));
    fireEvent.click(document.querySelector(`[data-day="${PAST}"]`) as Element);
    fireEvent.click(printButton());
    expect(sheetText()).not.toMatch(/\d:\d\d (AM|PM)/);
  });

  it("names no doctor when no workstation is chosen", () => {
    mocks.workstation = null;
    mocks.rows[TODAY] = [visit("a", "Amy Khan")];
    render(<OpdView />);
    fireEvent.click(printButton());
    expect(sheetText()).not.toContain("Dr.");
    expect(sheetText()).toContain("Amy Khan");
  });

  it("closes back to the queue", () => {
    mocks.rows[TODAY] = [visit("a", "Amy Khan")];
    render(<OpdView />);
    fireEvent.click(printButton());
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "OPD queue" })).toBeNull();
  });
});
```

Run: `cd client && npx vitest run src/components/tabs/OpdView.print.test.tsx` — Expected: FAIL (no "Print Queue" button).

- [ ] **Step 4: Wire `OpdView`** — in `client/src/components/tabs/OpdView.tsx`:

1. Imports: `import { buildQueueDoc } from "@/lib/opdQueueDoc";` and `import PrintSheetModal from "@/components/prescription/PrintSheetModal";`.
2. Destructure `activeWorkstation` from `useMuqsit()` (add to the existing list).
3. Beside `const [picking, setPicking]`: `const [printing, setPrinting] = useState(false);`
4. After the `times` const, build the sheet only when printing (so it is made from the rows as they are at the press and re-made if the list refreshes while it is open):

```tsx
  const queueSheet = printing
    ? buildQueueDoc({
        doctorName: activeWorkstation?.name ?? "",
        day,
        rows: queue.map((v) => ({ name: v.name, phone: v.phone, age: v.age, gender: v.gender })),
        times,
      })
    : null;
```

5. In the header's right-hand group, between the date button and "+ Add to queue", add:

```tsx
          <button
            type="button"
            aria-label="Print Queue"
            disabled={isLoading || queue.length === 0}
            onClick={() => setPrinting(true)}
            style={{ ...btnSecondary("md"), display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, ...(isLoading || queue.length === 0 ? btnDisabled : null) }}
          >
            <Icon name="printer" size={16} />
            Print Queue
          </button>
```

6. Next to `{picking && <OpdDayPicker …/>}` add:

```tsx
      {queueSheet !== null && <PrintSheetModal html={queueSheet} label="OPD queue" onClose={() => setPrinting(false)} />}
```

Note: `aria-label="Print Queue"` and the visible text match, so the name is the same either way.

- [ ] **Step 5: Run to verify**

Run: `cd client && npx vitest run src/components/tabs src/components/prescription/PrintSheetModal.test.tsx src/lib/opdQueueDoc.test.ts && npx tsc --noEmit`
Expected: all PASS (the other OpdView tests mock `useMuqsit` without `activeWorkstation`; `?.` keeps them green), tsc clean.

- [ ] **Step 6: Check the tests can fail** — in a COPY: make the button's `disabled` always `false` (the empty-day test goes red); take `times` out of the `buildQueueDoc` call (the times test goes red); use `user.displayName` instead of `activeWorkstation.name` is not testable here, so confirm by reading that `OpdView` never imports `useAuth`.

- [ ] **Step 7: Full client suite, then commit**

Run: `cd client && npm test`
Expected: all PASS.

```bash
git add client/src/components/prescription/PrintSheetModal.tsx client/src/components/prescription/PrintSheetModal.test.tsx client/src/components/tabs/OpdView.tsx client/src/components/tabs/OpdView.print.test.tsx
git commit -m "feat(opd): Print Queue button and preview"
```

---

### Task 3: Browser pass, docs, release

**Files:**
- Modify: `FUNCTIONAL-AUDIT.md` (OPD part; remove "Print Queue" from the "not built" lines at ~1311 and ~1328), `docs/DOMAIN.md` (line 18: drop "and 'Print Queue'" from "Not built", add one sentence on what Print Queue prints), `client/CLAUDE.md` (a short OPD entry: sheet is `opdQueueDoc.ts`, doctor from `activeWorkstation`, times from the saved schedule).
- Create: `e2e/tests/opd-print-queue.spec.ts` only if `e2e/README.md`'s journeys cover OPD in the same style as `opd-queue-day.spec.ts`; copy that spec's setup.

- [ ] **Step 1: Browser pass in a copy.** Copy the sources to a directory of its own with real `node_modules` (not a junction), delete any inherited `.env`, run a production build against the throwaway test DB (`docker compose -f docker-compose.test.yml up -d`, `cd server && npm run test:db`), then in the browser: seed 40 patients on a day (one with a 90-character name, one with no age, mobile and gender), open OPD → Print Queue, check on the preview that the head is there, the table head repeats on page 2, no name is cut, `—` stands for the missing values, then Ctrl+P / the Print button prints the sheet and not the app. Report what was not run (Safari, Firefox).
- [ ] **Step 2: Docs** as listed above, in the same commit as the feature (root CLAUDE.md, prime directive 7). In `FUNCTIONAL-AUDIT.md` add open items for the physician: the sheet prints no token/marks/status; the age is written `34y`; locked days can be printed.
- [ ] **Step 3: Verification before claiming done** (prime directive 6): `cd client && npx tsc --noEmit && npm test`; `cd server && npx tsc --noEmit -p tsconfig.json && npm test && npm run test:int` (the contract spec reads `client/src/lib/api.ts`; it is untouched, but run it); `cd e2e && npx playwright test` with nothing else editing the checkout (memory: no edits during the browser suite); a production build of the client (`NEXT_DIST_DIR=.next-verify npm run build` in `client/`, then delete the folder).
- [ ] **Step 4: Independent review** (user's release discipline): ask a subagent (`model: "opus"`, never Fable) to review the diff `git diff origin/dev..dev` against the spec, with the code, not this plan's conclusions. Fix what is found, re-run Step 3.
- [ ] **Step 5: Release only on the user's word.** `dev` and `main` are pushed together (main fast-forwarded), and a push is the deploy. Check `git config user.email` and `gh auth status`, and read `git show --stat` of each new commit against its message. After the Action goes green, open the OPD tab once in production and say that this was or was not done.

---

## Self-review (done)

- **Spec coverage:** header (doctor/day/count) → Task 1 test 1–2; six columns and order → test 3; `—` and time-less → test 4 and Task 2 "shows no time"; age 0, escaping, 300 rows, no truncation, A4/head/no-split → tests 5–8; saved-schedule times and past day → Task 2 tests; modal reuse and label → Task 2 steps 1–2; button off when empty → Task 2; doctor from workstation, none → no line → Task 1 test 2 and Task 2 test 5; `rawColours` → Task 1 step 4; docs, browser pass, review → Task 3. No server/API work, as the spec says.
- **Placeholders:** none; Task 3 steps are procedures, not code.
- **Types:** `QueueDocRow`/`QueueDocInput`/`buildQueueDoc` and `label` are named the same in every task.
