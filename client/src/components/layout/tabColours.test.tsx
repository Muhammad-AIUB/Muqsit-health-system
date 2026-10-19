// @vitest-environment jsdom
//
// The physician's sheet of 15/10/2026, item 3: "Ai tabgulo vitore color koro,
// lekha black koro" — colour INSIDE the chosen tab, and the words black. The
// chosen tab was a pale tint (`pri[50]`) with blue words beside grey ones, and
// on the BAN / EN and Inch / cm switches the chosen side could not be told at a
// glance. One look for all of them, from `tabOn` / `tabInk` in theme/styles:
// the chosen tab is filled `pri[100]` (blue is what is pressed or selected), and
// every tab that can be pressed is written in `n[900]`. A tab that cannot be
// pressed stays grey.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { C } from "@/theme";
import { tabInk, tabOn } from "@/theme/styles";

let activeTab = "opd";
const setActiveTab = vi.fn();
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    get activeTab() { return activeTab; },
    setActiveTab,
    setRxItems: vi.fn(),
    rxItems: [],
    ptDate: "2026-10-15",
    can: () => true,
    canEditLabel: () => true,
    addDrugHistoryEntries: vi.fn(() => true),
  }),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useMedicineSearch", () => ({ useMedicineSearch: () => ({ results: [], isLoading: false }) }));
vi.mock("@/hooks/useFieldRecents", () => ({ useFieldRecents: () => ({ getRecents: () => [], addRecents: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));
// The shells draw whole screens around their tab bars; only the bars are tried here.
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

import ThemeToggle from "./ThemeToggle";
import { LanguageToggle } from "./BanglaTyping";
import DesktopShell from "./DesktopShell";
import MobileShell from "./MobileShell";
import DrugHistoryField from "@/components/prescription/DrugHistoryField";
import { UnitToggle } from "@/components/tabs/PrescriptionSettingsView";
import ExpandableField from "@/components/common/ExpandableField";

afterEach(() => { cleanup(); activeTab = "opd"; setActiveTab.mockClear(); });

const filled = (el: HTMLElement) => {
  expect(el.style.background).toBe(C.pri[100]);
  expect(el.style.color).toBe(C.n[900]);
};
const black = (el: HTMLElement) => expect(el.style.color).toBe(C.n[900]);

describe("the shared look", () => {
  it("is a pri[100] fill with n[900] words", () => {
    expect(tabOn).toEqual({ background: C.pri[100], color: C.n[900] });
    expect(tabInk).toBe(C.n[900]);
  });
});

describe("the switches in the picture", () => {
  it("BAN / EN: the chosen side is filled, both are black", () => {
    render(<LanguageToggle />);
    const en = screen.getByRole("button", { name: "EN" });
    const ban = screen.getByRole("button", { name: "BAN" });
    expect(en.getAttribute("aria-pressed")).toBe("true");
    filled(en);
    black(ban);
    expect(ban.style.background).not.toBe(C.pri[100]);
  });

  it("☀ / ☾: the chosen side is filled, both are black", () => {
    render(<ThemeToggle />);
    filled(screen.getByRole("button", { name: "Light mode" }));
    black(screen.getByRole("button", { name: "Night mode" }));
  });

  it("Inch / cm: the chosen unit is filled, both are black", () => {
    render(<UnitToggle unit="cm" onChange={vi.fn()} />);
    filled(screen.getByRole("button", { name: "cm" }));
    const inch = screen.getByRole("button", { name: "Inch" });
    black(inch);
    expect(inch.style.background).not.toBe(C.pri[100]);
  });
});

describe("the four tab sets", () => {
  it("main tabs on a computer: the open one is filled, the others black, a disabled one grey", () => {
    render(<DesktopShell />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const opd = Array.from(nav.querySelectorAll("button")).find((b) => b.textContent === "OPD")!;
    const ipd = Array.from(nav.querySelectorAll("button")).find((b) => b.textContent === "IPD")!;
    const research = Array.from(nav.querySelectorAll("button")).find((b) => (b.textContent ?? "").startsWith("Research"))!;
    filled(opd);
    black(ipd);
    expect(research.style.color).toBe(C.n[400]);
  });

  it("main tabs on a phone: the open one's pill is filled and its words black", () => {
    render(<MobileShell />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const opd = Array.from(nav.querySelectorAll("button")).find((b) => b.textContent === "OPD")!;
    const ipd = Array.from(nav.querySelectorAll("button")).find((b) => b.textContent === "IPD")!;
    expect((opd.querySelector(".mnav-pill") as HTMLElement).style.background).toBe(C.pri[100]);
    black(opd);
    black(ipd);
  });

  it("Drug history: Current medications / Distant past", () => {
    render(<DrugHistoryField items={["10/01/2024: Losartan 50mg — 1+0+1 — after food — continuing"]} />);
    fireEvent.click(screen.getAllByRole("button").find((b) => /current/.test(b.textContent ?? ""))!);
    const current = screen.getByRole("button", { name: /^Current medications/ });
    const past = screen.getByRole("button", { name: /^Distant past medication/ });
    filled(current);
    black(past);
    fireEvent.click(past);
    filled(past);
    black(current);
  });

  it("patient sub-tabs: the open one is filled, the others black", async () => {
    // PatientHeader is stubbed above for the shells; its style is read from the real file.
    const { subNav } = await vi.importActual<typeof import("@/components/prescription/PatientHeader")>("@/components/prescription/PatientHeader");
    filled(asEl(subNav(true)));
    black(asEl(subNav(false)));
  });

  it("Advised tests: Investigations / Investigations group", () => {
    render(<ExpandableField label="Advised tests / investigation" items={[]} setItems={vi.fn()} investigationTabs />);
    fireEvent.click(screen.getByRole("button", { name: "Add Advised tests / investigation" }));
    const items = screen.getByRole("tab", { name: "Investigations" });
    const groups = screen.getByRole("tab", { name: "Investigations group" });
    filled(items);
    black(groups);
  });
});

// A style object read the way the render tests read an element's inline style.
function asEl(style: React.CSSProperties): HTMLElement {
  const el = document.createElement("button");
  Object.assign(el.style, style);
  return el;
}
