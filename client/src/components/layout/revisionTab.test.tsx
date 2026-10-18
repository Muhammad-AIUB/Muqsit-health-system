// @vitest-environment jsdom
//
// "Revision Notes" (physician's sheet, 18/10/2026, item 4) is a tab of its own,
// in the place the sheet marked: at the end of the tab row, after BAN / EN and
// ☀ / ☾. It has a real URL like every tab, and on a phone it is reached from
// "More", like Patients.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let activeTab = "opd";
const setActiveTab = vi.fn();
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({ get activeTab() { return activeTab; }, setActiveTab }),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("./AccountMenu", () => ({ default: () => null }));
vi.mock("./MirrorToggle", () => ({ default: () => null }));
vi.mock("./PatientSearch", () => ({ default: () => null }));
vi.mock("./WorkstationSwitcher", () => ({ WorkstationIndicator: () => null }));
vi.mock("@/components/ipd/CriticalAlert", () => ({ default: () => null }));
vi.mock("@/components/prescription/PatientHeader", () => ({ default: () => null }));
vi.mock("@/components/prescription/PrescriptionView", () => ({ default: () => null }));
vi.mock("@/components/TabRouter", () => ({ default: () => null }));
vi.mock("@/components/investigation/InvestigationPopup", () => ({ default: () => null }));
vi.mock("@/components/examination/OePopup", () => ({ default: () => null }));

import DesktopShell from "./DesktopShell";
import { TAB_PATHS, tabFromPath } from "./tabs";

afterEach(() => { cleanup(); activeTab = "opd"; setActiveTab.mockClear(); });

describe("the Revision Notes tab", () => {
  it("has its own address", () => {
    expect(TAB_PATHS.revision).toBe("/revision-notes");
    expect(tabFromPath("/revision-notes")).toBe("revision");
  });

  it("stands at the end of the tab row, after the light / dark switch, and opens the notebook", () => {
    render(<DesktopShell />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const tab = screen.getByRole("button", { name: /Revision Notes/ });
    const night = screen.getByRole("button", { name: /dark|night/i });
    expect(nav.contains(tab)).toBe(true);
    // After the switch in document order.
    expect(night.compareDocumentPosition(tab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(tab);
    expect(setActiveTab).toHaveBeenCalledWith("revision");
  });

  it("is marked as the page when open", () => {
    activeTab = "revision";
    render(<DesktopShell />);
    expect(screen.getByRole("button", { name: /Revision Notes/ }).getAttribute("aria-current")).toBe("page");
  });
});
