// @vitest-environment jsdom
//
// "Mirror devices" in the header: a switch, and nothing but a switch.
//
// It was a <label> with a click handler and no control inside it — a switch
// drawn as a caption. That cost two things. It had no keyboard route at all
// (a label is not a Tab stop, and Enter on it does nothing). And when a
// caption learnt to put the cursor in the box after it (`lib/captionFocus.ts`),
// every press on this one turned mirroring on AND sent the cursor into the
// patient search beside it, which reopened its list — on a tablet, with the
// keyboard coming up over the page. Found in review, before it was released.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { installCaptionFocus } from "@/lib/captionFocus";

const state = vi.hoisted(() => ({
  tier: "primary" as string,
  store: { mirrorOn: false, setMirrorOn: vi.fn(), mirrorConnId: "conn-1" as string | null },
  publish: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { accountTier: state.tier } }) }));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => state.store }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  mirrorApi: { publish: state.publish },
}));

import MirrorToggle from "./MirrorToggle";

let uninstall: () => void;
beforeEach(() => {
  state.tier = "primary";
  state.store = { mirrorOn: false, setMirrorOn: vi.fn(), mirrorConnId: "conn-1" };
  state.publish.mockClear();
  uninstall = installCaptionFocus();
});
afterEach(() => { uninstall(); cleanup(); });

// The header as it is drawn for a doctor with one practice: the switch, and
// straight after it the patient search (the workstation pill renders nothing).
const header = () =>
  render(
    <div>
      <MirrorToggle />
      <div><input aria-label="Search by mobile / NID" /></div>
    </div>,
  );

describe("Mirror devices — a switch", () => {
  it("is a real button that says it is a switch and whether it is on", () => {
    header();
    const sw = screen.getByRole("switch", { name: /Mirror devices/ });
    expect(sw.tagName).toBe("BUTTON");
    expect(sw.getAttribute("type")).toBe("button");
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });

  it("says ON when mirroring is on", () => {
    state.store.mirrorOn = true;
    header();
    expect(screen.getByRole("switch", { name: /Mirror devices/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("a press turns mirroring on and tells the other devices — once", () => {
    header();
    fireEvent.click(screen.getByRole("switch", { name: /Mirror devices/ }));
    expect(state.store.setMirrorOn).toHaveBeenCalledTimes(1);
    expect(state.store.setMirrorOn).toHaveBeenCalledWith(true);
    expect(state.publish).toHaveBeenCalledTimes(1);
    expect(state.publish).toHaveBeenCalledWith("conn-1", "toggle", { on: true });
  });

  it("with no live connection it still switches, and sends nothing", () => {
    state.store.mirrorConnId = null;
    header();
    fireEvent.click(screen.getByRole("switch", { name: /Mirror devices/ }));
    expect(state.store.setMirrorOn).toHaveBeenCalledWith(true);
    expect(state.publish).not.toHaveBeenCalled();
  });

  it("⚕️ a press does NOT send the cursor into the patient search beside it", () => {
    header();
    const search = screen.getByLabelText("Search by mobile / NID");
    fireEvent.click(screen.getByRole("switch", { name: /Mirror devices/ }));
    expect(document.activeElement).not.toBe(search);
    // …nor a press on the words or the tick inside it.
    fireEvent.click(screen.getByText("Mirror devices"));
    expect(document.activeElement).not.toBe(search);
  });

  it("is offered to a primary account only", () => {
    state.tier = "secondary";
    header();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("Mirror devices")).toBeNull();
  });
});
