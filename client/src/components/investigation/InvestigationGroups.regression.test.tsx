// @vitest-environment jsdom
//
// Regression for 82101b6 — "Investigation groups … refuse to save before the
// profile loads" (the LIST half; the refusal itself is pinned in
// InvestigationGroups.test.tsx and profileSaveGuard.test.tsx).
//
// When the profile failed to load, the tab showed "No investigation groups
// yet." — the same sentence as for a doctor who truly has none. On a clinical
// screen "you have none" and "we could not read them" must not look alike
// (client/CLAUDE.md says the same of suggestions): a doctor told they have no
// groups re-creates them, and that save replaces the whole stored list.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import InvestigationGroups from "./InvestigationGroups";

// A jsdom render of these screens takes seconds on the dev machine; the
// default 5 s is the failure mode there, not the code.
vi.setConfig({ testTimeout: 30_000 });

let prefs = { favourites: [], unitPrefs: {}, groups: [] as { name: string; tests: string[] }[], isLoading: false, loaded: true };
vi.mock("@/hooks/useInvestigationPrefs", () => ({
  useInvestigationPrefs: () => prefs,
  useSaveInvestigationGroups: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

const show = (over: Partial<typeof prefs>) => {
  prefs = { favourites: [], unitPrefs: {}, groups: [], isLoading: false, loaded: true, ...over };
  render(<InvestigationGroups selected={[]} apply={() => {}} />);
};

describe("82101b6: 'you have no groups' and 'your groups could not be loaded' are different sentences", () => {
  it("⚕️ a failed load says so, and does NOT claim there are no groups", () => {
    show({ loaded: false, isLoading: false });
    expect(screen.getByText("Could not load your investigation groups.")).toBeTruthy();
    expect(screen.queryByText("No investigation groups yet.")).toBeNull();
  });

  it("while loading, claims neither", () => {
    show({ loaded: false, isLoading: true });
    expect(screen.queryByText("Could not load your investigation groups.")).toBeNull();
    expect(screen.queryByText("No investigation groups yet.")).toBeNull();
  });

  it("a loaded, empty list says there are none", () => {
    show({ loaded: true, groups: [] });
    expect(screen.getByText("No investigation groups yet.")).toBeTruthy();
    expect(screen.queryByText("Could not load your investigation groups.")).toBeNull();
  });

  it("a loaded list shows the groups and neither message", () => {
    show({ loaded: true, groups: [{ name: "DM follow-up", tests: ["FBS", "HbA1c"] }] });
    expect(screen.getByLabelText("Add group DM follow-up")).toBeTruthy();
    expect(screen.queryByText("No investigation groups yet.")).toBeNull();
    expect(screen.queryByText("Could not load your investigation groups.")).toBeNull();
  });
});
