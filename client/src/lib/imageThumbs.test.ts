import { describe, expect, it } from "vitest";
import { mergeThumbs, safeThumbMap, thumbFor } from "./imageThumbs";

// `imageThumbs` is a Json column: it arrives as `unknown` and is read inside
// the patient records screen, where an uncaught render error unmounts the whole
// tree. So the reader has to survive everything, not just the happy shape.
describe("safeThumbMap", () => {
  it("reads a stored map", () => {
    expect(safeThumbMap({ "/u/a.jpg": "/u/a-t.jpg" })).toEqual({ "/u/a.jpg": "/u/a-t.jpg" });
  });

  it("is empty for anything that is not a map", () => {
    for (const junk of [null, undefined, 0, "", "x", true, [], [1, 2], NaN]) {
      expect(safeThumbMap(junk)).toEqual({});
    }
  });

  it("drops the entries it cannot use and keeps the rest", () => {
    expect(
      safeThumbMap({
        "/u/a.jpg": "/u/a-t.jpg",
        "/u/b.jpg": null,
        "/u/c.jpg": 42,
        "/u/d.jpg": "",
        "": "/u/e-t.jpg",
        "/u/f.jpg": { url: "/u/f-t.jpg" },
        "/u/g.jpg": "/u/g-t.jpg",
      }),
    ).toEqual({ "/u/a.jpg": "/u/a-t.jpg", "/u/g.jpg": "/u/g-t.jpg" });
  });
});

describe("mergeThumbs", () => {
  it("adds to what is stored without disturbing it", () => {
    expect(mergeThumbs({ "/u/a.jpg": "/u/a-t.jpg" }, { "/u/b.jpg": "/u/b-t.jpg" })).toEqual({
      "/u/a.jpg": "/u/a-t.jpg",
      "/u/b.jpg": "/u/b-t.jpg",
    });
  });

  it("starts from nothing when the stored value is unreadable", () => {
    expect(mergeThumbs("corrupt", { "/u/b.jpg": "/u/b-t.jpg" })).toEqual({ "/u/b.jpg": "/u/b-t.jpg" });
  });

  // An image removed from the gallery leaves its entry behind. Sweeping those
  // up would mean deciding, from a display map, which of a patient's images no
  // longer exist — and a stale entry costs nothing: it is never looked up.
  it("leaves an orphaned entry alone", () => {
    expect(mergeThumbs({ "/u/gone.jpg": "/u/gone-t.jpg" }, {})).toEqual({
      "/u/gone.jpg": "/u/gone-t.jpg",
    });
  });
});

describe("thumbFor", () => {
  it("gives the small copy when there is one, and nothing when there is not", () => {
    const map = { "/u/a.jpg": "/u/a-t.jpg" };
    expect(thumbFor(map, "/u/a.jpg")).toBe("/u/a-t.jpg");
    // Every image stored before this column has no entry — the gallery falls
    // back to the full image, exactly as it always did.
    expect(thumbFor(map, "/u/old.jpg")).toBeUndefined();
  });
});
