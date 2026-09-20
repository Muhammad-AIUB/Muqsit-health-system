import { describe, expect, it, vi } from "vitest";
import {
  ANALOGUE_UPLOAD,
  MAX_FILES_PER_BATCH,
  MAX_FILE_BYTES,
  THUMB_MAX_DIM,
  checkSheetFiles,
  describeOutcome,
  uploadSheetFiles,
  visibleSheets,
  withSheetLabel,
  withSheetRemoved,
  withSheetRestored,
} from "./ipdAnalogue";
import type { IpdAnalogueSheet } from "./api";

const file = (name: string, type: string, size = 1024): File =>
  ({ name, type, size }) as unknown as File;

const sheet = (id: string, extra: Partial<IpdAnalogueSheet> = {}): IpdAnalogueSheet => ({
  id,
  url: `/uploads/${id}.jpg`,
  addedAt: "2026-08-26T04:00:00.000Z",
  ...extra,
});

describe("checkSheetFiles", () => {
  it("takes the images and names what it refused, instead of refusing the batch", () => {
    const { accepted, rejected } = checkSheetFiles([
      file("page1.jpg", "image/jpeg"),
      file("orders.pdf", "application/pdf"),
      file("page2.png", "image/png"),
    ]);
    expect(accepted.map((f) => f.name)).toEqual(["page1.jpg", "page2.png"]);
    expect(rejected).toEqual([{ name: "orders.pdf", reason: "not an image" }]);
  });

  // iPhones produce HEIC. Refusing it would refuse the ward's phones.
  // (Since 2026-09-20 `compressImage` CONVERTS it to JPEG before upload rather
  // than passing it through — the ward PC's browser cannot draw HEIC either.)
  it("accepts HEIC", () => {
    expect(checkSheetFiles([file("IMG_0001.HEIC", "image/heic")]).accepted).toHaveLength(1);
  });

  // This panel used to keep its OWN format list, which had drifted from the
  // server's: GIF and BMP were stored happily by the API and called "not an
  // image" here, and TIFF — what the ward's scanner produces — was refused
  // everywhere. One table now (`lib/imageFormats.ts`).
  it.each([
    ["page.gif", "image/gif"],
    ["page.bmp", "image/bmp"],
    ["scan.tif", "image/tiff"],
    ["scan.TIFF", "image/tiff"],
    ["page.avif", "image/avif"],
    ["page.webp", "image/webp"],
  ])("accepts %s, which its own old list refused", (name, type) => {
    expect(checkSheetFiles([file(name, type)]).accepted).toHaveLength(1);
  });

  // A HEIC picked on Windows arrives with no usable MIME type at all. Matching
  // on `file.type` alone called the doctor's own photograph "not an image".
  it.each([
    ["IMG_0001.HEIC", "application/octet-stream"],
    ["scan.tif", "application/octet-stream"],
  ])("accepts %s when the browser sends octet-stream", (name, type) => {
    expect(checkSheetFiles([file(name, type)]).accepted).toHaveLength(1);
  });

  it("still refuses what is genuinely not an image", () => {
    const { accepted, rejected } = checkSheetFiles([
      file("orders.pdf", "application/pdf"),
      file("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      // ⚕️ SVG carries script and stored images render inline — it must never
      // become an accepted format on any screen.
      file("logo.svg", "image/svg+xml"),
    ]);
    expect(accepted).toHaveLength(0);
    expect(rejected.map((r) => r.name)).toEqual(["orders.pdf", "notes.docx", "logo.svg"]);
  });

  it("falls back to the extension when the browser gives no type", () => {
    const { accepted, rejected } = checkSheetFiles([
      file("dragged.jpg", ""),
      file("dragged.txt", ""),
    ]);
    expect(accepted.map((f) => f.name)).toEqual(["dragged.jpg"]);
    expect(rejected).toHaveLength(1);
  });

  // The server's limit is 8 MB on purpose; a 413 there reads as a broken app.
  it("refuses a file past the server's own limit, by name", () => {
    const { accepted, rejected } = checkSheetFiles([
      file("huge.jpg", "image/jpeg", MAX_FILE_BYTES + 1),
      file("ok.jpg", "image/jpeg", MAX_FILE_BYTES),
    ]);
    expect(accepted.map((f) => f.name)).toEqual(["ok.jpg"]);
    expect(rejected[0]).toEqual({ name: "huge.jpg", reason: "larger than 8 MB" });
  });

  it("caps the batch and says so for the overflow", () => {
    const many = Array.from({ length: MAX_FILES_PER_BATCH + 3 }, (_, i) =>
      file(`p${i}.jpg`, "image/jpeg"),
    );
    const { accepted, rejected } = checkSheetFiles(many);
    expect(accepted).toHaveLength(MAX_FILES_PER_BATCH);
    expect(rejected).toHaveLength(3);
    expect(rejected[0].reason).toContain("at once");
  });
});

describe("uploadSheetFiles", () => {
  it("asks for the readable size for the page and a small copy for the grid", async () => {
    const upload = vi.fn().mockResolvedValue("/uploads/x.jpg");
    await uploadSheetFiles([file("p.jpg", "image/jpeg")], upload);
    expect(upload).toHaveBeenNthCalledWith(1, expect.anything(), ANALOGUE_UPLOAD);
    expect(upload).toHaveBeenNthCalledWith(2, expect.anything(), { maxDim: THUMB_MAX_DIM, quality: 0.8 });
  });

  // ⚕️ The regression this replaces: Promise.all discarded five good pages
  // because the sixth failed.
  it("keeps every page that landed and names the one that did not", async () => {
    const files = Array.from({ length: 6 }, (_, i) => file(`p${i}.jpg`, "image/jpeg"));
    const upload = vi.fn().mockImplementation((f: File) =>
      f.name === "p2.jpg" ? Promise.reject(new Error("network")) : Promise.resolve(`/u/${f.name}`),
    );
    const { uploaded, failed } = await uploadSheetFiles(files, upload);
    expect(uploaded).toHaveLength(5);
    expect(failed).toEqual([{ name: "p2.jpg", reason: "network" }]);
  });

  it("still creates the page when only the THUMBNAIL fails", async () => {
    const upload = vi.fn().mockImplementation((_f: File, o?: { maxDim?: number }) =>
      o?.maxDim === THUMB_MAX_DIM ? Promise.reject(new Error("thumb")) : Promise.resolve("/u/full.jpg"),
    );
    const { uploaded, failed } = await uploadSheetFiles([file("p.jpg", "image/jpeg")], upload);
    expect(uploaded).toEqual([{ url: "/u/full.jpg" }]);
    expect(failed).toHaveLength(0);
  });

  it("creates NO page when the full image fails, even if the thumbnail would have worked", async () => {
    const upload = vi.fn().mockImplementation((_f: File, o?: { maxDim?: number }) =>
      o?.maxDim === THUMB_MAX_DIM ? Promise.resolve("/u/t.jpg") : Promise.reject(new Error("full")),
    );
    const { uploaded, failed } = await uploadSheetFiles([file("p.jpg", "image/jpeg")], upload);
    expect(uploaded).toHaveLength(0);
    expect(failed).toEqual([{ name: "p.jpg", reason: "full" }]);
  });
});

describe("describeOutcome", () => {
  it("always states how many pages landed", () => {
    expect(describeOutcome(1, [])).toBe("1 page added.");
    expect(describeOutcome(5, [])).toBe("5 pages added.");
    expect(describeOutcome(5, [{ name: "p2.jpg", reason: "network" }])).toBe(
      "5 added, 1 failed: p2.jpg (network)",
    );
    expect(describeOutcome(0, [{ name: "p.jpg", reason: "network" }])).toContain("Nothing was added");
  });
});

describe("the list rules", () => {
  const sheets = [sheet("a"), sheet("b", { removedAt: "2026-08-26T05:00:00.000Z" }), sheet("c")];

  it("hides a removed page without dropping it", () => {
    expect(visibleSheets(sheets).map((s) => s.id)).toEqual(["a", "c"]);
    expect(sheets).toHaveLength(3);
  });

  it("survives a missing or malformed list", () => {
    expect(visibleSheets(undefined)).toEqual([]);
    expect(visibleSheets(null)).toEqual([]);
    expect(visibleSheets("nope" as unknown as IpdAnalogueSheet[])).toEqual([]);
  });

  it("stamps who removed a page and when", () => {
    const out = withSheetRemoved([sheet("a")], "a", "2026-08-26T06:00:00.000Z", "doc_1");
    expect(out[0].removedAt).toBe("2026-08-26T06:00:00.000Z");
    expect(out[0].removedBy).toBe("doc_1");
  });

  // ⚕️ Undo has to give back the SAME page — same position, same label, same
  // original timestamp — or "restored" is a different document.
  it("restores a page in place, with its label and original timestamp", () => {
    const before = [sheet("a"), sheet("b", { label: "Day 3 night" }), sheet("c")];
    const removed = withSheetRemoved(before, "b", "2026-08-26T06:00:00.000Z", "doc_1");
    const restored = withSheetRestored(removed, "b");

    expect(restored.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(restored[1]).toEqual(before[1]);
    expect("removedAt" in restored[1]).toBe(false);
    expect("removedBy" in restored[1]).toBe(false);
  });

  it("sets, trims and clears a label", () => {
    const one = [sheet("a")];
    expect(withSheetLabel(one, "a", "  Day 3 night  ")[0].label).toBe("Day 3 night");
    expect("label" in withSheetLabel([sheet("a", { label: "x" })], "a", "   ")[0]).toBe(false);
  });

  it("touches only the page it was given", () => {
    const before = [sheet("a"), sheet("b")];
    expect(withSheetRemoved(before, "a", "t")[1]).toBe(before[1]);
    expect(withSheetLabel(before, "a", "x")[1]).toBe(before[1]);
  });
});
