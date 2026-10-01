// @vitest-environment jsdom
//
// Regression for 35e7039 — "Favourites/units refuse to save before the profile
// loads" (the screen half; the hook half is pinned in useInvestigationPrefs.test.tsx).
//
// Every save from this screen sends the WHOLE favourites list / unit map. While
// the profile is loading, or after it failed to load, `favourites` is an empty
// stand-in — so one tap on a star used to save a one-item list over the
// doctor's real one. The fix: nothing is toggleable until the real list is in
// hand, and a failed load says so instead of showing an empty, clickable page.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FavouriteSettingsView from "./FavouriteSettingsView";
import { INV_CATS } from "@/data/investigations";

// A jsdom render of these screens takes seconds on the dev machine; the
// default 5 s is the failure mode there, not the code.
vi.setConfig({ testTimeout: 30_000 });

const saveFav = vi.fn();
const saveUnits = vi.fn();
let prefs: { favourites: string[]; unitPrefs: Record<string, string>; isLoading: boolean; loaded: boolean };
vi.mock("@/hooks/useInvestigationPrefs", () => ({
  useInvestigationPrefs: () => prefs,
  useSaveFavourites: () => ({ mutate: saveFav, isError: false }),
  useSaveUnitPrefs: () => ({ mutate: saveUnits, isError: false }),
}));

// The first browsable category and its first test — read from the catalogue,
// so this never hard-codes (or depends on) a clinical name.
const firstCat = INV_CATS.find((c) => c.cat !== "Favourite" && c.tests.length > 0)!;
const firstTest = firstCat.tests[0].name;

beforeEach(() => { saveFav.mockReset(); saveUnits.mockReset(); });
afterEach(cleanup);

describe("35e7039: favourites cannot be changed before the doctor's own list has loaded", () => {
  it("⚕️ after a failed load: says so, offers nothing to tap, and saves nothing", () => {
    prefs = { favourites: [], unitPrefs: {}, isLoading: false, loaded: false };
    render(<FavouriteSettingsView onBack={() => {}} />);
    expect(screen.getByText(/could not be loaded/)).toBeTruthy();
    expect(screen.getByText("Not available until your favourites load.")).toBeTruthy();
    // The star list is not rendered at all — there is no row to tap.
    expect(screen.queryByText("☆")).toBeNull();
    expect(screen.queryByText(firstTest)).toBeNull();
    expect(saveFav).not.toHaveBeenCalled();
  });

  it("while loading: shows Loading…, not an empty tappable list", () => {
    prefs = { favourites: [], unitPrefs: {}, isLoading: true, loaded: false };
    render(<FavouriteSettingsView onBack={() => {}} />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByText(firstTest)).toBeNull();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
  });

  it("once loaded: a tap adds to the list that was loaded, keeping what was already there", () => {
    prefs = { favourites: ["Already a favourite"], unitPrefs: {}, isLoading: false, loaded: true };
    render(<FavouriteSettingsView onBack={() => {}} />);
    fireEvent.click(screen.getByText(firstTest));
    expect(saveFav).toHaveBeenCalledTimes(1);
    expect(saveFav).toHaveBeenCalledWith(["Already a favourite", firstTest]);
  });

  it("once loaded: removing a favourite sends the rest of the list, not an empty one", () => {
    prefs = { favourites: ["Keep me", "Drop me"], unitPrefs: {}, isLoading: false, loaded: true };
    render(<FavouriteSettingsView onBack={() => {}} />);
    fireEvent.click(screen.getAllByTitle("Remove from favourites")[1]);
    expect(saveFav).toHaveBeenCalledWith(["Keep me"]);
  });
});
