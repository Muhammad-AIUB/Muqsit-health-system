import { describe, expect, it } from "vitest";
import {
  hasImageUrl,
  hasValueLine,
  imageKeyFor,
  markerFor,
  nextImageKey,
  parseFindingKey,
  testImageKeys,
  testImageUrls,
} from "./investigationImages";

// These keys are written into saved prescriptions and drafts. A change here
// re-points which report a finding's 📎 opens, so treat a failure as a data
// regression, not a broken test.

const D = "05/06/2026";

describe("testImageKeys", () => {
  it("returns the base key first, then #N in numeric order", () => {
    const images = {
      [`${D}:CBC#3`]: "c",
      [`${D}:CBC`]: "a",
      [`${D}:CBC#2`]: "b",
    };
    expect(testImageKeys(images, D, "CBC")).toEqual([`${D}:CBC`, `${D}:CBC#2`, `${D}:CBC#3`]);
  });

  it("sorts #10 after #9, not after #1", () => {
    const images = {
      [`${D}:CBC#10`]: "j",
      [`${D}:CBC#9`]: "i",
      [`${D}:CBC`]: "a",
    };
    expect(testImageKeys(images, D, "CBC")).toEqual([`${D}:CBC`, `${D}:CBC#9`, `${D}:CBC#10`]);
  });

  it("does not match a different test whose name shares a prefix", () => {
    const images = {
      [`${D}:CT`]: "a",
      [`${D}:CT Orbits`]: "b",
      [`${D}:CT Orbits#2`]: "c",
    };
    expect(testImageKeys(images, D, "CT")).toEqual([`${D}:CT`]);
    expect(testImageKeys(images, D, "CT Orbits")).toEqual([`${D}:CT Orbits`, `${D}:CT Orbits#2`]);
  });

  it("ignores report-pool keys and other dates", () => {
    const images = {
      [`${D}:Report 1`]: "pool",
      [`${D}:Report 2`]: "pool",
      "06/06/2026:CBC": "otherday",
      [`${D}:CBC`]: "a",
    };
    expect(testImageKeys(images, D, "CBC")).toEqual([`${D}:CBC`]);
  });

  it("ignores a suffix that is not a plain integer >= 2", () => {
    const images = {
      [`${D}:CBC`]: "a",
      [`${D}:CBC#0`]: "zero",
      [`${D}:CBC#1`]: "one",
      [`${D}:CBC#`]: "bare",
      [`${D}:CBC#2x`]: "junk",
      [`${D}:CBC#2`]: "b",
    };
    expect(testImageKeys(images, D, "CBC")).toEqual([`${D}:CBC`, `${D}:CBC#2`]);
  });

  it("returns nothing when the test has no images", () => {
    expect(testImageKeys({}, D, "CBC")).toEqual([]);
  });
});

describe("testImageUrls", () => {
  it("returns the urls in key order", () => {
    const images = { [`${D}:CBC#2`]: "b", [`${D}:CBC`]: "a" };
    expect(testImageUrls(images, D, "CBC")).toEqual(["a", "b"]);
  });
});

describe("nextImageKey", () => {
  it("gives the unsuffixed key for the first image", () => {
    expect(nextImageKey({}, D, "CBC")).toBe(`${D}:CBC`);
  });

  it("gives #2 once the base is taken", () => {
    expect(nextImageKey({ [`${D}:CBC`]: "a" }, D, "CBC")).toBe(`${D}:CBC#2`);
  });

  it("fills the lowest gap rather than climbing past it", () => {
    // #2 was removed; the numbering must reuse the slot, never renumber #3.
    const images = { [`${D}:CBC`]: "a", [`${D}:CBC#3`]: "c" };
    expect(nextImageKey(images, D, "CBC")).toBe(`${D}:CBC#2`);
  });

  it("reuses the base slot when only the base was removed", () => {
    expect(nextImageKey({ [`${D}:CBC#2`]: "b" }, D, "CBC")).toBe(`${D}:CBC`);
  });
});

describe("hasImageUrl", () => {
  it("is true for a url already attached to this test", () => {
    const images = { [`${D}:CBC`]: "a", [`${D}:CBC#2`]: "b" };
    expect(hasImageUrl(images, D, "CBC", "b")).toBe(true);
  });

  it("is false for the same url attached only to another test", () => {
    const images = { [`${D}:CBC`]: "a", [`${D}:ESR`]: "b" };
    expect(hasImageUrl(images, D, "CBC", "b")).toBe(false);
  });
});

describe("parseFindingKey", () => {
  it("splits a dated test finding", () => {
    expect(parseFindingKey(`${D}:CBC:Hb:15.5g/dL`)).toEqual({ date: D, test: "CBC" });
  });

  it("rejects an image marker", () => {
    expect(parseFindingKey(`${D}:CBC${markerFor("")}`)).toBeNull();
    expect(parseFindingKey(markerFor(`${D}:CBC#2`))).toBeNull();
  });

  it("rejects free text with no test segment", () => {
    expect(parseFindingKey(`${D}:felt unwell after the scan`)).toBeNull();
  });
});

describe("hasValueLine", () => {
  const inv = [
    `${D}:CBC:Hb:15.5g/dL`,
    markerFor(`${D}:CBC`),
    markerFor(`${D}:ESR`),
  ];

  it("is true while a value line for that test+date survives", () => {
    expect(hasValueLine(inv, D, "CBC")).toBe(true);
  });

  it("is false for a test that only carries images", () => {
    expect(hasValueLine(inv, D, "ESR")).toBe(false);
  });

  it("is false for the same test on another date", () => {
    expect(hasValueLine(inv, "06/06/2026", "CBC")).toBe(false);
  });
});

describe("imageKeyFor", () => {
  it("never emits #1", () => {
    expect(imageKeyFor(D, "CBC", 1)).toBe(`${D}:CBC`);
    expect(imageKeyFor(D, "CBC", 2)).toBe(`${D}:CBC#2`);
  });
});
