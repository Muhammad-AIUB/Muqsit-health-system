// @vitest-environment jsdom
//
// Physician's sheet 07/11/2026: Permissions (a gallery of the signed papers) and
// Imaging DICOM (upload with a name and a date, icons below, a viewer).
// What is pinned: the section is closed until opened, the buttons follow the
// patient-file access, an upload sends the name and the date as typed, and a
// removal asks first.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({ list: vi.fn(), upload: vi.fn(), remove: vi.fn(), confirm: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<object>()),
  patientFilesApi: { list: api.list, upload: api.upload, remove: api.remove },
}));
vi.mock("@/lib/dialogs", async (orig) => ({ ...(await orig<object>()), confirmAction: api.confirm, tell: vi.fn() }));
let access = true;
vi.mock("@/hooks/usePatientFileAccess", () => ({ usePatientFileAccess: () => access }));
let ctx: Record<string, unknown>;
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ctx }));
vi.mock("./DicomViewer", () => ({ default: (p: { url: string; title: string }) => <div data-testid="viewer">{p.title} {p.url}</div> }));
vi.mock("@/components/common/ImageGallery", () => ({
  default: (p: { title: string; items: { id: string }[]; collapsed?: boolean; canEdit?: boolean; onToggleCollapsed?: () => void; onAddFiles: (f: File[]) => void }) => (
    <div>
      <button aria-expanded={!p.collapsed} onClick={p.onToggleCollapsed}>{p.title}</button>
      {!p.collapsed && <div data-testid="tiles">{p.items.length} tiles · canEdit={String(p.canEdit)}</div>}
    </div>
  ),
}));

import DicomSection from "./DicomSection";
import PermissionsSection from "./PermissionsSection";

const wrap = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });
const row = { id: "f1", kind: "dicom", name: "MRI whole abdomen", fileDate: "02/09/2026", url: "https://api.example/uploads/a.dcm", size: 5242880, addedByName: "Dr. A", createdAt: "2026-09-02T00:00:00Z" };

beforeEach(() => {
  access = true;
  ctx = { currentPatientId: "A", ptName: "Test" };
  api.list.mockReset(); api.list.mockResolvedValue([row]);
  api.upload.mockReset(); api.upload.mockResolvedValue(row);
  api.remove.mockReset(); api.remove.mockResolvedValue({ ok: true });
  api.confirm.mockReset(); api.confirm.mockResolvedValue(true);
});
afterEach(cleanup);

describe("Imaging DICOM", () => {
  it("closed it asks for nothing; opened it lists the files as name + date, and a press opens the viewer", async () => {
    const { rerender } = render(<DicomSection open={false} onToggle={() => {}} />, { wrapper: wrap });
    await flush();
    expect(api.list).not.toHaveBeenCalled();
    rerender(<DicomSection open onToggle={() => {}} />);
    await flush();
    expect(api.list).toHaveBeenCalledWith("A", "dicom");
    expect(screen.getByText("MRI whole abdomen")).toBeTruthy();
    expect(screen.getByText("02/09/2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open MRI whole abdomen, 02/09/2026" }));
    expect((await screen.findByTestId("viewer")).textContent).toContain("https://api.example/uploads/a.dcm");
  });

  it("upload: the name and the date go as typed, and Upload waits for a file", async () => {
    render(<DicomSection open onToggle={() => {}} />, { wrapper: wrap });
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Upload DICOM/ }));
    const dlg = screen.getByRole("dialog", { name: "Upload DICOM file" });
    const go = dlg.querySelector("button:not([aria-label])") as HTMLButtonElement;
    expect(go.textContent).toBe("Upload");
    expect(go.disabled).toBe(true);
    const file = new File([new Uint8Array(4)], "IM0001.dcm");
    fireEvent.change(screen.getByLabelText("DICOM file"), { target: { files: [file] } });
    const name = screen.getByPlaceholderText("e.g. MRI whole abdomen") as HTMLInputElement;
    expect(name.value).toBe("IM0001"); // from the file name, to be changed
    fireEvent.change(name, { target: { value: "PET CT" } });
    expect(go.disabled).toBe(false);
    await act(async () => { fireEvent.click(go); });
    await flush();
    expect(api.upload).toHaveBeenCalledTimes(1);
    const [pid, kind, sent, meta] = api.upload.mock.calls[0];
    expect([pid, kind, sent]).toEqual(["A", "dicom", file]);
    expect(meta.name).toBe("PET CT");
    expect(meta.fileDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("a refused upload says why and keeps the box open", async () => {
    const { ApiError } = await import("@/lib/api");
    api.upload.mockRejectedValue(new ApiError(400, "That file is not a DICOM file (it has no DICM marker)."));
    render(<DicomSection open onToggle={() => {}} />, { wrapper: wrap });
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Upload DICOM/ }));
    fireEvent.change(screen.getByLabelText("DICOM file"), { target: { files: [new File([new Uint8Array(4)], "x.dcm")] } });
    const go = screen.getByRole("dialog", { name: "Upload DICOM file" }).querySelector("button:not([aria-label])") as HTMLButtonElement;
    await act(async () => { fireEvent.click(go); });
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("no DICM marker");
    expect(screen.getByRole("dialog", { name: "Upload DICOM file" })).toBeTruthy();
  });

  it("remove asks first; a no removes nothing, a yes removes that file", async () => {
    render(<DicomSection open onToggle={() => {}} />, { wrapper: wrap });
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "✎ Edit" }));
    api.confirm.mockResolvedValueOnce(false);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Remove MRI whole abdomen" })); });
    expect(api.remove).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Remove MRI whole abdomen" })); });
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("A", "f1"));
  });

  it("someone who may not write is offered no upload and no edit", async () => {
    access = false;
    render(<DicomSection open onToggle={() => {}} />, { wrapper: wrap });
    await flush();
    expect((screen.getByRole("button", { name: /Upload DICOM/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "✎ Edit" })).toBeNull();
  });

  it("no patient loaded: nothing is asked of the server", async () => {
    ctx = { currentPatientId: null, ptName: "" };
    render(<DicomSection open onToggle={() => {}} />, { wrapper: wrap });
    await flush();
    expect(api.list).not.toHaveBeenCalled();
    expect(screen.getByText(/Load a saved patient/)).toBeTruthy();
  });
});

describe("Permissions", () => {
  it("is a gallery of the filed pictures, asked for only once opened, and editable only with access", async () => {
    api.list.mockResolvedValue([{ ...row, kind: "permission", id: "p1" }, { ...row, kind: "permission", id: "p2" }]);
    const { rerender } = render(<PermissionsSection open={false} onToggle={() => {}} onOpenImage={() => {}} />, { wrapper: wrap });
    await flush();
    expect(api.list).not.toHaveBeenCalled();
    rerender(<PermissionsSection open onToggle={() => {}} onOpenImage={() => {}} />);
    await flush();
    expect(api.list).toHaveBeenCalledWith("A", "permission");
    expect(screen.getByTestId("tiles").textContent).toBe("2 tiles · canEdit=true");
    access = false;
    rerender(<PermissionsSection open onToggle={() => {}} onOpenImage={() => {}} />);
    expect(screen.getByTestId("tiles").textContent).toContain("canEdit=false");
  });
});
