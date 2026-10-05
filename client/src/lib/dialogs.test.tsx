// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import DialogHost from "@/components/common/DialogHost";
import { confirmAction, tell } from "./dialogs";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const box = () => screen.getByRole("alertdialog");
const press = (name: string) => act(async () => { fireEvent.click(screen.getByRole("button", { name })); });
// Raise a dialog and let the host draw it. The answer comes back wrapped: an
// async function that returned the promise itself would wait for the answer
// before the test had a chance to give one.
const raise = async <T,>(fn: () => Promise<T>) => {
  let answer!: Promise<T>;
  await act(async () => { answer = fn(); });
  return { answer };
};

describe("⚕️ the question is never skipped", () => {
  it("with no host on the page, confirmAction asks through the browser's own box and returns its answer", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(await confirmAction({ title: "Remove Rahim from Ward 3?", body: "You can undo this." })).toBe(true);
    expect(confirm).toHaveBeenLastCalledWith("Remove Rahim from Ward 3?\n\nYou can undo this.");
    expect(await confirmAction({ title: "Delete 2 selected templates?" })).toBe(false);
    expect(confirm).toHaveBeenLastCalledWith("Delete 2 selected templates?");
  });

  it("with no host, tell() says it through the browser's own box", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    await tell({ title: "2 images were NOT added", body: "A different patient was opened while uploading." });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith("2 images were NOT added\n\nA different patient was opened while uploading.");
  });

  it("a host that leaves with a question still open answers it NO, and hands a message to the browser's box", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { unmount } = render(<DialogHost />);
    const asked = await raise(() => confirmAction({ title: "Permanently remove Karim?", danger: true }));
    await act(async () => { void tell({ title: "The message was not sent." }); });
    unmount();
    expect(await asked.answer).toBe(false);
    expect(alert).toHaveBeenCalledWith("The message was not sent.");
  });
});

describe("confirmAction — the app's own box", () => {
  it("names the thing, explains it, and labels the button with the verb", async () => {
    render(<DialogHost />);
    const confirm = vi.spyOn(window, "confirm");
    await raise(() => confirmAction({ title: 'Delete the ward "Ward 3" and its team of 4?', body: "2 admitted patients will stay in IPD.", confirmLabel: "Delete ward", danger: true }));
    expect(confirm).not.toHaveBeenCalled();
    expect(box().getAttribute("aria-modal")).toBe("true");
    expect(box().textContent).toContain('Delete the ward "Ward 3" and its team of 4?');
    expect(box().textContent).toContain("2 admitted patients will stay in IPD.");
    expect(screen.getByRole("button", { name: "Delete ward" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    // The title and the explanation are what a screen reader announces.
    const label = document.getElementById(box().getAttribute("aria-labelledby")!);
    const desc = document.getElementById(box().getAttribute("aria-describedby")!);
    expect(label?.textContent).toBe('Delete the ward "Ward 3" and its team of 4?');
    expect(desc?.textContent).toBe("2 admitted patients will stay in IPD.");
  });

  it("resolves true only on the confirm button", async () => {
    render(<DialogHost />);
    const yes = await raise(() => confirmAction({ title: "Remove this page?", confirmLabel: "Remove" }));
    await press("Remove");
    expect(await yes.answer).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();

    const no = await raise(() => confirmAction({ title: "Remove this page?", confirmLabel: "Remove" }));
    await press("Cancel");
    expect(await no.answer).toBe(false);
  });

  it("Escape and a click on the backdrop both mean no", async () => {
    render(<DialogHost />);
    const a = await raise(() => confirmAction({ title: "Remove this page?" }));
    await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }); });
    expect(await a.answer).toBe(false);

    const b = await raise(() => confirmAction({ title: "Remove this page?" }));
    await act(async () => { fireEvent.click(box().parentElement!); });
    expect(await b.answer).toBe(false);
  });

  it("⚕️ when something is being taken away, Cancel holds the focus — a stray Enter keeps it", async () => {
    render(<DialogHost />);
    await raise(() => confirmAction({ title: "Permanently remove Karim?", confirmLabel: "Remove assistant", danger: true }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("an ordinary question starts on its confirm button", async () => {
    render(<DialogHost />);
    await raise(() => confirmAction({ title: "Discard your changes?", confirmLabel: "Discard" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Discard" }));
  });

  it("⚕️ Escape answers this box alone: a popup underneath that listens for Escape by itself stays open", async () => {
    render(<DialogHost />);
    const underneath = vi.fn();
    document.addEventListener("keydown", underneath);
    const asked = await raise(() => confirmAction({ title: "Remove this page?" }));
    await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }); });
    document.removeEventListener("keydown", underneath);
    expect(await asked.answer).toBe(false);
    expect(underneath).not.toHaveBeenCalled();
  });

  it("two questions are asked one at a time, in the order they were raised", async () => {
    render(<DialogHost />);
    const first = await raise(() => confirmAction({ title: "Remove Karim?", confirmLabel: "Remove" }));
    const second = await raise(() => confirmAction({ title: "Remove Rahim?", confirmLabel: "Remove" }));
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(box().textContent).toContain("Remove Karim?");
    await press("Remove");
    expect(await first.answer).toBe(true);
    expect(box().textContent).toContain("Remove Rahim?");
    await press("Cancel");
    expect(await second.answer).toBe(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("tell — a message that has to be read", () => {
  it("stays until OK, and a click on the backdrop does not dismiss it", async () => {
    render(<DialogHost />);
    let read = false;
    await act(async () => { void tell({ title: "Prescription saved, but the printable sheet could not be built.", body: "Open Preview PDF to print it." }).then(() => { read = true; }); });
    expect(box().textContent).toContain("Prescription saved, but the printable sheet could not be built.");
    expect(box().textContent).toContain("Open Preview PDF to print it.");
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

    await act(async () => { fireEvent.click(box().parentElement!); });
    expect(screen.queryByRole("alertdialog")).not.toBeNull();
    expect(read).toBe(false);

    await press("OK");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(read).toBe(true);
  });

  it("the same message raised again while it is waiting is one message, cleared by one OK", async () => {
    render(<DialogHost />);
    let cleared = 0;
    await act(async () => {
      for (let i = 0; i < 4; i++) void tell({ title: "The message was not sent." }).then(() => { cleared += 1; });
    });
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    await press("OK");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(cleared).toBe(4);
  });

  it("a different message is not swallowed: it waits its turn", async () => {
    render(<DialogHost />);
    await act(async () => {
      void tell({ title: "The file was not attached." });
      void tell({ title: "The message was not sent." });
    });
    expect(box().textContent).toContain("The file was not attached.");
    await press("OK");
    expect(box().textContent).toContain("The message was not sent.");
    await press("OK");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
