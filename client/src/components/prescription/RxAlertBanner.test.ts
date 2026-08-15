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

  it("prints the evidence line so the doctor can check the trigger", () => {
    expect(render(PREGNANT_RX)).toContain("Because: Tab. Entecavir 0.5mg (℞) + 28wk Pregnant (History)");
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

  it("escapes doctor-typed text rather than interpolating it as markup", () => {
    // The evidence line echoes what was typed into the editor, and this string
    // reaches a shared practice feed. React escapes it — assert that here.
    const html = render({
      rxDrugs: [{ text: "entecavir <img src=x onerror=alert(1)>" }],
      sidebar: [{ label: "History", items: ["Pregnant"] }],
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
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
