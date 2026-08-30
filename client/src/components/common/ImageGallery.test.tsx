// @vitest-environment jsdom
//
// Only this file runs in jsdom. The rest of the suite stays on the node
// environment it has always passed in — a shared image gallery is not a reason
// to change how 291 existing tests execute.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ImageGallery, { type GalleryItem } from "./ImageGallery";

// ⚕️ This component is used by THREE screens: the patient's prescription
// gallery, their report gallery, and the ward's paper order sheet. Two of those
// were working, untested code before it was extracted — so these tests exist as
// much to protect them as to cover the new panel.

afterEach(cleanup);

const items: GalleryItem[] = [
  { id: "a", url: "/u/a.jpg", thumbUrl: "/u/a-t.jpg", caption: "26 Aug · 04:12" },
  { id: "b", url: "/u/b.jpg" },
  { id: "c", url: "/u/c.jpg", label: "Day 3 night" },
];

const base = {
  title: "All prescriptions(Image)",
  addLabel: "Add more",
  items,
  busy: false,
  onAddFiles: vi.fn(),
  onRemoveMany: vi.fn(),
  onOpen: vi.fn(),
  orientation: "landscape" as const,
  emptyText: "Nothing yet",
};

const imageFile = (name: string) =>
  new File(["x"], name, { type: "image/jpeg" });

const tile = (id: string) => screen.getByTestId(`gallery-tile-${id}`);
const imgIn = (id: string) => tile(id).querySelector("img") as HTMLImageElement;

describe("ImageGallery", () => {
  it("draws the small copy when there is one, and the full image when there is not", () => {
    render(<ImageGallery {...base} />);
    // A 150px square must not pull a 2400px page down a ward's wifi.
    expect(imgIn("a").getAttribute("src")).toBe("/u/a-t.jpg");
    expect(imgIn("b").getAttribute("src")).toBe("/u/b.jpg");
    expect(imgIn("a").getAttribute("loading")).toBe("lazy");
  });

  it("opens the viewer on the image that was CLICKED", () => {
    const onOpen = vi.fn();
    render(<ImageGallery {...base} onOpen={onOpen} />);
    fireEvent.click(tile("c"));
    expect(onOpen).toHaveBeenCalledWith(["/u/a.jpg", "/u/b.jpg", "/u/c.jpg"], 2);
  });

  it("uploads what the file picker gives it", () => {
    const onAddFiles = vi.fn();
    render(<ImageGallery {...base} onAddFiles={onAddFiles} />);
    fireEvent.change(screen.getByLabelText("Add more"), {
      target: { files: [imageFile("p1.jpg"), imageFile("p2.jpg")] },
    });
    expect(onAddFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(["p1.jpg", "p2.jpg"]);
  });

  it("uploads files dropped in from the desktop", () => {
    const onAddFiles = vi.fn();
    render(<ImageGallery {...base} onAddFiles={onAddFiles} />);
    fireEvent.drop(screen.getByTestId("image-gallery-drop"), {
      dataTransfer: { files: [imageFile("dropped.jpg")], types: ["Files"] },
    });
    expect(onAddFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(["dropped.jpg"]);
  });

  it("treats a file dropped ON a tile as an upload, not a reorder", () => {
    const onAddFiles = vi.fn();
    const onReorder = vi.fn();
    render(<ImageGallery {...base} onAddFiles={onAddFiles} onReorder={onReorder} />);
    fireEvent.drop(tile("b"), {
      dataTransfer: { files: [imageFile("dropped.jpg")], types: ["Files"] },
    });
    expect(onAddFiles).toHaveBeenCalledTimes(1);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("removes only what was selected, in Edit mode", () => {
    const onRemoveMany = vi.fn();
    render(<ImageGallery {...base} onRemoveMany={onRemoveMany} />);
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(tile("a"));
    fireEvent.click(tile("c"));
    fireEvent.click(screen.getByRole("button", { name: /Remove selected/ }));
    expect(onRemoveMany).toHaveBeenCalledWith(["a", "c"]);
  });

  it("reorders by drag when the caller allows it", () => {
    const onReorder = vi.fn();
    render(<ImageGallery {...base} onReorder={onReorder} />);
    fireEvent.dragStart(tile("c"));
    fireEvent.drop(tile("a"), { dataTransfer: { files: [], types: [] } });
    expect(onReorder).toHaveBeenCalledWith(["c", "a", "b"]);
  });

  // ⚕️ For the paper order sheet the list order IS the chronology of the ward
  // round. A draggable chronology on a medico-legal document is a way to
  // falsify it, so the panel turns reordering off — and it has to actually be
  // off, not just hidden.
  it("cannot be reordered when the caller turns it off", () => {
    const onReorder = vi.fn();
    render(<ImageGallery {...base} onReorder={onReorder} reorderable={false} />);
    expect(tile("a").getAttribute("draggable")).toBe("false");
    fireEvent.dragStart(tile("c"));
    fireEvent.drop(tile("a"), { dataTransfer: { files: [], types: [] } });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("saves a label on blur, and only when it changed", () => {
    const onLabel = vi.fn();
    render(<ImageGallery {...base} onLabel={onLabel} />);
    const box = screen.getByLabelText("Label for image 3") as HTMLInputElement;

    fireEvent.blur(box);
    expect(onLabel).not.toHaveBeenCalled(); // untouched — no write, no audit line

    fireEvent.change(box, { target: { value: "  Day 4 morning  " } });
    fireEvent.blur(box);
    expect(onLabel).toHaveBeenCalledWith("c", "Day 4 morning");
  });

  it("shows nothing that mutates when the caller has no permission", () => {
    render(<ImageGallery {...base} onLabel={vi.fn()} canEdit={false} />);
    expect(screen.queryByText("＋ Add more")).toBeNull();
    expect(screen.queryByText("✎ Edit")).toBeNull();
    expect(screen.queryByLabelText("Label for image 3")).toBeNull();
    // Viewing is never gated: the pages are still there and still open.
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByText("Day 3 night")).toBeTruthy();
  });

  it("does not accept a drop when the caller has no permission", () => {
    const onAddFiles = vi.fn();
    render(<ImageGallery {...base} onAddFiles={onAddFiles} canEdit={false} />);
    fireEvent.drop(screen.getByTestId("image-gallery-drop"), {
      dataTransfer: { files: [imageFile("dropped.jpg")], types: ["Files"] },
    });
    expect(onAddFiles).not.toHaveBeenCalled();
  });

  it("shows the caller's empty text when there is nothing yet", () => {
    render(<ImageGallery {...base} items={[]} />);
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    expect(screen.queryByText("✎ Edit")).toBeNull();
  });
});

// ⚕️ The ward's paper order sheet is a handwritten document, not a picture:
// the doctor has to make it out from the grid, and a tile that crops it can
// hide the very line carrying a dose. Both are opt-in — the patient's
// prescription and report galleries are index grids and stay as they were.
describe("ImageGallery — tile size and fit", () => {
  it("draws a small, cropped tile by default", () => {
    render(<ImageGallery {...base} />);
    expect(tile("a").style.width).toBe("150px");
    expect(tile("a").style.height).toBe("110px");
    expect(imgIn("a").style.objectFit).toBe("cover");
  });

  it("draws a big tile showing the WHOLE page when the caller asks for one", () => {
    render(<ImageGallery {...base} orientation="portrait" size="lg" fit="contain" />);
    expect(tile("a").style.width).toBe("270px");
    expect(tile("a").style.height).toBe("370px");
    expect(imgIn("a").style.objectFit).toBe("contain");
  });

  it("still opens the page that was clicked, at any size", () => {
    const onOpen = vi.fn();
    render(<ImageGallery {...base} orientation="portrait" size="lg" fit="contain" onOpen={onOpen} />);
    fireEvent.click(tile("b"));
    expect(onOpen).toHaveBeenCalledWith(["/u/a.jpg", "/u/b.jpg", "/u/c.jpg"], 1);
  });
});
