import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RxAlertBanner from "./RxAlertBanner";
import RxAlerts from "./RxAlerts";
import type { RxAlertInput } from "@/lib/rxAlerts";

// ⚕️ lib/rxAlerts.test.ts covers the matching; this covers the last hop — that
// what the matcher returns actually reaches the screen with the wording intact,
// and that a partial check says so instead of rendering a reassuring blank.
//
// Rendered to a static string via react-dom/server so it needs no DOM and no
// new dependency (the deploy is sensitive to lockfile drift, see root
// CLAUDE.md). createElement instead of JSX keeps this file off the app's
// jsx="preserve" tsconfig setting.

const render = (input: RxAlertInput) =>
  renderToStaticMarkup(createElement(RxAlertBanner, { input }));

const PREGNANT_RX: RxAlertInput = {
  rxDrugs: [{ text: "Tab. Entecavir 0.5mg" }],
  sidebar: [{ label: "History", items: ["28wk Pregnant"] }],
};

describe("RxAlertBanner", () => {
  it("renders nothing when there is no alert and nothing was unreadable", () => {
    expect(render({ rxDrugs: [{ text: "Tab. Napa 500mg" }], sidebar: [] })).toBe("");
  });

  it("shows the advice verbatim, prefixed by the MHS wording", () => {
    const html = render(PREGNANT_RX);
    expect(html).toContain("MHS is suggesting");
    expect(html).toContain(
      "Entecavir is contraindicated in pregnancy and lactation. Use tenofovir disoproxil.",
    );
  });

  it("does not echo the trigger back — only the rule's own wording renders", () => {
    // The "Because: …" evidence line was removed on 2026-08-16 at the
    // physician's request. Pinned so it does not creep back in.
    const html = render(PREGNANT_RX);
    expect(html).not.toContain("Because:");
    expect(html).not.toContain("Tab. Entecavir 0.5mg");
    expect(html).not.toContain("28wk Pregnant");
  });

  it("renders one block per distinct advice", () => {
    const html = render({
      rxDrugs: [{ text: "Velpatasvir" }, { text: "Omeprazole" }, { text: "Famotidine" }],
      sidebar: [],
    });
    expect(html).toContain("atleast 4 hours gap");
    expect(html).toContain("atleast 12 hours gap");
    expect(html.match(/MHS is suggesting/g)).toHaveLength(2);
  });

  it("never renders doctor-typed text, so typed markup cannot reach the banner", () => {
    // With the evidence line gone the banner shows only rule-sheet wording, so
    // nothing a doctor types is rendered at all. Assert the stronger property
    // (not present) rather than the old one (present but escaped).
    const html = render({
      rxDrugs: [{ text: "entecavir <img src=x onerror=alert(1)>" }],
      sidebar: [{ label: "History", items: ["Pregnant"] }],
    });
    expect(html).toContain("MHS is suggesting");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("&lt;img");
  });
});

describe("partial check notice", () => {
  // A corrupt stored value must never produce a clean empty banner: silence
  // reads as "no contraindication found", which is the one wrong message a
  // prescribing alert can send.
  const corrupt = { rxDrugs: [{ text: 42 }], sidebar: [] } as unknown as RxAlertInput;

  it("says the check was incomplete when a value could not be read", () => {
    const html = render(corrupt);
    expect(html).toContain("Prescribing check was incomplete");
    expect(html).toContain("1 stored entry");
  });

  it("still renders the notice when there are no alerts at all", () => {
    // No alert fired AND the input was unreadable — the dangerous combination.
    expect(render(corrupt)).not.toBe("");
  });

  it("pluralises the count", () => {
    const html = render(
      { rxDrugs: [{ text: 1 }, { text: 2 }, { text: 3 }], sidebar: [] } as unknown as RxAlertInput,
    );
    expect(html).toContain("3 stored entries");
  });

  it("shows the alert and the incomplete notice together", () => {
    const html = render({
      rxDrugs: [{ text: "Tab. Entecavir 0.5mg" }, { text: 42 }],
      sidebar: [{ label: "History", items: ["Pregnant"] }],
    } as unknown as RxAlertInput);
    expect(html).toContain("MHS is suggesting");
    expect(html).toContain("Prescribing check was incomplete");
  });
});

describe("RxAlerts (the wrapper the screens render)", () => {
  it("renders the banner through its error boundary", () => {
    const html = renderToStaticMarkup(createElement(RxAlerts, { input: PREGNANT_RX }));
    expect(html).toContain("MHS is suggesting");
    expect(html).toContain(
      "Entecavir is contraindicated in pregnancy and lactation. Use tenofovir disoproxil.",
    );
  });
});

// The entecavir/CKD advice is a CrCl dosing table. HTML collapses its newlines
// unless the text is rendered `pre-line`, and four dose bands run together into
// one sentence — so the style is pinned here, not left to a stylesheet tidy-up.
describe("RxAlertBanner: a message that is a dosing table", () => {
  const CKD_RX: RxAlertInput = {
    rxDrugs: [{ text: "Tab. Entecavir 0.5mg" }],
    sidebar: [{ label: "Final diagnosis", items: ["CKD"] }],
  };

  it("keeps every CrCl band, and the line breaks between them", () => {
    const html = render(CKD_RX);
    for (const band of [
      "CrCl at least 50 mL/min: 0.5 mg orally once a day",
      "CrCl 30 to less than 50 mL/min: 0.25 mg orally once a day or 0.5 mg orally every 48 hours",
      "CrCl 10 to less than 30 mL/min: 0.15 mg orally once a day or 0.5 mg orally every 72 hours",
      "CrCl less than 10 mL/min: 0.05 mg orally once a day or 0.5 mg orally every 7 days",
    ]) {
      expect(html).toContain(band);
    }
    expect(html).toContain("\n");
  });

  it("renders it with the whitespace preserved", () => {
    expect(render(CKD_RX)).toContain("white-space:pre-line");
  });
});
